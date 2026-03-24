do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'indexes'
      and column_name = 'default_ui_depth'
  ) then
    execute 'alter table public.indexes rename column default_ui_depth to default_connection_depth';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'indexes'
      and column_name = 'max_ui_depth'
  ) then
    execute 'alter table public.indexes rename column max_ui_depth to max_connection_depth';
  end if;
end;
$$;

alter table public.connections
  add column if not exists requester_index_id uuid,
  add column if not exists requester_index_url text,
  add column if not exists requester_entity_id uuid,
  add column if not exists requester_entity_url text,
  add column if not exists requester_type text,
  add column if not exists requested_index_id uuid,
  add column if not exists requested_index_url text,
  add column if not exists requested_entity_id uuid,
  add column if not exists requested_entity_url text,
  add column if not exists requested_type text;

alter table public.connections
  alter column source_site_id drop not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'connections'
      and column_name = 'connection_uuid'
  ) then
    update public.connections
    set id = connection_uuid
    where connection_uuid is not null
      and id <> connection_uuid;
  end if;
end;
$$;

create or replace function public.connection_sync_identity_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is null and new.connection_uuid is not null then
    new.id := new.connection_uuid;
  end if;

  if new.connection_uuid is null and new.id is not null then
    new.connection_uuid := new.id;
  end if;

  if new.id is distinct from new.connection_uuid then
    new.connection_uuid := new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists connections_sync_identity_columns on public.connections;

create trigger connections_sync_identity_columns
before insert or update on public.connections
for each row execute function public.connection_sync_identity_columns();

with connection_sources as (
  select
    connection.id,
    coalesce(connection.source_index_id, source_site.parent_index_id) as requester_index_id,
    coalesce(source_index.canonical_url, source_parent_index.canonical_url, source_site.parent_index_url, '') as requester_index_url,
    case
      when connection.source_index_id is not null then null::uuid
      else connection.source_site_id
    end as requester_entity_id,
    case
      when connection.source_index_id is not null then null::text
      else coalesce(source_site.canonical_url, '')
    end as requester_entity_url,
    case
      when connection.source_index_id is not null then 'index'
      else 'site'
    end as requester_type,
    coalesce(connection.target_index_id, target_site.parent_index_id) as requested_index_id,
    coalesce(target_index.canonical_url, target_parent_index.canonical_url, target_site.parent_index_url, '') as requested_index_url,
    case
      when connection.target_index_id is not null then null::uuid
      else connection.target_site_id
    end as requested_entity_id,
    case
      when connection.target_index_id is not null then null::text
      else coalesce(target_site.canonical_url, '')
    end as requested_entity_url,
    case
      when connection.target_index_id is not null then 'index'
      else 'site'
    end as requested_type
  from public.connections connection
  left join public.sites source_site
    on source_site.id = connection.source_site_id
  left join public.indexes source_index
    on source_index.id = connection.source_index_id
  left join public.indexes source_parent_index
    on source_parent_index.id = source_site.parent_index_id
  left join public.sites target_site
    on target_site.id = connection.target_site_id
  left join public.indexes target_index
    on target_index.id = connection.target_index_id
  left join public.indexes target_parent_index
    on target_parent_index.id = target_site.parent_index_id
)
update public.connections connection
set
  requester_index_id = connection_sources.requester_index_id,
  requester_index_url = nullif(connection_sources.requester_index_url, ''),
  requester_entity_id = connection_sources.requester_entity_id,
  requester_entity_url = nullif(connection_sources.requester_entity_url, ''),
  requester_type = connection_sources.requester_type,
  requested_index_id = connection_sources.requested_index_id,
  requested_index_url = nullif(connection_sources.requested_index_url, ''),
  requested_entity_id = connection_sources.requested_entity_id,
  requested_entity_url = nullif(connection_sources.requested_entity_url, ''),
  requested_type = connection_sources.requested_type
from connection_sources
where connection.id = connection_sources.id;

alter table public.connections
  alter column requester_index_id set not null,
  alter column requester_index_url set not null,
  alter column requester_type set not null,
  alter column requested_index_id set not null,
  alter column requested_index_url set not null,
  alter column requested_type set not null;

alter table public.connections
  drop constraint if exists connections_requester_type_check,
  drop constraint if exists connections_requested_type_check;

alter table public.connections
  add constraint connections_requester_type_check
  check (requester_type in ('index', 'site')),
  add constraint connections_requested_type_check
  check (requested_type in ('index', 'site'));

create or replace function public.connection_entity_key(
  p_entity_type text,
  p_index_id uuid,
  p_entity_id uuid
) returns text
language sql
immutable
as $$
  select concat(
    coalesce(nullif(trim(p_entity_type), ''), 'site'),
    ':',
    coalesce(p_index_id::text, ''),
    ':',
    coalesce(p_entity_id::text, '')
  );
$$;

drop index if exists public.connections_pending_pair_idx;
drop index if exists public.connections_approved_pair_idx;
drop index if exists public.connections_pending_index_pair_idx;
drop index if exists public.connections_approved_index_pair_idx;

create unique index if not exists connections_pending_entity_pair_idx
  on public.connections (
    least(
      public.connection_entity_key(requester_type, requester_index_id, requester_entity_id),
      public.connection_entity_key(requested_type, requested_index_id, requested_entity_id)
    ),
    greatest(
      public.connection_entity_key(requester_type, requester_index_id, requester_entity_id),
      public.connection_entity_key(requested_type, requested_index_id, requested_entity_id)
    )
  )
  where status = 'pending';

create unique index if not exists connections_approved_entity_pair_idx
  on public.connections (
    least(
      public.connection_entity_key(requester_type, requester_index_id, requester_entity_id),
      public.connection_entity_key(requested_type, requested_index_id, requested_entity_id)
    ),
    greatest(
      public.connection_entity_key(requester_type, requester_index_id, requester_entity_id),
      public.connection_entity_key(requested_type, requested_index_id, requested_entity_id)
    )
  )
  where status = 'approved';

create index if not exists connections_requester_entity_idx
  on public.connections (requester_index_id, requester_entity_id, requester_type, status, created_at desc);

create index if not exists connections_requested_entity_idx
  on public.connections (requested_index_id, requested_entity_id, requested_type, status, created_at desc);

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
    source_site_id,
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
    requested_type,
    target_index_id
  )
  values (
    v_request_id,
    p_source_site_id,
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
    'index',
    p_target_index_id
  )
  on conflict (id) do update
  set
    source_site_id = excluded.source_site_id,
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
    target_index_id = excluded.target_index_id,
    updated_at = now();
end;
$$;

revoke all on function public.connection_create_site_index(uuid, uuid, uuid) from public;
grant execute on function public.connection_create_site_index(uuid, uuid, uuid) to authenticated;

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
    source_index_id,
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
    requested_type,
    target_index_id
  )
  values (
    v_request_id,
    p_source_index_id,
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
    'index',
    p_target_index_id
  )
  on conflict (id) do update
  set
    source_index_id = excluded.source_index_id,
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
    target_index_id = excluded.target_index_id,
    updated_at = now();

  return query
  select v_request_id, v_request_id, 'approved'::text;
end;
$$;

revoke all on function public.connection_create_index_index(uuid, uuid, uuid) from public;
grant execute on function public.connection_create_index_index(uuid, uuid, uuid) to authenticated;

create or replace function public.index_federation_enqueue_authoritative_snapshot(
  p_target_remote_index_id uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root public.indexes%rowtype;
begin
  select index_row.*
  into v_root
  from public.indexes index_row
  where index_row.type = 'index'
    and index_row.is_root = true
  order by index_row.updated_at desc nulls last, index_row.created_at desc
  limit 1;

  if not found then
    return 0;
  end if;

  perform public.index_federation_enqueue_package(
    gen_random_uuid(),
    v_root.id,
    'index',
    'upsert',
    v_root.id,
    v_root.id,
    null,
    public.index_federation_index_payload(v_root),
    null,
    p_target_remote_index_id
  );

  return 1;
end;
$$;

create or replace function public.index_federation_after_site_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return null;
end;
$$;

create or replace function public.index_federation_after_index_site_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return null;
end;
$$;

create or replace function public.index_federation_apply_package(
  p_package_id uuid,
  p_origin_index_id uuid,
  p_sender_index_id uuid,
  p_entity_type text,
  p_operation text,
  p_entity_id uuid,
  p_index_id uuid,
  p_site_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_root_id uuid := public.index_federation_local_root_id();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_entity_id uuid := coalesce(
    p_entity_id,
    nullif(trim(coalesce(v_payload ->> 'id', '')), '')::uuid
  );
begin
  if p_entity_type <> 'index' then
    insert into public.index_federation_receipts (
      package_id,
      origin_index_id,
      sender_index_id,
      entity_type,
      operation,
      entity_id,
      index_id,
      site_id,
      payload
    )
    values (
      p_package_id,
      p_origin_index_id,
      p_sender_index_id,
      p_entity_type,
      p_operation,
      p_entity_id,
      p_index_id,
      p_site_id,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (package_id) do nothing;

    return jsonb_build_object('status', 'ignored_non_index');
  end if;

  if p_package_id is null
    or p_origin_index_id is null
    or p_sender_index_id is null
    or v_entity_id is null
    or v_entity_id <> p_origin_index_id then
    raise exception 'Index federation package is missing required index fields.';
  end if;

  if exists (
    select 1
    from public.index_federation_receipts receipt
    where receipt.package_id = p_package_id
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  if p_operation not in ('upsert', 'delete') then
    raise exception 'Unsupported federation package operation.';
  end if;

  perform set_config('app.index_federation_suppress', 'on', true);

  if p_operation = 'delete' then
    if v_entity_id = v_local_root_id then
      return jsonb_build_object('status', 'ignored_local_root');
    end if;

    delete from public.indexes
    where id = v_entity_id
      and coalesce(is_root, false) = false;
  else
    insert into public.indexes (
      id,
      owner_user_id,
      slug,
      title,
      description,
      image_url,
      canonical_url,
      repo_full_name,
      repo_url,
      supabase_project_url,
      supabase_publishable_key,
      source,
      type,
      is_root,
      runtime_mode,
      index_level,
      parent_index_id,
      parent_index_url,
      parent_index_level,
      parent_repo_full_name,
      parent_repo_url,
      finalized_at
    )
    values (
      v_entity_id,
      null,
      coalesce(nullif(trim(v_payload ->> 'slug'), ''), 'index-' || left(v_entity_id::text, 8)),
      coalesce(nullif(trim(v_payload ->> 'title'), ''), 'Untitled index'),
      nullif(v_payload ->> 'description', ''),
      nullif(v_payload ->> 'image_url', ''),
      nullif(v_payload ->> 'canonical_url', ''),
      nullif(v_payload ->> 'repo_full_name', ''),
      nullif(v_payload ->> 'repo_url', ''),
      nullif(v_payload ->> 'supabase_project_url', ''),
      coalesce(v_payload ->> 'supabase_publishable_key', ''),
      'federation_mirror',
      coalesce(nullif(trim(v_payload ->> 'type'), ''), 'index'),
      false,
      coalesce(nullif(trim(v_payload ->> 'runtime_mode'), ''), 'scaffold'),
      nullif(trim(coalesce(v_payload ->> 'index_level', '')), '')::int,
      nullif(trim(coalesce(v_payload ->> 'parent_index_id', '')), '')::uuid,
      nullif(v_payload ->> 'parent_index_url', ''),
      nullif(trim(coalesce(v_payload ->> 'parent_index_level', '')), '')::int,
      nullif(v_payload ->> 'parent_repo_full_name', ''),
      nullif(v_payload ->> 'parent_repo_url', ''),
      nullif(trim(coalesce(v_payload ->> 'finalized_at', '')), '')::timestamptz
    )
    on conflict (id) do update set
      slug = excluded.slug,
      title = excluded.title,
      description = excluded.description,
      image_url = excluded.image_url,
      canonical_url = excluded.canonical_url,
      repo_full_name = excluded.repo_full_name,
      repo_url = excluded.repo_url,
      supabase_project_url = excluded.supabase_project_url,
      supabase_publishable_key = excluded.supabase_publishable_key,
      source = excluded.source,
      type = excluded.type,
      runtime_mode = excluded.runtime_mode,
      index_level = excluded.index_level,
      parent_index_id = excluded.parent_index_id,
      parent_index_url = excluded.parent_index_url,
      parent_index_level = excluded.parent_index_level,
      parent_repo_full_name = excluded.parent_repo_full_name,
      parent_repo_url = excluded.parent_repo_url,
      finalized_at = excluded.finalized_at,
      updated_at = now();
  end if;

  insert into public.index_federation_receipts (
    package_id,
    origin_index_id,
    sender_index_id,
    entity_type,
    operation,
    entity_id,
    index_id,
    site_id,
    payload
  )
  values (
    p_package_id,
    p_origin_index_id,
    p_sender_index_id,
    p_entity_type,
    p_operation,
    v_entity_id,
    p_index_id,
    p_site_id,
    v_payload
  )
  on conflict (package_id) do nothing;

  perform public.index_federation_enqueue_package(
    p_package_id,
    p_origin_index_id,
    p_entity_type,
    p_operation,
    v_entity_id,
    v_entity_id,
    null,
    v_payload,
    p_sender_index_id
  );

  return jsonb_build_object('status', 'applied');
end;
$$;

notify pgrst, 'reload schema';
