drop function if exists public.site_connection_search_targets(uuid, text, text, int);
drop function if exists public.site_connection_send_invite(uuid, uuid);
drop function if exists public.site_connection_send_invite(uuid, uuid, uuid);
drop function if exists public.site_connection_list_requests(uuid);
drop function if exists public.site_connection_respond(uuid, text);
drop function if exists public.site_connection_disconnect(uuid);
drop function if exists public.connection_sync_index_membership_internal(uuid, uuid, boolean);
drop function if exists public.rpc_public_explorer_graph();

drop policy if exists "connections_select_public_approved" on public.connections;
drop policy if exists "connections_select_site_owner_admin" on public.connections;

drop trigger if exists connections_sync_identity_columns on public.connections;
drop function if exists public.connection_sync_identity_columns();

alter table public.connections
  drop constraint if exists connections_source_entity_check,
  drop constraint if exists connections_target_entity_check,
  drop constraint if exists connections_source_target_entity_check;

alter table public.connections
  drop column if exists connection_uuid cascade,
  drop column if exists source_site_id cascade,
  drop column if exists source_index_id cascade,
  drop column if exists target_site_id cascade,
  drop column if exists target_index_id cascade;

create policy "connections_select_site_owner_admin" on public.connections
  for select to authenticated
  using (
    (
      requester_type = 'site'
      and requester_entity_id is not null
      and public.site_user_role_for_site(requester_entity_id, auth.uid()) in ('owner', 'admin')
    )
    or (
      requester_type = 'index'
      and public.index_admin_role_for_index(requester_index_id, auth.uid()) in ('owner', 'admin')
    )
    or (
      requested_type = 'site'
      and requested_entity_id is not null
      and public.site_user_role_for_site(requested_entity_id, auth.uid()) in ('owner', 'admin')
    )
    or (
      requested_type = 'index'
      and public.index_admin_role_for_index(requested_index_id, auth.uid()) in ('owner', 'admin')
    )
  );

alter table public.connections
  drop constraint if exists connections_requester_identity_shape_check,
  drop constraint if exists connections_requested_identity_shape_check,
  drop constraint if exists connections_requester_index_url_nonempty_check,
  drop constraint if exists connections_requested_index_url_nonempty_check;

alter table public.connections
  add constraint connections_requester_identity_shape_check
  check (
    (
      requester_type = 'index'
      and requester_entity_id is null
      and requester_entity_url is null
    )
    or (
      requester_type = 'site'
      and requester_entity_id is not null
      and nullif(trim(coalesce(requester_entity_url, '')), '') is not null
    )
  ),
  add constraint connections_requested_identity_shape_check
  check (
    (
      requested_type = 'index'
      and requested_entity_id is null
      and requested_entity_url is null
    )
    or (
      requested_type = 'site'
      and requested_entity_id is not null
      and nullif(trim(coalesce(requested_entity_url, '')), '') is not null
    )
  ),
  add constraint connections_requester_index_url_nonempty_check
  check (nullif(trim(coalesce(requester_index_url, '')), '') is not null),
  add constraint connections_requested_index_url_nonempty_check
  check (nullif(trim(coalesce(requested_index_url, '')), '') is not null);

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
    jsonb_agg(connection_entry order by happened_at desc nulls last, connection_id),
    '[]'::jsonb
  )
  into v_connections
  from (
    select
      connection_rows.connection_id,
      connection_rows.happened_at,
      jsonb_build_object(
        '@id', concat('urn:uuid:', connection_rows.connection_id::text),
        '@type', 'connection',
        'connected_site', jsonb_build_object(
          '@id', connection_rows.connected_url,
          '@type', connection_rows.connected_type,
          'site_id', connection_rows.connected_id::text
        )
      ) as connection_entry
    from (
      select
        c.id as connection_id,
        coalesce(c.responded_at, c.updated_at, c.created_at) as happened_at,
        connected_site.id as connected_id,
        connected_site.canonical_url as connected_url,
        'site'::text as connected_type
      from public.connections c
      join public.sites connected_site
        on connected_site.id =
          case
            when c.requester_entity_id = p_site_id then c.requested_entity_id
            else c.requester_entity_id
          end
      where c.status = 'approved'
        and c.requester_type = 'site'
        and c.requested_type = 'site'
        and (c.requester_entity_id = p_site_id or c.requested_entity_id = p_site_id)
        and nullif(trim(coalesce(connected_site.canonical_url, '')), '') is not null

      union all

      select
        c.id as connection_id,
        coalesce(c.responded_at, c.updated_at, c.created_at) as happened_at,
        connected_index.id as connected_id,
        connected_index.canonical_url as connected_url,
        'index'::text as connected_type
      from public.connections c
      join public.indexes connected_index
        on connected_index.id =
          case
            when c.requester_entity_id = p_site_id then c.requested_index_id
            else c.requester_index_id
          end
      where c.status = 'approved'
        and (
          (
            c.requester_type = 'site'
            and c.requester_entity_id = p_site_id
            and c.requested_type = 'index'
          )
          or (
            c.requester_type = 'index'
            and c.requested_type = 'site'
            and c.requested_entity_id = p_site_id
          )
        )
        and connected_index.type = 'index'
        and nullif(trim(coalesce(connected_index.canonical_url, '')), '') is not null
    ) connection_rows
  ) approved_connections;

  v_links := jsonb_set(v_links, '{connections}', v_connections, true);

  update public.site_drafts
  set
    files = jsonb_set(
      coalesce(files, '{}'::jsonb),
      array[v_links_key],
      to_jsonb(v_links::text),
      true
    ),
    updated_at = now()
  where id = v_owner_draft_id
    and draft_type = 'owner';
end;
$$;

revoke all on function public.connection_sync_site_links_internal(uuid, uuid) from public;
grant execute on function public.connection_sync_site_links_internal(uuid, uuid) to authenticated;

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
  v_source_site public.sites%rowtype;
  v_target_index public.indexes%rowtype;
  v_request_id uuid := coalesce(p_connection_uuid, gen_random_uuid());
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

  select *
  into v_source_site
  from public.sites site_row
  where site_row.id = p_source_site_id;

  if not found then
    raise exception 'Source site not found.';
  end if;

  select *
  into v_target_index
  from public.indexes index_row
  where index_row.id = p_target_index_id
    and index_row.type = 'index';

  if not found then
    raise exception 'Target index not found.';
  end if;

  if v_source_site.parent_index_id is distinct from p_target_index_id then
    raise exception 'Target index must match the site parent index.';
  end if;

  insert into public.connections (
    id,
    source_requested_by_user_id,
    status,
    responded_at,
    responded_by_user_id,
    requester_index_id,
    requester_index_url,
    requester_entity_id,
    requester_entity_url,
    requester_type,
    requested_index_id,
    requested_index_url,
    requested_entity_id,
    requested_entity_url,
    requested_type
  )
  values (
    v_request_id,
    v_user_id,
    'approved',
    now(),
    v_user_id,
    v_source_site.parent_index_id,
    coalesce(v_source_site.parent_index_url, ''),
    p_source_site_id,
    coalesce(v_source_site.canonical_url, ''),
    'site',
    p_target_index_id,
    coalesce(v_target_index.canonical_url, ''),
    null,
    null,
    'index'
  )
  on conflict (id) do update
  set
    source_requested_by_user_id = excluded.source_requested_by_user_id,
    status = excluded.status,
    responded_at = excluded.responded_at,
    responded_by_user_id = excluded.responded_by_user_id,
    requester_index_id = excluded.requester_index_id,
    requester_index_url = excluded.requester_index_url,
    requester_entity_id = excluded.requester_entity_id,
    requester_entity_url = excluded.requester_entity_url,
    requester_type = excluded.requester_type,
    requested_index_id = excluded.requested_index_id,
    requested_index_url = excluded.requested_index_url,
    requested_entity_id = excluded.requested_entity_id,
    requested_entity_url = excluded.requested_entity_url,
    requested_type = excluded.requested_type,
    updated_at = now();
end;
$$;

revoke all on function public.connection_create_site_index(uuid, uuid, uuid) from public;
grant execute on function public.connection_create_site_index(uuid, uuid, uuid) to authenticated;

drop function if exists public.connection_create_index_index(uuid, uuid, uuid);

create or replace function public.connection_create_index_index(
  p_source_index_id uuid,
  p_target_index_id uuid,
  p_connection_uuid uuid default null
) returns table (
  request_id uuid,
  connection_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source_index public.indexes%rowtype;
  v_target_index public.indexes%rowtype;
  v_request_id uuid := coalesce(p_connection_uuid, gen_random_uuid());
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_source_index_id is null or p_target_index_id is null then
    raise exception 'Source index ID and target index ID are required.';
  end if;

  if p_source_index_id = p_target_index_id then
    raise exception 'Source index and target index must be different.';
  end if;

  if public.index_admin_role_for_index(p_source_index_id, v_user_id) not in ('owner', 'admin') then
    raise exception 'Only source index owners/admins can create parent index connections.';
  end if;

  select *
  into v_source_index
  from public.indexes index_row
  where index_row.id = p_source_index_id
    and index_row.type = 'index';

  if not found then
    raise exception 'Source index not found.';
  end if;

  select *
  into v_target_index
  from public.indexes index_row
  where index_row.id = p_target_index_id
    and index_row.type = 'index';

  if not found then
    raise exception 'Target index not found.';
  end if;

  if v_source_index.parent_index_id is distinct from p_target_index_id then
    raise exception 'Source index is not configured with that parent index.';
  end if;

  insert into public.connections (
    id,
    source_requested_by_user_id,
    status,
    responded_at,
    responded_by_user_id,
    requester_index_id,
    requester_index_url,
    requester_entity_id,
    requester_entity_url,
    requester_type,
    requested_index_id,
    requested_index_url,
    requested_entity_id,
    requested_entity_url,
    requested_type
  )
  values (
    v_request_id,
    v_user_id,
    'approved',
    now(),
    v_user_id,
    p_source_index_id,
    coalesce(v_source_index.canonical_url, ''),
    null,
    null,
    'index',
    p_target_index_id,
    coalesce(v_target_index.canonical_url, ''),
    null,
    null,
    'index'
  )
  on conflict (id) do update
  set
    source_requested_by_user_id = excluded.source_requested_by_user_id,
    status = excluded.status,
    responded_at = excluded.responded_at,
    responded_by_user_id = excluded.responded_by_user_id,
    requester_index_id = excluded.requester_index_id,
    requester_index_url = excluded.requester_index_url,
    requester_entity_id = excluded.requester_entity_id,
    requester_entity_url = excluded.requester_entity_url,
    requester_type = excluded.requester_type,
    requested_index_id = excluded.requested_index_id,
    requested_index_url = excluded.requested_index_url,
    requested_entity_id = excluded.requested_entity_id,
    requested_entity_url = excluded.requested_entity_url,
    requested_type = excluded.requested_type,
    updated_at = now();

  return query
  select v_request_id, v_request_id, 'approved'::text;
end;
$$;

revoke all on function public.connection_create_index_index(uuid, uuid, uuid) from public;
grant execute on function public.connection_create_index_index(uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
