alter table public.connections
  alter column source_requested_by_user_id drop not null;

create or replace function public.index_federation_connection_payload(
  p_row public.connections
) returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', p_row.id,
      'status', p_row.status,
      'created_at', p_row.created_at,
      'responded_at', p_row.responded_at,
      'requester_index_id', p_row.requester_index_id,
      'requester_index_url', coalesce(p_row.requester_index_url, ''),
      'requester_entity_id', p_row.requester_entity_id,
      'requester_entity_url', coalesce(p_row.requester_entity_url, ''),
      'requester_type', p_row.requester_type,
      'requested_index_id', p_row.requested_index_id,
      'requested_index_url', coalesce(p_row.requested_index_url, ''),
      'requested_entity_id', p_row.requested_entity_id,
      'requested_entity_url', coalesce(p_row.requested_entity_url, ''),
      'requested_type', p_row.requested_type,
      'source_requested_by_user_id', p_row.source_requested_by_user_id,
      'responded_by_user_id', p_row.responded_by_user_id
    )
  );
$$;

create or replace function public.index_federation_local_user_or_null(
  p_user_id uuid
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id is null then null::uuid
    when exists (
      select 1
      from auth.users user_row
      where user_row.id = p_user_id
    ) then p_user_id
    else null::uuid
  end;
$$;

create or replace function public.index_federation_sync_local_connection_site_links(
  p_site_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid;
begin
  if p_site_id is null then
    return;
  end if;

  select draft.owner_user_id
  into v_actor_user_id
  from public.site_drafts draft
  where draft.site_id = p_site_id
    and draft.draft_type = 'owner'
  order by draft.created_at asc
  limit 1;

  if v_actor_user_id is null then
    return;
  end if;

  perform public.connection_sync_site_links_internal(
    p_site_id,
    v_actor_user_id
  );
end;
$$;

create or replace function public.index_federation_after_connection_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_root_id uuid := public.index_federation_local_root_id();
  v_row public.connections%rowtype;
  v_operation text;
begin
  if current_setting('app.index_federation_suppress', true) = 'on' then
    return null;
  end if;

  if v_local_root_id is null then
    return null;
  end if;

  v_row := case when tg_op = 'DELETE' then old else new end;

  if v_row.requester_index_id is null or v_row.requested_index_id is null then
    return null;
  end if;

  if v_row.requester_index_id <> v_local_root_id
    and v_row.requested_index_id <> v_local_root_id then
    return null;
  end if;

  if v_row.requester_index_id = v_local_root_id
    and v_row.requested_index_id = v_local_root_id then
    return null;
  end if;

  if tg_op = 'UPDATE'
    and public.index_federation_connection_payload(old) = public.index_federation_connection_payload(new) then
    return null;
  end if;

  v_operation := case when tg_op = 'DELETE' then 'delete' else 'upsert' end;

  perform public.index_federation_enqueue_package(
    gen_random_uuid(),
    v_local_root_id,
    'connection',
    v_operation,
    v_row.id,
    v_row.requester_index_id,
    coalesce(v_row.requester_entity_id, v_row.requested_entity_id),
    public.index_federation_connection_payload(v_row),
    null
  );

  return null;
end;
$$;

drop trigger if exists index_federation_after_connection_change on public.connections;
create trigger index_federation_after_connection_change
after insert or update or delete on public.connections
for each row execute function public.index_federation_after_connection_change();

create or replace function public.index_federation_enqueue_authoritative_snapshot(
  p_target_remote_index_id uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root public.indexes%rowtype;
  v_connection public.connections%rowtype;
  v_count int := 0;
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
  v_count := v_count + 1;

  for v_connection in
    select connection_row.*
    from public.connections connection_row
    where (
      connection_row.requester_index_id = v_root.id
      or connection_row.requested_index_id = v_root.id
    )
      and connection_row.requester_index_id is distinct from connection_row.requested_index_id
  loop
    perform public.index_federation_enqueue_package(
      gen_random_uuid(),
      v_root.id,
      'connection',
      'upsert',
      v_connection.id,
      v_connection.requester_index_id,
      coalesce(v_connection.requester_entity_id, v_connection.requested_entity_id),
      public.index_federation_connection_payload(v_connection),
      null,
      p_target_remote_index_id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
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
  v_requester_index_id uuid := nullif(trim(coalesce(v_payload ->> 'requester_index_id', '')), '')::uuid;
  v_requested_index_id uuid := nullif(trim(coalesce(v_payload ->> 'requested_index_id', '')), '')::uuid;
  v_requester_entity_id uuid := nullif(trim(coalesce(v_payload ->> 'requester_entity_id', '')), '')::uuid;
  v_requested_entity_id uuid := nullif(trim(coalesce(v_payload ->> 'requested_entity_id', '')), '')::uuid;
  v_requester_index_url text := nullif(trim(coalesce(v_payload ->> 'requester_index_url', '')), '');
  v_requested_index_url text := nullif(trim(coalesce(v_payload ->> 'requested_index_url', '')), '');
  v_requester_entity_url text := nullif(trim(coalesce(v_payload ->> 'requester_entity_url', '')), '');
  v_requested_entity_url text := nullif(trim(coalesce(v_payload ->> 'requested_entity_url', '')), '');
  v_requester_type text := nullif(trim(coalesce(v_payload ->> 'requester_type', '')), '');
  v_requested_type text := nullif(trim(coalesce(v_payload ->> 'requested_type', '')), '');
  v_connection_status text := case
    when nullif(trim(coalesce(v_payload ->> 'status', '')), '') in ('approved', 'rejected', 'cancelled')
      then trim(v_payload ->> 'status')
    else 'pending'
  end;
  v_source_requested_by_user_id uuid := public.index_federation_local_user_or_null(
    nullif(trim(coalesce(v_payload ->> 'source_requested_by_user_id', '')), '')::uuid
  );
  v_responded_by_user_id uuid := public.index_federation_local_user_or_null(
    nullif(trim(coalesce(v_payload ->> 'responded_by_user_id', '')), '')::uuid
  );
  v_apply_connection_locally boolean := false;
begin
  if p_package_id is null
    or p_origin_index_id is null
    or p_sender_index_id is null
    or v_entity_id is null
    or nullif(trim(coalesce(p_entity_type, '')), '') is null
    or nullif(trim(coalesce(p_operation, '')), '') is null then
    raise exception 'Federation package is missing required fields.';
  end if;

  if exists (
    select 1
    from public.index_federation_receipts receipt
    where receipt.package_id = p_package_id
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  if p_entity_type = 'connection' then
    if v_requester_index_id is null
      or v_requested_index_id is null
      or v_requester_index_url is null
      or v_requested_index_url is null
      or v_requester_type not in ('site', 'index')
      or v_requested_type not in ('site', 'index') then
      raise exception 'Connection federation package is missing required identity fields.';
    end if;

    if v_requester_type = 'site' and (v_requester_entity_id is null or v_requester_entity_url is null) then
      raise exception 'Connection federation requester site is missing its identity.';
    end if;

    if v_requester_type = 'index' and (v_requester_entity_id is not null or v_requester_entity_url is not null) then
      raise exception 'Connection federation requester index cannot include an entity payload.';
    end if;

    if v_requested_type = 'site' and (v_requested_entity_id is null or v_requested_entity_url is null) then
      raise exception 'Connection federation requested site is missing its identity.';
    end if;

    if v_requested_type = 'index' and (v_requested_entity_id is not null or v_requested_entity_url is not null) then
      raise exception 'Connection federation requested index cannot include an entity payload.';
    end if;

    if p_operation not in ('upsert', 'delete') then
      raise exception 'Unsupported connection federation package operation.';
    end if;

    v_apply_connection_locally := v_local_root_id is not null
      and (
        v_requester_index_id = v_local_root_id
        or v_requested_index_id = v_local_root_id
      );

    perform set_config('app.index_federation_suppress', 'on', true);

    if v_apply_connection_locally then
      if p_operation = 'delete' then
        delete from public.connections connection_row
        where connection_row.id = v_entity_id;
      else
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
          v_entity_id,
          v_source_requested_by_user_id,
          v_connection_status,
          nullif(trim(coalesce(v_payload ->> 'responded_at', '')), '')::timestamptz,
          v_responded_by_user_id,
          v_requester_index_id,
          v_requester_index_url,
          v_requester_entity_id,
          v_requester_entity_url,
          v_requester_type,
          v_requested_index_id,
          v_requested_index_url,
          v_requested_entity_id,
          v_requested_entity_url,
          v_requested_type
        )
        on conflict (id) do update set
          source_requested_by_user_id = coalesce(
            connections.source_requested_by_user_id,
            excluded.source_requested_by_user_id
          ),
          status = excluded.status,
          responded_at = excluded.responded_at,
          responded_by_user_id = coalesce(
            connections.responded_by_user_id,
            excluded.responded_by_user_id
          ),
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
      end if;

      if p_operation = 'delete' or v_connection_status <> 'pending' then
        if v_requester_type = 'site' and v_requester_index_id = v_local_root_id then
          perform public.index_federation_sync_local_connection_site_links(v_requester_entity_id);
        end if;

        if v_requested_type = 'site' and v_requested_index_id = v_local_root_id then
          perform public.index_federation_sync_local_connection_site_links(v_requested_entity_id);
        end if;
      end if;
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
      v_requester_index_id,
      coalesce(v_requester_entity_id, v_requested_entity_id),
      v_payload
    )
    on conflict (package_id) do nothing;

    perform public.index_federation_enqueue_package(
      p_package_id,
      p_origin_index_id,
      p_entity_type,
      p_operation,
      v_entity_id,
      v_requester_index_id,
      coalesce(v_requester_entity_id, v_requested_entity_id),
      v_payload,
      p_sender_index_id
    );

    return jsonb_build_object(
      'status',
      case when v_apply_connection_locally then 'applied' else 'forwarded' end
    );
  end if;

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

  if v_entity_id <> p_origin_index_id then
    raise exception 'Index federation package is missing required index fields.';
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

revoke all on function public.index_federation_connection_payload(public.connections) from public;
revoke all on function public.index_federation_local_user_or_null(uuid) from public;
revoke all on function public.index_federation_sync_local_connection_site_links(uuid) from public;
revoke all on function public.index_federation_after_connection_change() from public;

notify pgrst, 'reload schema';
