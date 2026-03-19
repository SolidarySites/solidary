alter table public.indexes
  add column if not exists supabase_project_url text,
  add column if not exists supabase_publishable_key text not null default '';

alter table public.indexes
  drop constraint if exists indexes_source_check;

alter table public.indexes
  add constraint indexes_source_check
  check (source in ('manual', 'index_create', 'federation_mirror'));

update public.indexes index_row
set
  supabase_project_url = credentials.supabase_project_url,
  supabase_publishable_key = credentials.supabase_publishable_key
from public.index_project_credentials credentials
where credentials.index_id = index_row.id
  and (
    coalesce(index_row.supabase_project_url, '') = ''
    or coalesce(index_row.supabase_publishable_key, '') = ''
  );

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
  ),
  edges as (
    select * from site_connection_edges
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
