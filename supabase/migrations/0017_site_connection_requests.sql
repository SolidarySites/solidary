create table if not exists public.site_connection_requests (
  id uuid primary key default gen_random_uuid(),
  connection_uuid uuid not null unique default gen_random_uuid(),
  source_site_id uuid not null references public.sites(id) on delete cascade,
  target_site_id uuid not null references public.sites(id) on delete cascade,
  source_requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by_user_id uuid references auth.users(id) on delete set null,
  check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  check (source_site_id <> target_site_id)
);

create index if not exists site_connection_requests_source_status_idx
  on public.site_connection_requests (source_site_id, status, created_at desc);

create index if not exists site_connection_requests_target_status_idx
  on public.site_connection_requests (target_site_id, status, created_at desc);

create unique index if not exists site_connection_requests_pending_pair_idx
  on public.site_connection_requests (
    least(source_site_id, target_site_id),
    greatest(source_site_id, target_site_id)
  )
  where status = 'pending';

create unique index if not exists site_connection_requests_approved_pair_idx
  on public.site_connection_requests (
    least(source_site_id, target_site_id),
    greatest(source_site_id, target_site_id)
  )
  where status = 'approved';

drop trigger if exists site_connection_requests_set_updated_at on public.site_connection_requests;

create trigger site_connection_requests_set_updated_at
before update on public.site_connection_requests
for each row execute function public.set_updated_at();

alter table public.site_connection_requests enable row level security;

drop policy if exists "site_connection_requests_select_site_owner_admin" on public.site_connection_requests;

create policy "site_connection_requests_select_site_owner_admin" on public.site_connection_requests
  for select using (
    public.site_user_role_for_site(source_site_id, auth.uid()) in ('owner', 'admin')
    or public.site_user_role_for_site(target_site_id, auth.uid()) in ('owner', 'admin')
  );

create or replace function public.site_connection_manifest_append(
  p_owner_draft_id uuid,
  p_connection_uuid uuid,
  p_site_a_id uuid,
  p_site_b_id uuid,
  p_actor_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manifest_key constant text := 'public/.well-known/solidary-links.json';
  v_files jsonb;
  v_manifest_raw text;
  v_manifest jsonb;
  v_connections jsonb;
  v_connection_entry jsonb;
begin
  select coalesce(d.files, '{}'::jsonb)
  into v_files
  from public.site_drafts d
  where d.id = p_owner_draft_id
    and d.draft_type = 'owner'
  for update;

  if not found then
    raise exception 'Owner draft not found.';
  end if;

  if not (v_files ? v_manifest_key) then
    raise exception 'Owner draft is missing public/.well-known/solidary-links.json.';
  end if;

  v_manifest_raw := coalesce(v_files ->> v_manifest_key, '');
  begin
    v_manifest := v_manifest_raw::jsonb;
  exception
    when others then
      raise exception 'Invalid solidary-links.json content on owner draft %.', p_owner_draft_id;
  end;

  if jsonb_typeof(v_manifest) <> 'object' then
    raise exception 'solidary-links.json must be a JSON object.';
  end if;

  v_connections :=
    case
      when jsonb_typeof(v_manifest -> 'connections') = 'array'
        then (v_manifest -> 'connections')
      else '[]'::jsonb
    end;

  if exists (
    select 1
    from jsonb_array_elements(v_connections) as c(entry)
    where c.entry ->> 'connection_uuid' = p_connection_uuid::text
  ) then
    return;
  end if;

  v_connection_entry := jsonb_build_object(
    'connection_uuid', p_connection_uuid::text,
    'site_a_id', p_site_a_id::text,
    'site_b_id', p_site_b_id::text
  );

  v_connections := v_connections || jsonb_build_array(v_connection_entry);
  v_manifest := jsonb_set(v_manifest, '{connections}', v_connections, true);
  v_files := jsonb_set(v_files, array[v_manifest_key], to_jsonb(jsonb_pretty(v_manifest)), true);

  update public.site_drafts
  set
    files = v_files,
    last_edited_by_user_id = p_actor_user_id,
    last_edited_at = now()
  where id = p_owner_draft_id;
end;
$$;

revoke all on function public.site_connection_manifest_append(uuid, uuid, uuid, uuid, uuid) from public;

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
    from public.site_connection_requests r
    where (
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
  v_existing public.site_connection_requests%rowtype;
  v_inserted public.site_connection_requests%rowtype;
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
    from public.site_connection_requests r
    where least(r.source_site_id, r.target_site_id) = least(p_source_site_id, p_target_site_id)
      and greatest(r.source_site_id, r.target_site_id) = greatest(p_source_site_id, p_target_site_id)
      and r.status = 'approved'
  ) then
    raise exception 'These sites are already connected.';
  end if;

  select *
  into v_existing
  from public.site_connection_requests r
  where least(r.source_site_id, r.target_site_id) = least(p_source_site_id, p_target_site_id)
    and greatest(r.source_site_id, r.target_site_id) = greatest(p_source_site_id, p_target_site_id)
    and r.status = 'pending'
  order by r.created_at desc
  limit 1;

  if found then
    return query
    select v_existing.id, v_existing.connection_uuid, v_existing.status;
    return;
  end if;

  insert into public.site_connection_requests (
    source_site_id,
    target_site_id,
    source_requested_by_user_id,
    status
  )
  values (
    p_source_site_id,
    p_target_site_id,
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
  from public.site_connection_requests r
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
  where r.source_site_id = p_site_id
     or r.target_site_id = p_site_id
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
  v_request public.site_connection_requests%rowtype;
  v_source_owner_draft_id uuid;
  v_target_owner_draft_id uuid;
  v_site_a_id uuid;
  v_site_b_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if v_action not in ('approve', 'reject') then
    raise exception 'Action must be approve or reject.';
  end if;

  select *
  into v_request
  from public.site_connection_requests r
  where r.id = p_request_id
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
    update public.site_connection_requests
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
    from public.site_connection_requests r
    where least(r.source_site_id, r.target_site_id) = least(v_request.source_site_id, v_request.target_site_id)
      and greatest(r.source_site_id, r.target_site_id) = greatest(v_request.source_site_id, v_request.target_site_id)
      and r.status = 'approved'
      and r.id <> v_request.id
  ) then
    raise exception 'These sites are already connected.';
  end if;

  update public.site_connection_requests
  set
    status = 'approved',
    responded_at = now(),
    responded_by_user_id = v_user_id
  where id = v_request.id;

  select d.id
  into v_source_owner_draft_id
  from public.site_drafts d
  where d.site_id = v_request.source_site_id
    and d.draft_type = 'owner'
  order by d.created_at asc
  limit 1;

  select d.id
  into v_target_owner_draft_id
  from public.site_drafts d
  where d.site_id = v_request.target_site_id
    and d.draft_type = 'owner'
  order by d.created_at asc
  limit 1;

  if v_source_owner_draft_id is null or v_target_owner_draft_id is null then
    raise exception 'Owner draft missing for one or both sites.';
  end if;

  v_site_a_id := least(v_request.source_site_id, v_request.target_site_id);
  v_site_b_id := greatest(v_request.source_site_id, v_request.target_site_id);

  perform public.site_connection_manifest_append(
    v_source_owner_draft_id,
    v_request.connection_uuid,
    v_site_a_id,
    v_site_b_id,
    v_user_id
  );

  perform public.site_connection_manifest_append(
    v_target_owner_draft_id,
    v_request.connection_uuid,
    v_site_a_id,
    v_site_b_id,
    v_user_id
  );

  return query
  select v_request.id, v_request.connection_uuid, 'approved'::text;
end;
$$;

revoke all on function public.site_connection_respond(uuid, text) from public;
grant execute on function public.site_connection_respond(uuid, text) to authenticated;
