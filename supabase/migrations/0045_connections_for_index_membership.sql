alter table if exists public.site_connection_requests
  rename to connections;

alter table public.connections
  add column if not exists target_index_id uuid references public.indexes(id) on delete cascade;

alter table public.connections
  alter column target_site_id drop not null;

drop index if exists public.site_connection_requests_source_status_idx;
drop index if exists public.site_connection_requests_target_status_idx;
drop index if exists public.site_connection_requests_pending_pair_idx;
drop index if exists public.site_connection_requests_approved_pair_idx;
drop index if exists public.connections_source_status_idx;
drop index if exists public.connections_target_site_status_idx;
drop index if exists public.connections_target_index_status_idx;
drop index if exists public.connections_pending_site_pair_idx;
drop index if exists public.connections_approved_site_pair_idx;
drop index if exists public.connections_pending_index_pair_idx;
drop index if exists public.connections_approved_index_pair_idx;

create index if not exists connections_source_status_idx
  on public.connections (source_site_id, status, created_at desc);

create index if not exists connections_target_site_status_idx
  on public.connections (target_site_id, status, created_at desc)
  where target_site_id is not null;

create index if not exists connections_target_index_status_idx
  on public.connections (target_index_id, status, created_at desc)
  where target_index_id is not null;

create unique index if not exists connections_pending_site_pair_idx
  on public.connections (
    least(source_site_id, target_site_id),
    greatest(source_site_id, target_site_id)
  )
  where target_site_id is not null
    and status = 'pending';

create unique index if not exists connections_approved_site_pair_idx
  on public.connections (
    least(source_site_id, target_site_id),
    greatest(source_site_id, target_site_id)
  )
  where target_site_id is not null
    and status = 'approved';

create unique index if not exists connections_pending_index_pair_idx
  on public.connections (source_site_id, target_index_id)
  where target_index_id is not null
    and status = 'pending';

create unique index if not exists connections_approved_index_pair_idx
  on public.connections (source_site_id, target_index_id)
  where target_index_id is not null
    and status = 'approved';

alter table public.connections
  drop constraint if exists connections_target_entity_check;

alter table public.connections
  add constraint connections_target_entity_check
  check (num_nonnulls(target_site_id, target_index_id) = 1);

drop policy if exists "site_connection_requests_select_site_owner_admin" on public.connections;
drop policy if exists "site_connection_requests_select_public_approved" on public.connections;
drop policy if exists "connections_select_site_owner_admin" on public.connections;
drop policy if exists "connections_select_public_approved" on public.connections;

create policy "connections_select_site_owner_admin" on public.connections
  for select to authenticated
  using (
    public.site_user_role_for_site(source_site_id, auth.uid()) in ('owner', 'admin')
    or (
      target_site_id is not null
      and public.site_user_role_for_site(target_site_id, auth.uid()) in ('owner', 'admin')
    )
  );

create policy "connections_select_public_approved" on public.connections
  for select to anon, authenticated
  using (status = 'approved');

create or replace function public.connection_sync_site_links_internal(
  p_site_id uuid,
  p_actor_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_links_key constant text := 'public/.well-known/solidary-links.json';
  v_owner_draft_id uuid;
  v_files jsonb;
  v_links_raw text;
  v_links jsonb;
  v_connections jsonb := '[]'::jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'Actor user is required.';
  end if;

  select d.id
  into v_owner_draft_id
  from public.site_drafts d
  where d.site_id = p_site_id
    and d.draft_type = 'owner'
  order by d.created_at asc
  limit 1;

  if v_owner_draft_id is null then
    raise exception 'Owner draft not found for site %.', p_site_id;
  end if;

  perform public.site_connection_links_refresh_root(
    v_owner_draft_id,
    p_site_id,
    p_actor_user_id
  );

  select coalesce(d.files, '{}'::jsonb)
  into v_files
  from public.site_drafts d
  where d.id = v_owner_draft_id
    and d.draft_type = 'owner'
  for update;

  v_links_raw := coalesce(v_files ->> v_links_key, '');
  begin
    v_links := v_links_raw::jsonb;
  exception
    when others then
      raise exception 'Invalid solidary-links.json content on owner draft %.', v_owner_draft_id;
  end;

  if jsonb_typeof(v_links) <> 'object' then
    raise exception 'solidary-links.json must be a JSON object.';
  end if;

  select coalesce(
    jsonb_agg(connection_entry order by happened_at desc nulls last, connection_uuid),
    '[]'::jsonb
  )
  into v_connections
  from (
    select
      connection_rows.connection_uuid,
      connection_rows.happened_at,
      jsonb_build_object(
        '@id', concat('urn:uuid:', connection_rows.connection_uuid::text),
        '@type', 'connection',
        'connected_site', jsonb_build_object(
          '@id', connection_rows.connected_url,
          '@type', connection_rows.connected_type,
          'site_id', connection_rows.connected_id::text
        )
      ) as connection_entry
    from (
      select
        c.connection_uuid,
        coalesce(c.responded_at, c.updated_at, c.created_at) as happened_at,
        connected_site.id as connected_id,
        connected_site.canonical_url as connected_url,
        'site'::text as connected_type
      from public.connections c
      join public.sites connected_site
        on connected_site.id =
          case
            when c.source_site_id = p_site_id then c.target_site_id
            else c.source_site_id
          end
      where c.status = 'approved'
        and c.target_site_id is not null
        and (c.source_site_id = p_site_id or c.target_site_id = p_site_id)
        and nullif(trim(coalesce(connected_site.canonical_url, '')), '') is not null

      union all

      select
        c.connection_uuid,
        coalesce(c.responded_at, c.updated_at, c.created_at) as happened_at,
        connected_index.id as connected_id,
        connected_index.canonical_url as connected_url,
        'index'::text as connected_type
      from public.connections c
      join public.indexes connected_index
        on connected_index.id = c.target_index_id
      where c.status = 'approved'
        and c.source_site_id = p_site_id
        and c.target_index_id is not null
        and connected_index.type = 'index'
        and nullif(trim(coalesce(connected_index.canonical_url, '')), '') is not null
    ) connection_rows
  ) approved_connections;

  v_links := jsonb_set(v_links, '{connections}', v_connections, true);
  v_files := jsonb_set(v_files, array[v_links_key], to_jsonb(jsonb_pretty(v_links)), true);

  update public.site_drafts
  set
    files = v_files,
    last_edited_by_user_id = p_actor_user_id,
    last_edited_at = now()
  where id = v_owner_draft_id;
end;
$$;

revoke all on function public.connection_sync_site_links_internal(uuid, uuid) from public;

create or replace function public.site_connection_search_targets(
  p_source_site_id uuid,
  p_query text,
  p_mode text default 'site',
  p_limit int default 20
) returns table (
  target_site_id uuid,
  target_site_title text,
  target_site_description text,
  target_site_url text,
  target_site_image_url text,
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
      s.id as site_id,
      coalesce(s.title, split_part(d.repo_full_name, '/', 2), 'Untitled site') as site_title,
      coalesce(s.description, '') as site_description,
      coalesce(s.canonical_url, '') as site_url,
      coalesce(s.image_url, '') as site_image_url,
      d.owner_user_id,
      coalesce(
        nullif(trim(coalesce(
          u.raw_user_meta_data ->> 'name',
          u.raw_user_meta_data ->> 'user_name',
          u.raw_user_meta_data ->> 'preferred_username',
          ''
        )), ''),
        coalesce(u.email, '')
      ) as owner_display_name,
      coalesce(u.email, '') as owner_email,
      nullif(trim(coalesce(
        u.raw_user_meta_data ->> 'user_name',
        u.raw_user_meta_data ->> 'preferred_username',
        ''
      )), '') as owner_github_login,
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
  )
  select
    c.site_id as target_site_id,
    c.site_title::text as target_site_title,
    c.site_description::text as target_site_description,
    c.site_url::text as target_site_url,
    c.site_image_url::text as target_site_image_url,
    c.owner_user_id as target_owner_user_id,
    c.owner_display_name::text as target_owner_display_name,
    c.owner_email::text as target_owner_email,
    c.owner_github_login::text as target_owner_github_login,
    (
      case
        when rel.status = 'approved' then 'connected'
        when rel.status = 'pending' and rel.source_site_id = p_source_site_id then 'pending_outgoing'
        when rel.status = 'pending' then 'pending_incoming'
        else 'available'
      end
    )::text as existing_state,
    rel.connection_uuid as existing_connection_uuid,
    rel.id as existing_request_id
  from candidate_sites c
  left join lateral (
    select r.id, r.connection_uuid, r.status, r.source_site_id
    from public.connections r
    where r.target_site_id is not null
      and (
        (r.source_site_id = p_source_site_id and r.target_site_id = c.site_id)
        or (r.source_site_id = c.site_id and r.target_site_id = p_source_site_id)
      )
      and r.status in ('pending', 'approved')
    order by
      case when r.status = 'approved' then 0 else 1 end,
      r.created_at desc
    limit 1
  ) rel on true
  order by
    case
      when lower(c.site_title) = lower(v_query) then 0
      when lower(coalesce(c.owner_github_login, '')) = lower(v_query) then 1
      when lower(c.owner_email) = lower(v_query) then 2
      else 3
    end,
    c.updated_at desc
  limit v_limit;
end;
$$;

revoke all on function public.site_connection_search_targets(uuid, text, text, int) from public;
grant execute on function public.site_connection_search_targets(uuid, text, text, int) to authenticated;

create or replace function public.site_connection_send_invite(
  p_source_site_id uuid,
  p_target_site_id uuid
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

  if p_source_site_id is null or p_target_site_id is null then
    raise exception 'Both source and target site IDs are required.';
  end if;

  if p_source_site_id = p_target_site_id then
    raise exception 'Source and target site must be different.';
  end if;

  if public.site_user_role_for_site(p_source_site_id, v_user_id) not in ('owner', 'admin') then
    raise exception 'Only site owners/admins can send connection invites.';
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
    null,
    v_user_id,
    'pending'
  )
  returning *
  into v_inserted;

  return query
  select v_inserted.id, v_inserted.connection_uuid, v_inserted.status;
end;
$$;

revoke all on function public.site_connection_send_invite(uuid, uuid) from public;
grant execute on function public.site_connection_send_invite(uuid, uuid) to authenticated;

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
  target_site_id uuid,
  target_site_title text,
  target_site_url text,
  target_site_image_url text,
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
    r.id as request_id,
    r.connection_uuid,
    r.status,
    r.created_at,
    r.responded_at,
    r.source_site_id,
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
    r.target_site_id,
    coalesce(target_site.title, split_part(target_owner_draft.repo_full_name, '/', 2), 'Untitled site')::text as target_site_title,
    coalesce(target_site.canonical_url, '')::text as target_site_url,
    coalesce(target_site.image_url, '')::text as target_site_image_url,
    coalesce(
      nullif(trim(coalesce(
        target_owner.raw_user_meta_data ->> 'name',
        target_owner.raw_user_meta_data ->> 'user_name',
        target_owner.raw_user_meta_data ->> 'preferred_username',
        ''
      )), ''),
      coalesce(target_owner.email, '')
    )::text as target_owner_display_name,
    (r.target_site_id = p_site_id) as is_incoming
  from public.connections r
  join public.sites source_site
    on source_site.id = r.source_site_id
  join public.sites target_site
    on target_site.id = r.target_site_id
  join public.site_drafts source_owner_draft
    on source_owner_draft.site_id = source_site.id
   and source_owner_draft.draft_type = 'owner'
  join public.site_drafts target_owner_draft
    on target_owner_draft.site_id = target_site.id
   and target_owner_draft.draft_type = 'owner'
  join auth.users source_owner
    on source_owner.id = source_owner_draft.owner_user_id
  join auth.users target_owner
    on target_owner.id = target_owner_draft.owner_user_id
  where r.target_site_id is not null
    and (r.source_site_id = p_site_id or r.target_site_id = p_site_id)
  order by
    case when r.status = 'pending' then 0 else 1 end,
    r.created_at desc;
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
    and r.target_site_id is not null
  for update;

  if not found then
    raise exception 'Connection request not found.';
  end if;

  if public.site_user_role_for_site(v_request.target_site_id, v_user_id) not in ('owner', 'admin') then
    raise exception 'Only target site owners/admins can approve or reject requests.';
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

  update public.connections
  set
    status = 'approved',
    responded_at = now(),
    responded_by_user_id = v_user_id
  where id = v_request.id;

  perform public.connection_sync_site_links_internal(v_request.source_site_id, v_user_id);
  perform public.connection_sync_site_links_internal(v_request.target_site_id, v_user_id);

  return query
  select v_request.id, v_request.connection_uuid, 'approved'::text;
end;
$$;

revoke all on function public.site_connection_respond(uuid, text) from public;
grant execute on function public.site_connection_respond(uuid, text) to authenticated;

create or replace function public.connection_create_site_index(
  p_source_site_id uuid,
  p_target_index_id uuid,
  p_connection_uuid uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.connections%rowtype;
  v_parent_index_id uuid;
  v_connection_uuid uuid := coalesce(p_connection_uuid, gen_random_uuid());
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_source_site_id is null or p_target_index_id is null then
    raise exception 'Both source site and target index IDs are required.';
  end if;

  if public.site_user_role_for_site(p_source_site_id, v_user_id) not in ('owner', 'admin') then
    raise exception 'Only site owners/admins can connect a site to its index.';
  end if;

  select s.parent_index_id
  into v_parent_index_id
  from public.sites s
  where s.id = p_source_site_id;

  if not found then
    raise exception 'Source site not found.';
  end if;

  if v_parent_index_id is null or v_parent_index_id <> p_target_index_id then
    raise exception 'Target index must match the site parent index.';
  end if;

  if not exists (
    select 1
    from public.indexes index_row
    where index_row.id = p_target_index_id
      and index_row.type = 'index'
  ) then
    raise exception 'Target index not found.';
  end if;

  select *
  into v_request
  from public.connections c
  where c.source_site_id = p_source_site_id
    and c.target_index_id = p_target_index_id
    and c.status in ('pending', 'approved')
  order by
    case when c.status = 'approved' then 0 else 1 end,
    c.created_at desc
  limit 1
  for update;

  if found then
    if v_request.status = 'pending' then
      update public.connections
      set
        status = 'approved',
        responded_at = now(),
        responded_by_user_id = v_user_id
      where id = v_request.id;
    end if;

    perform public.connection_sync_site_links_internal(p_source_site_id, v_user_id);
    return;
  end if;

  insert into public.connections (
    connection_uuid,
    source_site_id,
    target_site_id,
    target_index_id,
    source_requested_by_user_id,
    status,
    responded_at,
    responded_by_user_id
  )
  values (
    v_connection_uuid,
    p_source_site_id,
    null,
    p_target_index_id,
    v_user_id,
    'approved',
    now(),
    v_user_id
  );

  perform public.connection_sync_site_links_internal(p_source_site_id, v_user_id);
end;
$$;

revoke all on function public.connection_create_site_index(uuid, uuid, uuid) from public;
grant execute on function public.connection_create_site_index(uuid, uuid, uuid) to authenticated;

create or replace function public.site_connection_sync_site_links(
  p_site_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if public.site_user_role_for_site(p_site_id, v_user_id) not in ('owner', 'admin', 'editor') then
    raise exception 'Only site owners/admins/editors can sync site links.';
  end if;

  perform public.connection_sync_site_links_internal(p_site_id, v_user_id);
end;
$$;

revoke all on function public.site_connection_sync_site_links(uuid) from public;
grant execute on function public.site_connection_sync_site_links(uuid) to authenticated;

create or replace function public.rpc_public_explorer_graph()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with visible_sites as (
    select
      site.id,
      'site'::text as node_type,
      coalesce(nullif(trim(site.title), ''), 'Untitled site') as title,
      coalesce(site.description, '') as description,
      site.canonical_url,
      coalesce(site.image_url, '') as image_url,
      site.updated_at,
      null::int as index_level,
      null::uuid as parent_index_id
    from public.sites site
    where coalesce(site.visibility, 'public') = 'public'
      and nullif(trim(coalesce(site.canonical_url, '')), '') is not null
  ),
  visible_indexes as (
    select
      index_row.id,
      'index'::text as node_type,
      coalesce(nullif(trim(index_row.title), ''), 'Untitled index') as title,
      coalesce(index_row.description, '') as description,
      index_row.canonical_url,
      coalesce(index_row.image_url, '') as image_url,
      index_row.updated_at,
      index_row.index_level,
      index_row.parent_index_id
    from public.indexes index_row
    where index_row.type = 'index'
      and index_row.runtime_mode = 'finalized'
      and nullif(trim(coalesce(index_row.canonical_url, '')), '') is not null
  ),
  nodes as (
    select * from visible_sites
    union all
    select * from visible_indexes
  ),
  site_target_connection_edges as (
    select
      connection.connection_uuid::text as edge_id,
      'site_connection'::text as edge_type,
      connection.source_site_id as source_id,
      connection.target_site_id as target_id,
      connection.responded_at as happened_at
    from public.connections connection
    join visible_sites source_site
      on source_site.id = connection.source_site_id
    join visible_sites target_site
      on target_site.id = connection.target_site_id
    where connection.status = 'approved'
      and connection.target_site_id is not null
      and connection.source_site_id <> connection.target_site_id
  ),
  index_target_connection_edges as (
    select
      connection.connection_uuid::text as edge_id,
      'site_connection'::text as edge_type,
      connection.source_site_id as source_id,
      connection.target_index_id as target_id,
      connection.responded_at as happened_at
    from public.connections connection
    join visible_sites source_site
      on source_site.id = connection.source_site_id
    join visible_indexes target_index
      on target_index.id = connection.target_index_id
    where connection.status = 'approved'
      and connection.target_index_id is not null
  ),
  site_connection_edges as (
    select * from site_target_connection_edges
    union all
    select * from index_target_connection_edges
  ),
  index_connection_edges as (
    select
      concat('index-connection:', child.id::text, ':', parent.id::text) as edge_id,
      'site_connection'::text as edge_type,
      parent.id as source_id,
      child.id as target_id,
      coalesce(child_index.finalized_at, child.updated_at, parent.updated_at) as happened_at
    from public.indexes child_index
    join visible_indexes child
      on child.id = child_index.id
    join visible_indexes parent
      on parent.id = child.parent_index_id
    where child.parent_index_id is not null
      and child.parent_index_id <> child.id
      and child_index.runtime_mode = 'finalized'
  ),
  index_lineage_edges as (
    select
      concat('index-lineage:', child.id::text, ':', parent.id::text) as edge_id,
      'index_lineage'::text as edge_type,
      parent.id as source_id,
      child.id as target_id,
      coalesce(child.updated_at, parent.updated_at) as happened_at
    from visible_indexes child
    join visible_indexes parent
      on parent.id = child.parent_index_id
    where child.parent_index_id is not null
      and child.parent_index_id <> child.id
  ),
  index_membership_edges as (
    select
      concat('index-membership:', membership.index_id::text, ':', membership.site_id::text) as edge_id,
      'index_membership'::text as edge_type,
      membership.index_id as source_id,
      membership.site_id as target_id,
      membership.created_at as happened_at
    from public.index_sites membership
    join visible_indexes index_row
      on index_row.id = membership.index_id
    join visible_sites site
      on site.id = membership.site_id
    where membership.status = 'tracked'
      and not exists (
        select 1
        from public.connections connection
        where connection.source_site_id = membership.site_id
          and connection.target_index_id = membership.index_id
      )
  ),
  edges as (
    select * from site_connection_edges
    union all
    select * from index_connection_edges
    union all
    select * from index_lineage_edges
    union all
    select * from index_membership_edges
  )
  select jsonb_build_object(
    'nodes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', node.id,
            'node_type', node.node_type,
            'title', node.title,
            'description', node.description,
            'canonical_url', node.canonical_url,
            'image_url', node.image_url,
            'updated_at', node.updated_at,
            'index_level', node.index_level,
            'parent_index_id', node.parent_index_id
          )
          order by node.updated_at desc nulls last, node.title, node.id
        )
        from nodes node
      ),
      '[]'::jsonb
    ),
    'edges',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', edge.edge_id,
            'edge_type', edge.edge_type,
            'source_id', edge.source_id,
            'target_id', edge.target_id,
            'happened_at', edge.happened_at
          )
          order by edge.happened_at desc nulls last, edge.edge_id
        )
        from edges edge
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.rpc_public_explorer_graph() from public;
grant execute on function public.rpc_public_explorer_graph() to anon, authenticated;

notify pgrst, 'reload schema';
