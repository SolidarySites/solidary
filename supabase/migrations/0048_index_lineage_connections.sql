alter table public.connections
  add column if not exists source_index_id uuid references public.indexes(id) on delete cascade;

alter table public.connections
  alter column source_site_id drop not null;

drop index if exists public.connections_source_status_idx;
drop index if exists public.connections_pending_index_pair_idx;
drop index if exists public.connections_approved_index_pair_idx;

create index if not exists connections_source_site_status_idx
  on public.connections (source_site_id, status, created_at desc)
  where source_site_id is not null;

create index if not exists connections_source_index_status_idx
  on public.connections (source_index_id, status, created_at desc)
  where source_index_id is not null;

create unique index if not exists connections_pending_site_index_pair_idx
  on public.connections (source_site_id, target_index_id)
  where source_site_id is not null
    and target_index_id is not null
    and status = 'pending';

create unique index if not exists connections_approved_site_index_pair_idx
  on public.connections (source_site_id, target_index_id)
  where source_site_id is not null
    and target_index_id is not null
    and status = 'approved';

create unique index if not exists connections_pending_index_index_pair_idx
  on public.connections (source_index_id, target_index_id)
  where source_index_id is not null
    and target_index_id is not null
    and status = 'pending';

create unique index if not exists connections_approved_index_index_pair_idx
  on public.connections (source_index_id, target_index_id)
  where source_index_id is not null
    and target_index_id is not null
    and status = 'approved';

alter table public.connections
  drop constraint if exists connections_source_entity_check;

alter table public.connections
  add constraint connections_source_entity_check
  check (num_nonnulls(source_site_id, source_index_id) = 1);

alter table public.connections
  drop constraint if exists connections_target_entity_check;

alter table public.connections
  add constraint connections_target_entity_check
  check (num_nonnulls(target_site_id, target_index_id) = 1);

alter table public.connections
  drop constraint if exists connections_source_target_entity_check;

alter table public.connections
  add constraint connections_source_target_entity_check
  check (
    (source_site_id is null or target_site_id is null or source_site_id <> target_site_id)
    and (source_index_id is null or target_index_id is null or source_index_id <> target_index_id)
  );

drop policy if exists "connections_select_site_owner_admin" on public.connections;

create policy "connections_select_site_owner_admin" on public.connections
  for select to authenticated
  using (
    (
      source_site_id is not null
      and public.site_user_role_for_site(source_site_id, auth.uid()) in ('owner', 'admin')
    )
    or (
      source_index_id is not null
      and public.index_admin_role_for_index(source_index_id, auth.uid()) in ('owner', 'admin')
    )
    or (
      target_site_id is not null
      and public.site_user_role_for_site(target_site_id, auth.uid()) in ('owner', 'admin')
    )
    or (
      target_index_id is not null
      and public.index_admin_role_for_index(target_index_id, auth.uid()) in ('owner', 'admin')
    )
  );

create or replace function public.connection_create_index_index(
  p_source_index_id uuid,
  p_target_index_id uuid,
  p_connection_uuid uuid default null
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
  v_connection_uuid uuid := coalesce(p_connection_uuid, gen_random_uuid());
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

  if not exists (
    select 1
    from public.indexes source_index
    where source_index.id = p_source_index_id
      and source_index.parent_index_id = p_target_index_id
      and source_index.type = 'index'
  ) then
    raise exception 'Source index is not configured with that parent index.';
  end if;

  if not exists (
    select 1
    from public.indexes target_index
    where target_index.id = p_target_index_id
      and target_index.type = 'index'
  ) then
    raise exception 'Target index not found.';
  end if;

  select *
  into v_existing
  from public.connections c
  where c.source_index_id = p_source_index_id
    and c.target_index_id = p_target_index_id
    and c.status in ('pending', 'approved')
  order by
    case when c.status = 'approved' then 0 else 1 end,
    c.created_at desc
  limit 1;

  if found then
    return query
    select v_existing.id, v_existing.connection_uuid, v_existing.status;
    return;
  end if;

  insert into public.connections (
    connection_uuid,
    source_site_id,
    source_index_id,
    target_site_id,
    target_index_id,
    source_requested_by_user_id,
    responded_by_user_id,
    status,
    responded_at
  )
  values (
    v_connection_uuid,
    null,
    p_source_index_id,
    null,
    p_target_index_id,
    v_user_id,
    v_user_id,
    'approved',
    now()
  )
  returning *
  into v_inserted;

  return query
  select v_inserted.id, v_inserted.connection_uuid, v_inserted.status;
end;
$$;

revoke all on function public.connection_create_index_index(uuid, uuid, uuid) from public;
grant execute on function public.connection_create_index_index(uuid, uuid, uuid) to authenticated;

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
      and connection.source_site_id is not null
      and connection.target_site_id is not null
      and connection.source_site_id <> connection.target_site_id
  ),
  site_index_connection_edges as (
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
      and connection.source_site_id is not null
      and connection.target_index_id is not null
  ),
  index_index_connection_edges as (
    select
      connection.connection_uuid::text as edge_id,
      'site_connection'::text as edge_type,
      connection.source_index_id as source_id,
      connection.target_index_id as target_id,
      connection.responded_at as happened_at
    from public.connections connection
    join visible_indexes source_index
      on source_index.id = connection.source_index_id
    join visible_indexes target_index
      on target_index.id = connection.target_index_id
    where connection.status = 'approved'
      and connection.source_index_id is not null
      and connection.target_index_id is not null
      and connection.source_index_id <> connection.target_index_id
  ),
  site_connection_edges as (
    select * from site_target_connection_edges
    union all
    select * from site_index_connection_edges
    union all
    select * from index_index_connection_edges
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
      and not exists (
        select 1
        from public.connections connection
        where connection.status = 'approved'
          and connection.source_index_id = child.id
          and connection.target_index_id = parent.id
      )
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
