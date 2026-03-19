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
      archive.id,
      'index'::text as node_type,
      coalesce(nullif(trim(archive.title), ''), 'Untitled index') as title,
      coalesce(archive.description, '') as description,
      archive.canonical_url,
      coalesce(archive.image_url, '') as image_url,
      archive.updated_at,
      archive.index_level,
      archive.parent_index_id
    from public.archives archive
    where archive.type = 'index'
      and archive.runtime_mode = 'finalized'
      and nullif(trim(coalesce(archive.canonical_url, '')), '') is not null
  ),
  nodes as (
    select * from visible_sites
    union all
    select * from visible_indexes
  ),
  site_connection_edges as (
    select
      request.connection_uuid::text as edge_id,
      'site_connection'::text as edge_type,
      request.source_site_id as source_id,
      request.target_site_id as target_id,
      request.responded_at as happened_at
    from public.site_connection_requests request
    join visible_sites source_site
      on source_site.id = request.source_site_id
    join visible_sites target_site
      on target_site.id = request.target_site_id
    where request.status = 'approved'
      and request.source_site_id <> request.target_site_id
  ),
  index_connection_edges as (
    select
      concat('index-connection:', child.id::text, ':', parent.id::text) as edge_id,
      'site_connection'::text as edge_type,
      parent.id as source_id,
      child.id as target_id,
      coalesce(child_archive.finalized_at, child.updated_at, parent.updated_at) as happened_at
    from public.archives child_archive
    join visible_indexes child
      on child.id = child_archive.id
    join visible_indexes parent
      on parent.id = child.parent_index_id
    where child.parent_index_id is not null
      and child.parent_index_id <> child.id
      and child_archive.runtime_mode = 'finalized'
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
      concat('index-membership:', membership.archive_id::text, ':', membership.site_id::text) as edge_id,
      'index_membership'::text as edge_type,
      membership.archive_id as source_id,
      membership.site_id as target_id,
      membership.created_at as happened_at
    from public.archive_sites membership
    join visible_indexes archive
      on archive.id = membership.archive_id
    join visible_sites site
      on site.id = membership.site_id
    where membership.status = 'tracked'
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
