create or replace function public.index_admin_role_for_index(
  p_index_id uuid,
  p_user_id uuid default auth.uid()
) returns text
language sql
security definer
set search_path = public
as $$
  select iam.role::text
  from public.index_admin_memberships iam
  where iam.index_id = p_index_id
    and iam.user_id = p_user_id
  limit 1;
$$;

revoke all on function public.index_admin_role_for_index(uuid, uuid) from public;
grant execute on function public.index_admin_role_for_index(uuid, uuid) to authenticated;

drop policy if exists "connections_select_site_owner_admin" on public.connections;

create policy "connections_select_site_owner_admin" on public.connections
  for select to authenticated
  using (
    public.site_user_role_for_site(source_site_id, auth.uid()) in ('owner', 'admin')
    or (
      target_site_id is not null
      and public.site_user_role_for_site(target_site_id, auth.uid()) in ('owner', 'admin')
    )
    or (
      target_index_id is not null
      and public.index_admin_role_for_index(target_index_id, auth.uid()) in ('owner', 'admin')
    )
  );

create or replace function public.connection_sync_index_membership_internal(
  p_source_site_id uuid,
  p_target_index_id uuid,
  p_is_connected boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_index_id uuid;
begin
  if p_source_site_id is null or p_target_index_id is null then
    raise exception 'Source site ID and target index ID are required.';
  end if;

  select s.parent_index_id
  into v_parent_index_id
  from public.sites s
  where s.id = p_source_site_id;

  if not found then
    raise exception 'Source site not found.';
  end if;

  if p_is_connected then
    insert into public.index_sites (
      index_id,
      site_id,
      status,
      delist_reason_code,
      delist_note
    )
    values (
      p_target_index_id,
      p_source_site_id,
      'tracked',
      null,
      null
    )
    on conflict (index_id, site_id) do update
    set
      status = 'tracked',
      delist_reason_code = null,
      delist_note = null;
    return;
  end if;

  if v_parent_index_id = p_target_index_id then
    insert into public.index_sites (
      index_id,
      site_id,
      status,
      delist_reason_code,
      delist_note
    )
    values (
      p_target_index_id,
      p_source_site_id,
      'tracked',
      null,
      null
    )
    on conflict (index_id, site_id) do update
    set
      status = 'tracked',
      delist_reason_code = null,
      delist_note = null;
    return;
  end if;

  update public.index_sites
  set
    status = 'delisted',
    delist_reason_code = 'connection_removed',
    delist_note = null
  where index_id = p_target_index_id
    and site_id = p_source_site_id;
end;
$$;

revoke all on function public.connection_sync_index_membership_internal(uuid, uuid, boolean) from public;

drop function if exists public.site_connection_search_targets(uuid, text, text, int);

create or replace function public.site_connection_search_targets(
  p_source_site_id uuid,
  p_query text,
  p_mode text default 'site',
  p_limit int default 20
) returns table (
  target_type text,
  target_site_id uuid,
  target_index_id uuid,
  target_title text,
  target_description text,
  target_url text,
  target_image_url text,
  target_owner_user_id uuid,
  target_owner_display_name text,
  target_owner_email text,
  target_owner_github_login text,
  existing_state text,
  existing_connection_uuid uuid,
  existing_request_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := nullif(trim(p_query), '');
  v_mode text := case when lower(coalesce(p_mode, 'site')) = 'user' then 'user' else 'site' end;
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 30));
begin
  if v_user_id is null then
    return;
  end if;

  if v_query is null then
    return;
  end if;

  if public.site_user_role_for_site(p_source_site_id, v_user_id) not in ('owner', 'admin') then
    raise exception 'Only site owners/admins can search connection targets.';
  end if;

  return query
  with candidate_sites as (
    select
      'site'::text as target_type,
      s.id as target_site_id,
      null::uuid as target_index_id,
      coalesce(s.title, split_part(d.repo_full_name, '/', 2), 'Untitled site') as target_title,
      coalesce(s.description, '') as target_description,
      coalesce(s.canonical_url, '') as target_url,
      coalesce(s.image_url, '') as target_image_url,
      d.owner_user_id as target_owner_user_id,
      coalesce(
        nullif(trim(coalesce(
          u.raw_user_meta_data ->> 'name',
          u.raw_user_meta_data ->> 'user_name',
          u.raw_user_meta_data ->> 'preferred_username',
          ''
        )), ''),
        coalesce(u.email, '')
      ) as target_owner_display_name,
      coalesce(u.email, '') as target_owner_email,
      nullif(trim(coalesce(
        u.raw_user_meta_data ->> 'user_name',
        u.raw_user_meta_data ->> 'preferred_username',
        ''
      )), '') as target_owner_github_login,
      s.updated_at
    from public.sites s
    join public.site_drafts d
      on d.site_id = s.id
     and d.draft_type = 'owner'
    join auth.users u
      on u.id = d.owner_user_id
    where s.id <> p_source_site_id
      and (
        (
          v_mode = 'site'
          and (
            coalesce(s.title, '') ilike ('%' || v_query || '%')
            or coalesce(s.description, '') ilike ('%' || v_query || '%')
            or coalesce(s.canonical_url, '') ilike ('%' || v_query || '%')
            or coalesce(d.repo_full_name, '') ilike ('%' || v_query || '%')
          )
        )
        or (
          v_mode = 'user'
          and (
            coalesce(u.email, '') ilike ('%' || v_query || '%')
            or coalesce(u.raw_user_meta_data ->> 'name', '') ilike ('%' || v_query || '%')
            or coalesce(u.raw_user_meta_data ->> 'user_name', '') ilike ('%' || v_query || '%')
            or coalesce(u.raw_user_meta_data ->> 'preferred_username', '') ilike ('%' || v_query || '%')
          )
        )
      )
  ),
  candidate_indexes as (
    select
      'index'::text as target_type,
      null::uuid as target_site_id,
      index_row.id as target_index_id,
      coalesce(nullif(trim(index_row.title), ''), nullif(trim(index_row.slug), ''), 'Untitled index') as target_title,
      coalesce(index_row.description, '') as target_description,
      coalesce(index_row.canonical_url, '') as target_url,
      coalesce(index_row.image_url, '') as target_image_url,
      index_row.owner_user_id as target_owner_user_id,
      coalesce(
        nullif(trim(coalesce(
          owner_user.raw_user_meta_data ->> 'name',
          owner_user.raw_user_meta_data ->> 'user_name',
          owner_user.raw_user_meta_data ->> 'preferred_username',
          ''
        )), ''),
        coalesce(owner_user.email, ''),
        'Unknown'
      ) as target_owner_display_name,
      coalesce(owner_user.email, '') as target_owner_email,
      nullif(trim(coalesce(
        owner_user.raw_user_meta_data ->> 'user_name',
        owner_user.raw_user_meta_data ->> 'preferred_username',
        ''
      )), '') as target_owner_github_login,
      index_row.updated_at
    from public.indexes index_row
    left join public.index_project_credentials credentials
      on credentials.index_id = index_row.id
    left join auth.users owner_user
      on owner_user.id = index_row.owner_user_id
    where index_row.type = 'index'
      and (
        (
          v_mode = 'site'
          and (
            coalesce(index_row.title, '') ilike ('%' || v_query || '%')
            or coalesce(index_row.description, '') ilike ('%' || v_query || '%')
            or coalesce(index_row.canonical_url, '') ilike ('%' || v_query || '%')
            or coalesce(index_row.slug, '') ilike ('%' || v_query || '%')
            or coalesce(credentials.repo_full_name, '') ilike ('%' || v_query || '%')
          )
        )
        or (
          v_mode = 'user'
          and (
            coalesce(owner_user.email, '') ilike ('%' || v_query || '%')
            or coalesce(owner_user.raw_user_meta_data ->> 'name', '') ilike ('%' || v_query || '%')
            or coalesce(owner_user.raw_user_meta_data ->> 'user_name', '') ilike ('%' || v_query || '%')
            or coalesce(owner_user.raw_user_meta_data ->> 'preferred_username', '') ilike ('%' || v_query || '%')
          )
        )
      )
  ),
  candidate_targets as (
    select * from candidate_sites
    union all
    select * from candidate_indexes
  )
  select
    candidate.target_type,
    candidate.target_site_id,
    candidate.target_index_id,
    candidate.target_title::text,
    candidate.target_description::text,
    candidate.target_url::text,
    candidate.target_image_url::text,
    candidate.target_owner_user_id,
    candidate.target_owner_display_name::text,
    candidate.target_owner_email::text,
    candidate.target_owner_github_login::text,
    (
      case
        when relation.status = 'approved' then 'connected'
        when relation.status = 'pending' and relation.source_site_id = p_source_site_id then 'pending_outgoing'
        when relation.status = 'pending' then 'pending_incoming'
        else 'available'
      end
    )::text as existing_state,
    relation.connection_uuid as existing_connection_uuid,
    relation.id as existing_request_id
  from candidate_targets candidate
  left join lateral (
    select r.id, r.connection_uuid, r.status, r.source_site_id
    from public.connections r
    where r.status in ('pending', 'approved')
      and (
        (
          candidate.target_site_id is not null
          and r.target_site_id is not null
          and (
            (r.source_site_id = p_source_site_id and r.target_site_id = candidate.target_site_id)
            or (r.source_site_id = candidate.target_site_id and r.target_site_id = p_source_site_id)
          )
        )
        or (
          candidate.target_index_id is not null
          and r.source_site_id = p_source_site_id
          and r.target_index_id = candidate.target_index_id
        )
      )
    order by
      case when r.status = 'approved' then 0 else 1 end,
      r.created_at desc
    limit 1
  ) relation on true
  order by
    case
      when lower(candidate.target_title) = lower(v_query) then 0
      when lower(coalesce(candidate.target_owner_github_login, '')) = lower(v_query) then 1
      when lower(candidate.target_owner_email) = lower(v_query) then 2
      else 3
    end,
    candidate.updated_at desc
  limit v_limit;
end;
$$;

revoke all on function public.site_connection_search_targets(uuid, text, text, int) from public;
grant execute on function public.site_connection_search_targets(uuid, text, text, int) to authenticated;

drop function if exists public.site_connection_send_invite(uuid, uuid);
drop function if exists public.site_connection_send_invite(uuid, uuid, uuid);

create or replace function public.site_connection_send_invite(
  p_source_site_id uuid,
  p_target_site_id uuid default null,
  p_target_index_id uuid default null
) returns table (
  request_id uuid,
  connection_uuid uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.connections%rowtype;
  v_inserted public.connections%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if num_nonnulls(p_target_site_id, p_target_index_id) <> 1 then
    raise exception 'Exactly one target is required.';
  end if;

  if public.site_user_role_for_site(p_source_site_id, v_user_id) not in ('owner', 'admin') then
    raise exception 'Only site owners/admins can send connection invites.';
  end if;

  if p_target_site_id is not null then
    if p_source_site_id = p_target_site_id then
      raise exception 'Source and target site must be different.';
    end if;

    if exists (
      select 1
      from public.connections r
      where r.target_site_id is not null
        and least(r.source_site_id, r.target_site_id) = least(p_source_site_id, p_target_site_id)
        and greatest(r.source_site_id, r.target_site_id) = greatest(p_source_site_id, p_target_site_id)
        and r.status = 'approved'
    ) then
      raise exception 'These sites are already connected.';
    end if;

    select *
    into v_existing
    from public.connections r
    where r.target_site_id is not null
      and least(r.source_site_id, r.target_site_id) = least(p_source_site_id, p_target_site_id)
      and greatest(r.source_site_id, r.target_site_id) = greatest(p_source_site_id, p_target_site_id)
      and r.status = 'pending'
    order by r.created_at desc
    limit 1;
  else
    if not exists (
      select 1
      from public.indexes index_row
      where index_row.id = p_target_index_id
        and index_row.type = 'index'
    ) then
      raise exception 'Target index not found.';
    end if;

    if exists (
      select 1
      from public.connections r
      where r.source_site_id = p_source_site_id
        and r.target_index_id = p_target_index_id
        and r.status = 'approved'
    ) then
      raise exception 'This site is already connected to that index.';
    end if;

    select *
    into v_existing
    from public.connections r
    where r.source_site_id = p_source_site_id
      and r.target_index_id = p_target_index_id
      and r.status = 'pending'
    order by r.created_at desc
    limit 1;
  end if;

  if found then
    return query
    select v_existing.id, v_existing.connection_uuid, v_existing.status;
    return;
  end if;

  insert into public.connections (
    source_site_id,
    target_site_id,
    target_index_id,
    source_requested_by_user_id,
    status
  )
  values (
    p_source_site_id,
    p_target_site_id,
    p_target_index_id,
    v_user_id,
    'pending'
  )
  returning *
  into v_inserted;

  return query
  select v_inserted.id, v_inserted.connection_uuid, v_inserted.status;
end;
$$;

revoke all on function public.site_connection_send_invite(uuid, uuid, uuid) from public;
grant execute on function public.site_connection_send_invite(uuid, uuid, uuid) to authenticated;

drop function if exists public.site_connection_list_requests(uuid);

create or replace function public.site_connection_list_requests(
  p_site_id uuid
) returns table (
  request_id uuid,
  connection_uuid uuid,
  status text,
  created_at timestamptz,
  responded_at timestamptz,
  source_site_id uuid,
  source_site_title text,
  source_site_url text,
  source_site_image_url text,
  source_owner_display_name text,
  target_type text,
  target_site_id uuid,
  target_index_id uuid,
  target_title text,
  target_url text,
  target_image_url text,
  target_owner_display_name text,
  is_incoming boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  if public.site_user_role_for_site(p_site_id, v_user_id) not in ('owner', 'admin') then
    raise exception 'Only site owners/admins can view connection requests.';
  end if;

  return query
  select
    request_row.id as request_id,
    request_row.connection_uuid,
    request_row.status,
    request_row.created_at,
    request_row.responded_at,
    request_row.source_site_id,
    coalesce(source_site.title, split_part(source_owner_draft.repo_full_name, '/', 2), 'Untitled site')::text as source_site_title,
    coalesce(source_site.canonical_url, '')::text as source_site_url,
    coalesce(source_site.image_url, '')::text as source_site_image_url,
    coalesce(
      nullif(trim(coalesce(
        source_owner.raw_user_meta_data ->> 'name',
        source_owner.raw_user_meta_data ->> 'user_name',
        source_owner.raw_user_meta_data ->> 'preferred_username',
        ''
      )), ''),
      coalesce(source_owner.email, '')
    )::text as source_owner_display_name,
    (case when request_row.target_index_id is not null then 'index' else 'site' end)::text as target_type,
    request_row.target_site_id,
    request_row.target_index_id,
    coalesce(
      target_site.title,
      split_part(target_owner_draft.repo_full_name, '/', 2),
      nullif(trim(target_index.title), ''),
      nullif(trim(target_index.slug), ''),
      case when request_row.target_index_id is not null then 'Untitled index' else 'Untitled site' end
    )::text as target_title,
    coalesce(target_site.canonical_url, target_index.canonical_url, '')::text as target_url,
    coalesce(target_site.image_url, target_index.image_url, '')::text as target_image_url,
    coalesce(
      nullif(trim(coalesce(
        target_site_owner.raw_user_meta_data ->> 'name',
        target_site_owner.raw_user_meta_data ->> 'user_name',
        target_site_owner.raw_user_meta_data ->> 'preferred_username',
        target_index_owner.raw_user_meta_data ->> 'name',
        target_index_owner.raw_user_meta_data ->> 'user_name',
        target_index_owner.raw_user_meta_data ->> 'preferred_username',
        ''
      )), ''),
      coalesce(target_site_owner.email, target_index_owner.email, 'Unknown')
    )::text as target_owner_display_name,
    (request_row.target_site_id = p_site_id) as is_incoming
  from public.connections request_row
  join public.sites source_site
    on source_site.id = request_row.source_site_id
  join public.site_drafts source_owner_draft
    on source_owner_draft.site_id = source_site.id
   and source_owner_draft.draft_type = 'owner'
  join auth.users source_owner
    on source_owner.id = source_owner_draft.owner_user_id
  left join public.sites target_site
    on target_site.id = request_row.target_site_id
  left join public.site_drafts target_owner_draft
    on target_owner_draft.site_id = target_site.id
   and target_owner_draft.draft_type = 'owner'
  left join auth.users target_site_owner
    on target_site_owner.id = target_owner_draft.owner_user_id
  left join public.indexes target_index
    on target_index.id = request_row.target_index_id
  left join auth.users target_index_owner
    on target_index_owner.id = target_index.owner_user_id
  where request_row.source_site_id = p_site_id
     or request_row.target_site_id = p_site_id
  order by
    case when request_row.status = 'pending' then 0 else 1 end,
    request_row.created_at desc;
end;
$$;

revoke all on function public.site_connection_list_requests(uuid) from public;
grant execute on function public.site_connection_list_requests(uuid) to authenticated;

create or replace function public.site_connection_respond(
  p_request_id uuid,
  p_action text
) returns table (
  request_id uuid,
  connection_uuid uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_request public.connections%rowtype;
  v_target_index_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if v_action not in ('approve', 'reject') then
    raise exception 'Action must be approve or reject.';
  end if;

  select *
  into v_request
  from public.connections r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Connection request not found.';
  end if;

  if v_request.target_site_id is not null then
    if public.site_user_role_for_site(v_request.target_site_id, v_user_id) not in ('owner', 'admin') then
      raise exception 'Only target site owners/admins can approve or reject requests.';
    end if;
  else
    v_target_index_role := public.index_admin_role_for_index(v_request.target_index_id, v_user_id);
    if v_target_index_role not in ('owner', 'admin') then
      raise exception 'Only target index owners/admins can approve or reject requests.';
    end if;
  end if;

  if v_request.status <> 'pending' then
    return query
    select v_request.id, v_request.connection_uuid, v_request.status;
    return;
  end if;

  if v_action = 'reject' then
    update public.connections
    set
      status = 'rejected',
      responded_at = now(),
      responded_by_user_id = v_user_id
    where id = v_request.id;

    return query
    select v_request.id, v_request.connection_uuid, 'rejected'::text;
    return;
  end if;

  if v_request.target_site_id is not null then
    if exists (
      select 1
      from public.connections r
      where r.target_site_id is not null
        and least(r.source_site_id, r.target_site_id) = least(v_request.source_site_id, v_request.target_site_id)
        and greatest(r.source_site_id, r.target_site_id) = greatest(v_request.source_site_id, v_request.target_site_id)
        and r.status = 'approved'
        and r.id <> v_request.id
    ) then
      raise exception 'These sites are already connected.';
    end if;
  else
    if exists (
      select 1
      from public.connections r
      where r.source_site_id = v_request.source_site_id
        and r.target_index_id = v_request.target_index_id
        and r.status = 'approved'
        and r.id <> v_request.id
    ) then
      raise exception 'This site is already connected to that index.';
    end if;
  end if;

  update public.connections
  set
    status = 'approved',
    responded_at = now(),
    responded_by_user_id = v_user_id
  where id = v_request.id;

  perform public.connection_sync_site_links_internal(v_request.source_site_id, v_user_id);

  if v_request.target_site_id is not null then
    perform public.connection_sync_site_links_internal(v_request.target_site_id, v_user_id);
  elsif v_request.target_index_id is not null then
    perform public.connection_sync_index_membership_internal(
      v_request.source_site_id,
      v_request.target_index_id,
      true
    );
  end if;

  return query
  select v_request.id, v_request.connection_uuid, 'approved'::text;
end;
$$;

revoke all on function public.site_connection_respond(uuid, text) from public;
grant execute on function public.site_connection_respond(uuid, text) to authenticated;

create or replace function public.site_connection_disconnect(
  p_request_id uuid
) returns table (
  request_id uuid,
  connection_uuid uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.connections%rowtype;
  v_is_authorized boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_request
  from public.connections r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Connection request not found.';
  end if;

  if public.site_user_role_for_site(v_request.source_site_id, v_user_id) in ('owner', 'admin') then
    v_is_authorized := true;
  elsif v_request.target_site_id is not null
    and public.site_user_role_for_site(v_request.target_site_id, v_user_id) in ('owner', 'admin') then
    v_is_authorized := true;
  elsif v_request.target_index_id is not null
    and public.index_admin_role_for_index(v_request.target_index_id, v_user_id) in ('owner', 'admin') then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'Only connection owners/admins can remove this connection.';
  end if;

  if v_request.status not in ('pending', 'approved') then
    return query
    select v_request.id, v_request.connection_uuid, v_request.status;
    return;
  end if;

  update public.connections
  set
    status = 'cancelled',
    responded_at = now(),
    responded_by_user_id = v_user_id
  where id = v_request.id;

  perform public.connection_sync_site_links_internal(v_request.source_site_id, v_user_id);

  if v_request.target_site_id is not null then
    perform public.connection_sync_site_links_internal(v_request.target_site_id, v_user_id);
  elsif v_request.target_index_id is not null and v_request.status = 'approved' then
    perform public.connection_sync_index_membership_internal(
      v_request.source_site_id,
      v_request.target_index_id,
      false
    );
  end if;

  return query
  select v_request.id, v_request.connection_uuid, 'cancelled'::text;
end;
$$;

revoke all on function public.site_connection_disconnect(uuid) from public;
grant execute on function public.site_connection_disconnect(uuid) to authenticated;

notify pgrst, 'reload schema';
