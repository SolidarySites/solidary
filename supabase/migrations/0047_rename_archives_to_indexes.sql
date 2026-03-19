do $$
begin
  if exists (
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'archives'
      and relkind = 'r'
  ) and not exists (
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'indexes'
      and relkind = 'r'
  ) then
    execute 'alter table public.archives rename to indexes';
  end if;

  if exists (
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'archive_sites'
      and relkind = 'r'
  ) and not exists (
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'index_sites'
      and relkind = 'r'
  ) then
    execute 'alter table public.archive_sites rename to index_sites';
  end if;

  if exists (
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'archive_membership_events'
      and relkind = 'r'
  ) and not exists (
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'index_membership_events'
      and relkind = 'r'
  ) then
    execute 'alter table public.archive_membership_events rename to index_membership_events';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'index_sites' and column_name = 'archive_id'
  ) then
    execute 'alter table public.index_sites rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'index_membership_events' and column_name = 'archive_id'
  ) then
    execute 'alter table public.index_membership_events rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_observations' and column_name = 'archive_id'
  ) then
    execute 'alter table public.site_observations rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_snapshots' and column_name = 'archive_id'
  ) then
    execute 'alter table public.site_snapshots rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'edge_verification_events' and column_name = 'archive_id'
  ) then
    execute 'alter table public.edge_verification_events rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'index_admin_memberships' and column_name = 'archive_id'
  ) then
    execute 'alter table public.index_admin_memberships rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'index_project_credentials' and column_name = 'archive_id'
  ) then
    execute 'alter table public.index_project_credentials rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'index_finalization_jobs' and column_name = 'archive_id'
  ) then
    execute 'alter table public.index_finalization_jobs rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'index_provision_jobs' and column_name = 'archive_id'
  ) then
    execute 'alter table public.index_provision_jobs rename column archive_id to index_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'index_provision_jobs' and column_name = 'archive_payload'
  ) then
    execute 'alter table public.index_provision_jobs rename column archive_payload to index_payload';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'connections' and column_name = 'target_archive_id'
  ) then
    execute 'alter table public.connections rename column target_archive_id to target_index_id';
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.indexes'::regclass and tgname = 'archives_set_updated_at') then
    execute 'alter trigger archives_set_updated_at on public.indexes rename to indexes_set_updated_at';
  end if;

  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archives_pkey') then
    execute 'alter table public.indexes rename constraint archives_pkey to indexes_pkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archives_slug_key') then
    execute 'alter table public.indexes rename constraint archives_slug_key to indexes_slug_key';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archives_source_check') then
    execute 'alter table public.indexes rename constraint archives_source_check to indexes_source_check';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archives_type_check') then
    execute 'alter table public.indexes rename constraint archives_type_check to indexes_type_check';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archives_runtime_mode_check') then
    execute 'alter table public.indexes rename constraint archives_runtime_mode_check to indexes_runtime_mode_check';
  end if;

  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archive_sites_pkey') then
    execute 'alter table public.index_sites rename constraint archive_sites_pkey to index_sites_pkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archive_sites_archive_id_fkey') then
    execute 'alter table public.index_sites rename constraint archive_sites_archive_id_fkey to index_sites_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archive_sites_site_id_fkey') then
    execute 'alter table public.index_sites rename constraint archive_sites_site_id_fkey to index_sites_site_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archive_sites_status_check') then
    execute 'alter table public.index_sites rename constraint archive_sites_status_check to index_sites_status_check';
  end if;

  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archive_membership_events_pkey') then
    execute 'alter table public.index_membership_events rename constraint archive_membership_events_pkey to index_membership_events_pkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archive_membership_events_archive_id_fkey') then
    execute 'alter table public.index_membership_events rename constraint archive_membership_events_archive_id_fkey to index_membership_events_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'archive_membership_events_site_id_fkey') then
    execute 'alter table public.index_membership_events rename constraint archive_membership_events_site_id_fkey to index_membership_events_site_id_fkey';
  end if;

  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'connections_target_archive_id_fkey') then
    execute 'alter table public.connections rename constraint connections_target_archive_id_fkey to connections_target_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'edge_verification_events_archive_id_fkey') then
    execute 'alter table public.edge_verification_events rename constraint edge_verification_events_archive_id_fkey to edge_verification_events_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'index_admin_memberships_archive_id_fkey') then
    execute 'alter table public.index_admin_memberships rename constraint index_admin_memberships_archive_id_fkey to index_admin_memberships_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'index_finalization_jobs_archive_id_fkey') then
    execute 'alter table public.index_finalization_jobs rename constraint index_finalization_jobs_archive_id_fkey to index_finalization_jobs_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'index_project_credentials_archive_id_fkey') then
    execute 'alter table public.index_project_credentials rename constraint index_project_credentials_archive_id_fkey to index_project_credentials_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'index_provision_jobs_archive_id_fkey') then
    execute 'alter table public.index_provision_jobs rename constraint index_provision_jobs_archive_id_fkey to index_provision_jobs_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'site_observations_archive_id_fkey') then
    execute 'alter table public.site_observations rename constraint site_observations_archive_id_fkey to site_observations_index_id_fkey';
  end if;
  if exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = 'site_snapshots_archive_id_fkey') then
    execute 'alter table public.site_snapshots rename constraint site_snapshots_archive_id_fkey to site_snapshots_index_id_fkey';
  end if;
end
$$;

alter index if exists public.archives_is_root_idx rename to indexes_is_root_idx;
alter index if exists public.archives_parent_index_idx rename to indexes_parent_index_idx;
alter index if exists public.archives_runtime_mode_idx rename to indexes_runtime_mode_idx;
alter index if exists public.archives_type_idx rename to indexes_type_idx;
alter index if exists public.archive_sites_status_idx rename to index_sites_status_idx;
alter index if exists public.archive_membership_events_site_idx rename to index_membership_events_site_idx;
alter index if exists public.connections_target_archive_status_idx rename to connections_target_index_status_idx;
alter index if exists public.connections_pending_archive_pair_idx rename to connections_pending_index_pair_idx;
alter index if exists public.connections_approved_archive_pair_idx rename to connections_approved_index_pair_idx;
alter index if exists public.index_finalization_jobs_archive_created_idx rename to index_finalization_jobs_index_created_idx;
alter index if exists public.site_observations_archive_idx rename to site_observations_index_idx;

drop policy if exists "archives_select_owner" on public.indexes;
drop policy if exists "archives_insert_owner" on public.indexes;
drop policy if exists "archives_update_owner" on public.indexes;
drop policy if exists "archives_select_public_root_index" on public.indexes;
drop policy if exists "indexes_select_owner" on public.indexes;
drop policy if exists "indexes_insert_owner" on public.indexes;
drop policy if exists "indexes_update_owner" on public.indexes;
drop policy if exists "indexes_select_public_root_index" on public.indexes;

create policy "indexes_select_owner" on public.indexes
  for select using (auth.uid() = owner_user_id);

create policy "indexes_insert_owner" on public.indexes
  for insert with check (auth.uid() = owner_user_id);

create policy "indexes_update_owner" on public.indexes
  for update using (auth.uid() = owner_user_id);

create policy "indexes_select_public_root_index" on public.indexes
  for select to anon, authenticated using (type = 'index' and is_root = true);

drop policy if exists "archive_sites_select_owner" on public.index_sites;
drop policy if exists "archive_sites_insert_owner" on public.index_sites;
drop policy if exists "archive_sites_update_owner" on public.index_sites;
drop policy if exists "archive_sites_delete_owner" on public.index_sites;
drop policy if exists "archive_sites_insert_root_site_owner" on public.index_sites;
drop policy if exists "index_sites_select_owner" on public.index_sites;
drop policy if exists "index_sites_insert_owner" on public.index_sites;
drop policy if exists "index_sites_update_owner" on public.index_sites;
drop policy if exists "index_sites_delete_owner" on public.index_sites;
drop policy if exists "index_sites_select_public_tracked" on public.index_sites;
drop policy if exists "index_sites_insert_root_site_owner" on public.index_sites;

create policy "index_sites_select_owner" on public.index_sites
  for select using (
    exists (
      select 1
      from public.indexes index_row
      where index_row.id = index_sites.index_id
        and index_row.owner_user_id = auth.uid()
    )
  );

create policy "index_sites_insert_owner" on public.index_sites
  for insert with check (
    exists (
      select 1
      from public.indexes index_row
      where index_row.id = index_sites.index_id
        and index_row.owner_user_id = auth.uid()
    )
  );

create policy "index_sites_update_owner" on public.index_sites
  for update using (
    exists (
      select 1
      from public.indexes index_row
      where index_row.id = index_sites.index_id
        and index_row.owner_user_id = auth.uid()
    )
  );

create policy "index_sites_delete_owner" on public.index_sites
  for delete using (
    exists (
      select 1
      from public.indexes index_row
      where index_row.id = index_sites.index_id
        and index_row.owner_user_id = auth.uid()
    )
  );

create policy "index_sites_select_public_tracked" on public.index_sites
  for select to anon, authenticated using (status = 'tracked');

create policy "index_sites_insert_root_site_owner" on public.index_sites
  for insert to authenticated with check (
    status = 'tracked'
    and exists (
      select 1
      from public.indexes index_row
      where index_row.id = index_sites.index_id
        and index_row.type = 'index'
        and index_row.is_root = true
    )
    and public.site_user_role_for_site(index_sites.site_id, auth.uid()) = 'owner'
  );

drop function if exists public.index_admin_role_for_archive(uuid, uuid);
drop function if exists public.connection_sync_archive_membership_internal(uuid, uuid, boolean);

create or replace function public.rpc_edges_for_site(
  index_id uuid,
  site_id uuid
) returns setof public.edges
language sql
security definer
set search_path = public
as $$
  select e.*
  from public.edges e
  join public.index_sites i
    on i.site_id = e.source_site_id
   and i.index_id = rpc_edges_for_site.index_id
  join public.indexes idx
    on idx.id = i.index_id
  where idx.owner_user_id = auth.uid()
    and i.status = 'tracked'
    and e.source_site_id = rpc_edges_for_site.site_id;
$$;

create or replace function public.rpc_graph_traverse(
  index_id uuid,
  start_site_id uuid,
  depth int,
  kinds text[] default null,
  verification text[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if depth is null or depth < 1 then
    return jsonb_build_object('nodes', '[]'::jsonb, 'edges', '[]'::jsonb);
  end if;

  with recursive graph as (
    select
      e.id,
      e.source_site_id,
      e.target_type,
      e.target_site_url,
      e.target_doc_url,
      e.target_external_url,
      e.kind,
      1 as hop
    from public.edges e
    join public.index_sites i
      on i.site_id = e.source_site_id
     and i.index_id = rpc_graph_traverse.index_id
    join public.indexes idx
      on idx.id = i.index_id
    where idx.owner_user_id = auth.uid()
      and i.status = 'tracked'
      and e.source_site_id = rpc_graph_traverse.start_site_id
      and (kinds is null or e.kind = any(kinds))

    union all

    select
      e.id,
      e.source_site_id,
      e.target_type,
      e.target_site_url,
      e.target_doc_url,
      e.target_external_url,
      e.kind,
      g.hop + 1
    from public.edges e
    join graph g on g.target_type = 'site'
    join public.sites s on s.canonical_url = g.target_site_url
    join public.index_sites i
      on i.site_id = e.source_site_id
     and i.index_id = rpc_graph_traverse.index_id
    join public.indexes idx
      on idx.id = i.index_id
    where idx.owner_user_id = auth.uid()
      and i.status = 'tracked'
      and e.source_site_id = s.id
      and g.hop < rpc_graph_traverse.depth
      and (kinds is null or e.kind = any(kinds))
  ),
  nodes as (
    select distinct g.source_site_id as site_id
    from graph g
  )
  select jsonb_build_object(
    'nodes', coalesce(jsonb_agg(distinct jsonb_build_object('site_id', n.site_id)), '[]'::jsonb),
    'edges', coalesce(jsonb_agg(distinct jsonb_build_object(
      'id', g.id,
      'source_site_id', g.source_site_id,
      'target_type', g.target_type,
      'target_site_url', g.target_site_url,
      'target_doc_url', g.target_doc_url,
      'target_external_url', g.target_external_url,
      'kind', g.kind,
      'hop', g.hop
    )), '[]'::jsonb)
  ) into result
  from graph g
  left join nodes n on n.site_id = g.source_site_id;

  return result;
end;
$$;


create or replace function public.index_search_collaborator_candidates(
  p_index_id uuid,
  p_actor_user_id uuid,
  p_query text,
  p_limit int default 10
) returns table (
  user_id uuid,
  email text,
  display_name text,
  github_login text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 10), 10));
  v_role text;
begin
  if p_index_id is null or p_actor_user_id is null or v_query is null then
    return;
  end if;

  select iam.role
  into v_role
  from public.index_admin_memberships iam
  where iam.index_id = p_index_id
    and iam.user_id = p_actor_user_id;

  if v_role is null or v_role not in ('owner', 'admin') then
    return;
  end if;

  return query
  select
    u.id::uuid as user_id,
    coalesce(u.email, '')::text as email,
    coalesce(
      nullif(trim(coalesce(
        u.raw_user_meta_data ->> 'name',
        u.raw_user_meta_data ->> 'user_name',
        u.raw_user_meta_data ->> 'preferred_username',
        ''
      )), ''),
      coalesce(u.email, '')
    )::text as display_name,
    nullif(trim(coalesce(
      u.raw_user_meta_data ->> 'user_name',
      u.raw_user_meta_data ->> 'preferred_username',
      ''
    )), '')::text as github_login
  from auth.users u
  where u.id <> p_actor_user_id
    and (
      coalesce(u.email, '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'name', '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'user_name', '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'preferred_username', '') ilike ('%' || v_query || '%')
    )
  order by
    case
      when lower(coalesce(u.raw_user_meta_data ->> 'user_name', '')) = lower(v_query) then 0
      when lower(coalesce(u.email, '')) = lower(v_query) then 1
      else 2
    end,
    coalesce(u.last_sign_in_at, u.created_at) desc
  limit v_limit;
end;
$$;

revoke all on function public.index_search_collaborator_candidates(uuid, uuid, text, int) from public;
grant execute on function public.index_search_collaborator_candidates(uuid, uuid, text, int) to authenticated;

notify pgrst, 'reload schema';


create or replace function public.rpc_index_federation_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root public.indexes%rowtype;
  v_memberships jsonb := '[]'::jsonb;
begin
  select index_row.*
  into v_root
  from public.indexes index_row
  where index_row.type = 'index'
    and index_row.is_root = true
  order by index_row.updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'index', null,
      'memberships', '[]'::jsonb,
      'connection', null
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'site_id', site.id,
        'canonical_url', site.canonical_url,
        'title', coalesce(nullif(trim(site.title), ''), 'Untitled site'),
        'description', coalesce(site.description, ''),
        'image_url', coalesce(site.image_url, ''),
        'updated_at', site.updated_at,
        'tracked_at', membership.created_at
      )
      order by membership.created_at desc, site.id
    ),
    '[]'::jsonb
  )
  into v_memberships
  from public.index_sites membership
  join public.sites site
    on site.id = membership.site_id
  where membership.index_id = v_root.id
    and membership.status = 'tracked'
    and coalesce(site.visibility, 'public') = 'public'
    and nullif(trim(coalesce(site.canonical_url, '')), '') is not null;

  return jsonb_build_object(
    'index',
    jsonb_strip_nulls(
      jsonb_build_object(
        'id', v_root.id,
        'slug', v_root.slug,
        'title', v_root.title,
        'description', coalesce(v_root.description, ''),
        'canonical_url', v_root.canonical_url,
        'image_url', coalesce(v_root.image_url, ''),
        'updated_at', v_root.updated_at,
        'type', v_root.type,
        'is_root', v_root.is_root,
        'runtime_mode', v_root.runtime_mode,
        'index_level', v_root.index_level,
        'finalized_at', v_root.finalized_at,
        'parent_index_id', v_root.parent_index_id,
        'parent_index_url', v_root.parent_index_url,
        'parent_index_level', v_root.parent_index_level,
        'parent_repo_full_name', v_root.parent_repo_full_name,
        'parent_repo_url', v_root.parent_repo_url,
        'repo_full_name', v_root.repo_full_name,
        'repo_url', v_root.repo_url,
        'supabase_project_url', coalesce(v_root.supabase_project_url, ''),
        'supabase_publishable_key', coalesce(v_root.supabase_publishable_key, '')
      )
    ),
    'memberships', v_memberships,
    'connection',
    jsonb_build_object(
      'project_url', coalesce(v_root.supabase_project_url, ''),
      'publishable_key', coalesce(v_root.supabase_publishable_key, '')
    )
  );
end;
$$;

revoke all on function public.rpc_index_federation_state() from public;
grant execute on function public.rpc_index_federation_state() to anon, authenticated;


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
