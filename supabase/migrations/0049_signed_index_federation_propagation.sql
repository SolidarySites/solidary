create extension if not exists pg_net with schema extensions;

create table if not exists public.index_federation_peers (
  local_index_id uuid not null references public.indexes(id) on delete cascade,
  remote_index_id uuid not null,
  remote_project_url text not null,
  remote_publishable_key text not null,
  shared_secret text not null,
  relationship text not null default 'child',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (local_index_id, remote_index_id),
  check (relationship in ('parent', 'child'))
);

create index if not exists index_federation_peers_remote_idx
  on public.index_federation_peers (remote_index_id);

drop trigger if exists index_federation_peers_set_updated_at
on public.index_federation_peers;

create trigger index_federation_peers_set_updated_at
before update on public.index_federation_peers
for each row execute function public.set_updated_at();

create table if not exists public.index_federation_outbox (
  package_id uuid primary key default gen_random_uuid(),
  origin_index_id uuid not null,
  entity_type text not null,
  operation text not null,
  entity_id uuid,
  index_id uuid,
  site_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (entity_type in ('index', 'site', 'index_site')),
  check (operation in ('upsert', 'delete', 'delist'))
);

drop trigger if exists index_federation_outbox_set_updated_at
on public.index_federation_outbox;

create trigger index_federation_outbox_set_updated_at
before update on public.index_federation_outbox
for each row execute function public.set_updated_at();

create table if not exists public.index_federation_deliveries (
  package_id uuid not null references public.index_federation_outbox(package_id) on delete cascade,
  remote_index_id uuid not null,
  status text not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  request_id bigint,
  dispatched_at timestamptz,
  claimed_at timestamptz,
  last_response_code int,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (package_id, remote_index_id),
  check (status in ('pending', 'dispatching', 'retry', 'sent', 'failed'))
);

create index if not exists index_federation_deliveries_due_idx
  on public.index_federation_deliveries (status, next_attempt_at, created_at);

alter table public.index_federation_deliveries
  add column if not exists request_id bigint;

alter table public.index_federation_deliveries
  add column if not exists dispatched_at timestamptz;

drop trigger if exists index_federation_deliveries_set_updated_at
on public.index_federation_deliveries;

create trigger index_federation_deliveries_set_updated_at
before update on public.index_federation_deliveries
for each row execute function public.set_updated_at();

create table if not exists public.index_federation_receipts (
  package_id uuid primary key,
  origin_index_id uuid not null,
  sender_index_id uuid not null,
  entity_type text not null,
  operation text not null,
  entity_id uuid,
  index_id uuid,
  site_id uuid,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  check (entity_type in ('index', 'site', 'index_site')),
  check (operation in ('upsert', 'delete', 'delist'))
);

alter table public.index_federation_peers enable row level security;
alter table public.index_federation_outbox enable row level security;
alter table public.index_federation_deliveries enable row level security;
alter table public.index_federation_receipts enable row level security;

revoke all on public.index_federation_peers from public, anon, authenticated;
revoke all on public.index_federation_outbox from public, anon, authenticated;
revoke all on public.index_federation_deliveries from public, anon, authenticated;
revoke all on public.index_federation_receipts from public, anon, authenticated;

create or replace function public.index_federation_local_root_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select index_row.id
  from public.indexes index_row
  where index_row.type = 'index'
    and index_row.is_root = true
  order by index_row.updated_at desc nulls last, index_row.created_at desc
  limit 1;
$$;

create or replace function public.index_federation_index_payload(
  p_row public.indexes
) returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', p_row.id,
      'slug', p_row.slug,
      'title', p_row.title,
      'description', coalesce(p_row.description, ''),
      'canonical_url', coalesce(p_row.canonical_url, ''),
      'image_url', coalesce(p_row.image_url, ''),
      'source', coalesce(p_row.source, ''),
      'type', coalesce(p_row.type, 'index'),
      'is_root', coalesce(p_row.is_root, false),
      'runtime_mode', coalesce(p_row.runtime_mode, 'scaffold'),
      'index_level', p_row.index_level,
      'parent_index_id', p_row.parent_index_id,
      'parent_index_url', coalesce(p_row.parent_index_url, ''),
      'parent_index_level', p_row.parent_index_level,
      'parent_repo_full_name', coalesce(p_row.parent_repo_full_name, ''),
      'parent_repo_url', coalesce(p_row.parent_repo_url, ''),
      'repo_full_name', coalesce(p_row.repo_full_name, ''),
      'repo_url', coalesce(p_row.repo_url, ''),
      'supabase_project_url', coalesce(p_row.supabase_project_url, ''),
      'supabase_publishable_key', coalesce(p_row.supabase_publishable_key, ''),
      'finalized_at', p_row.finalized_at,
      'updated_at', p_row.updated_at
    )
  );
$$;

create or replace function public.index_federation_site_payload(
  p_row public.sites
) returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', p_row.id,
      'canonical_url', coalesce(p_row.canonical_url, ''),
      'title', coalesce(p_row.title, ''),
      'description', coalesce(p_row.description, ''),
      'image_url', coalesce(p_row.image_url, ''),
      'visibility', coalesce(p_row.visibility, 'public'),
      'protocol_version', coalesce(p_row.protocol_version, '1.0'),
      'last_manifest_hash', coalesce(p_row.last_manifest_hash, ''),
      'meta', coalesce(p_row.meta, '{}'::jsonb),
      'parent_index_id', p_row.parent_index_id,
      'parent_index_url', coalesce(p_row.parent_index_url, ''),
      'parent_index_level', p_row.parent_index_level,
      'updated_at', p_row.updated_at
    )
  );
$$;

create or replace function public.index_federation_index_site_payload(
  p_row public.index_sites
) returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'index_id', p_row.index_id,
      'site_id', p_row.site_id,
      'status', p_row.status,
      'delist_reason_code', coalesce(p_row.delist_reason_code, ''),
      'delist_note', coalesce(p_row.delist_note, ''),
      'created_at', p_row.created_at
    )
  );
$$;

create or replace function public.index_federation_wake_dispatcher()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.index_federation_dispatch_due_deliveries(50);
  perform public.index_federation_reconcile_deliveries();

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.index_federation_enqueue_package(
  p_package_id uuid,
  p_origin_index_id uuid,
  p_entity_type text,
  p_operation text,
  p_entity_id uuid,
  p_index_id uuid,
  p_site_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_excluded_remote_index_id uuid default null,
  p_only_remote_index_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package_id uuid := coalesce(p_package_id, gen_random_uuid());
  v_local_root_id uuid := public.index_federation_local_root_id();
begin
  if v_local_root_id is null or p_origin_index_id is null then
    return v_package_id;
  end if;

  insert into public.index_federation_outbox (
    package_id,
    origin_index_id,
    entity_type,
    operation,
    entity_id,
    index_id,
    site_id,
    payload
  )
  values (
    v_package_id,
    p_origin_index_id,
    p_entity_type,
    p_operation,
    p_entity_id,
    p_index_id,
    p_site_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (package_id) do nothing;

  insert into public.index_federation_deliveries (
    package_id,
    remote_index_id
  )
  select
    v_package_id,
    peer.remote_index_id
  from public.index_federation_peers peer
  where peer.local_index_id = v_local_root_id
    and peer.is_active = true
    and (
      p_excluded_remote_index_id is null
      or peer.remote_index_id <> p_excluded_remote_index_id
    )
    and (
      p_only_remote_index_id is null
      or peer.remote_index_id = p_only_remote_index_id
    )
  on conflict (package_id, remote_index_id) do nothing;

  perform public.index_federation_wake_dispatcher();
  return v_package_id;
end;
$$;

create or replace function public.index_federation_enqueue_authoritative_snapshot(
  p_target_remote_index_id uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root public.indexes%rowtype;
  v_site public.sites%rowtype;
  v_membership public.index_sites%rowtype;
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

  for v_site in
    select site.*
    from public.sites site
    where site.parent_index_id = v_root.id
  loop
    perform public.index_federation_enqueue_package(
      gen_random_uuid(),
      v_root.id,
      'site',
      'upsert',
      v_site.id,
      null,
      v_site.id,
      public.index_federation_site_payload(v_site),
      null,
      p_target_remote_index_id
    );
    v_count := v_count + 1;
  end loop;

  for v_membership in
    select membership.*
    from public.index_sites membership
    where membership.index_id = v_root.id
  loop
    perform public.index_federation_enqueue_package(
      gen_random_uuid(),
      v_root.id,
      'index_site',
      case when v_membership.status = 'delisted' then 'delist' else 'upsert' end,
      null,
      v_membership.index_id,
      v_membership.site_id,
      public.index_federation_index_site_payload(v_membership),
      null,
      p_target_remote_index_id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.index_federation_build_package_json(
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
language sql
immutable
as $$
  select jsonb_build_object(
    'package_id', p_package_id,
    'origin_index_id', p_origin_index_id,
    'sender_index_id', p_sender_index_id,
    'entity_type', p_entity_type,
    'operation', p_operation,
    'entity_id', p_entity_id,
    'index_id', p_index_id,
    'site_id', p_site_id,
    'payload', coalesce(p_payload, '{}'::jsonb)
  );
$$;

create or replace function public.index_federation_sign_package(
  p_package jsonb,
  p_shared_secret text
) returns text
language sql
immutable
as $$
  select encode(
    hmac(
      convert_to(
        jsonb_build_object(
          'package_id', p_package ->> 'package_id',
          'origin_index_id', p_package ->> 'origin_index_id',
          'sender_index_id', p_package ->> 'sender_index_id',
          'entity_type', p_package ->> 'entity_type',
          'operation', p_package ->> 'operation',
          'entity_id', p_package ->> 'entity_id',
          'index_id', p_package ->> 'index_id',
          'site_id', p_package ->> 'site_id',
          'payload', coalesce(p_package -> 'payload', '{}'::jsonb)
        )::text,
        'utf8'
      ),
      convert_to(coalesce(p_shared_secret, ''), 'utf8'),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.index_federation_after_index_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_root_id uuid := public.index_federation_local_root_id();
begin
  if current_setting('app.index_federation_suppress', true) = 'on' then
    return null;
  end if;

  if v_local_root_id is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    if old.id <> v_local_root_id then
      return null;
    end if;

    perform public.index_federation_enqueue_package(
      gen_random_uuid(),
      v_local_root_id,
      'index',
      'delete',
      old.id,
      old.id,
      null,
      public.index_federation_index_payload(old),
      null
    );
    return null;
  end if;

  if new.id <> v_local_root_id then
    return null;
  end if;

  if tg_op = 'UPDATE'
    and public.index_federation_index_payload(old) = public.index_federation_index_payload(new) then
    return null;
  end if;

  perform public.index_federation_enqueue_package(
    gen_random_uuid(),
    v_local_root_id,
    'index',
    'upsert',
    new.id,
    new.id,
    null,
    public.index_federation_index_payload(new),
    null
  );
  return null;
end;
$$;

create or replace function public.index_federation_after_site_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_root_id uuid := public.index_federation_local_root_id();
  v_parent_index_id uuid;
begin
  if current_setting('app.index_federation_suppress', true) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_parent_index_id := old.parent_index_id;
    if v_parent_index_id is null or v_parent_index_id <> v_local_root_id then
      return null;
    end if;

    perform public.index_federation_enqueue_package(
      gen_random_uuid(),
      v_local_root_id,
      'site',
      'delete',
      old.id,
      null,
      old.id,
      public.index_federation_site_payload(old),
      null
    );
    return null;
  end if;

  v_parent_index_id := new.parent_index_id;
  if v_parent_index_id is null or v_parent_index_id <> v_local_root_id then
    return null;
  end if;

  if tg_op = 'UPDATE'
    and public.index_federation_site_payload(old) = public.index_federation_site_payload(new) then
    return null;
  end if;

  perform public.index_federation_enqueue_package(
    gen_random_uuid(),
    v_local_root_id,
    'site',
    'upsert',
    new.id,
    null,
    new.id,
    public.index_federation_site_payload(new),
    null
  );
  return null;
end;
$$;

create or replace function public.index_federation_after_index_site_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_root_id uuid := public.index_federation_local_root_id();
  v_index_id uuid;
  v_operation text;
begin
  if current_setting('app.index_federation_suppress', true) = 'on' then
    return null;
  end if;

  v_index_id := case when tg_op = 'DELETE' then old.index_id else new.index_id end;
  if v_index_id is null or v_index_id <> v_local_root_id then
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.index_federation_enqueue_package(
      gen_random_uuid(),
      v_local_root_id,
      'index_site',
      'delete',
      null,
      old.index_id,
      old.site_id,
      public.index_federation_index_site_payload(old),
      null
    );
    return null;
  end if;

  if tg_op = 'UPDATE'
    and public.index_federation_index_site_payload(old) = public.index_federation_index_site_payload(new) then
    return null;
  end if;

  v_operation := case when new.status = 'delisted' then 'delist' else 'upsert' end;

  perform public.index_federation_enqueue_package(
    gen_random_uuid(),
    v_local_root_id,
    'index_site',
    v_operation,
    null,
    new.index_id,
    new.site_id,
    public.index_federation_index_site_payload(new),
    null
  );
  return null;
end;
$$;

drop trigger if exists index_federation_after_index_change on public.indexes;
create trigger index_federation_after_index_change
after insert or update or delete on public.indexes
for each row execute function public.index_federation_after_index_change();

drop trigger if exists index_federation_after_site_change on public.sites;
create trigger index_federation_after_site_change
after insert or update or delete on public.sites
for each row execute function public.index_federation_after_site_change();

drop trigger if exists index_federation_after_index_site_change on public.index_sites;
create trigger index_federation_after_index_site_change
after insert or update or delete on public.index_sites
for each row execute function public.index_federation_after_index_site_change();

create or replace function public.index_federation_claim_deliveries(
  p_limit int default 20
) returns table (
  local_index_id uuid,
  remote_index_id uuid,
  remote_project_url text,
  remote_publishable_key text,
  shared_secret text,
  attempts int,
  package_id uuid,
  origin_index_id uuid,
  entity_type text,
  operation text,
  entity_id uuid,
  index_id uuid,
  site_id uuid,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with local_root as (
    select public.index_federation_local_root_id() as id
  ),
  candidates as (
    select
      delivery.package_id,
      delivery.remote_index_id
    from public.index_federation_deliveries delivery
    join local_root on true
    join public.index_federation_peers peer
      on peer.local_index_id = local_root.id
     and peer.remote_index_id = delivery.remote_index_id
     and peer.is_active = true
    where delivery.status in ('pending', 'retry')
      and delivery.next_attempt_at <= now()
    order by delivery.next_attempt_at asc, delivery.created_at asc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update of delivery skip locked
  ),
  updated as (
    update public.index_federation_deliveries delivery
    set
      status = 'dispatching',
      attempts = delivery.attempts + 1,
      claimed_at = now(),
      updated_at = now()
    from candidates
    where delivery.package_id = candidates.package_id
      and delivery.remote_index_id = candidates.remote_index_id
    returning delivery.package_id, delivery.remote_index_id, delivery.attempts
  )
  select
    local_root.id as local_index_id,
    peer.remote_index_id,
    peer.remote_project_url,
    peer.remote_publishable_key,
    peer.shared_secret,
    updated.attempts,
    outbox.package_id,
    outbox.origin_index_id,
    outbox.entity_type,
    outbox.operation,
    outbox.entity_id,
    outbox.index_id,
    outbox.site_id,
    outbox.payload
  from updated
  join local_root on true
  join public.index_federation_outbox outbox
    on outbox.package_id = updated.package_id
  join public.index_federation_peers peer
    on peer.local_index_id = local_root.id
   and peer.remote_index_id = updated.remote_index_id
   and peer.is_active = true;
end;
$$;

create or replace function public.index_federation_dispatch_due_deliveries(
  p_limit int default 20
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim record;
  v_package jsonb;
  v_signature text;
  v_request_id bigint;
  v_sent_count int := 0;
  v_next_status text;
begin
  for v_claim in
    select *
    from public.index_federation_claim_deliveries(p_limit)
  loop
    v_package := public.index_federation_build_package_json(
      v_claim.package_id,
      v_claim.origin_index_id,
      v_claim.local_index_id,
      v_claim.entity_type,
      v_claim.operation,
      v_claim.entity_id,
      v_claim.index_id,
      v_claim.site_id,
      v_claim.payload
    );
    v_signature := public.index_federation_sign_package(
      v_package,
      v_claim.shared_secret
    );

    begin
      v_request_id := net.http_post(
        url := regexp_replace(v_claim.remote_project_url, '/+$', '') ||
          '/rest/v1/rpc/index_federation_receive_package',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'apikey', v_claim.remote_publishable_key,
          'authorization', 'Bearer ' || v_claim.remote_publishable_key
        ),
        body := jsonb_build_object(
          'p_package', v_package,
          'p_signature', v_signature
        )
      );

      update public.index_federation_deliveries delivery
      set
        request_id = v_request_id,
        dispatched_at = now(),
        claimed_at = now(),
        last_response_code = null,
        last_error = null,
        updated_at = now()
      where delivery.package_id = v_claim.package_id
        and delivery.remote_index_id = v_claim.remote_index_id;

      v_sent_count := v_sent_count + 1;
    exception
      when others then
        v_next_status := case
          when coalesce(v_claim.attempts, 0) >= 8 then 'failed'
          else 'retry'
        end;

        update public.index_federation_deliveries delivery
        set
          status = v_next_status,
          request_id = null,
          dispatched_at = null,
          claimed_at = null,
          next_attempt_at = case
            when v_next_status = 'retry' then
              now() + make_interval(
                secs => least(
                  300,
                  power(2, greatest(0, coalesce(v_claim.attempts, 1) - 1))::int
                )
              )
            else delivery.next_attempt_at
          end,
          last_error = sqlerrm,
          updated_at = now()
        where delivery.package_id = v_claim.package_id
          and delivery.remote_index_id = v_claim.remote_index_id;
    end;
  end loop;

  return v_sent_count;
end;
$$;

create or replace function public.index_federation_reconcile_deliveries()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count int := 0;
begin
  update public.index_federation_deliveries delivery
  set
    status = case
      when response.id is null then delivery.status
      when coalesce(response.timed_out, false)
        or nullif(trim(coalesce(response.error_msg, '')), '') is not null
        or response.status_code is null
        or response.status_code >= 400 then
          case when delivery.attempts >= 8 then 'failed' else 'retry' end
      else 'sent'
    end,
    next_attempt_at = case
      when response.id is null then delivery.next_attempt_at
      when coalesce(response.timed_out, false)
        or nullif(trim(coalesce(response.error_msg, '')), '') is not null
        or response.status_code is null
        or response.status_code >= 400 then
          now() + make_interval(
            secs => least(
              300,
              power(2, greatest(0, coalesce(delivery.attempts, 1) - 1))::int
            )
          )
      else delivery.next_attempt_at
    end,
    claimed_at = case when response.id is null then delivery.claimed_at else null end,
    request_id = case
      when response.id is null then delivery.request_id
      when coalesce(response.timed_out, false)
        or nullif(trim(coalesce(response.error_msg, '')), '') is not null
        or response.status_code is null
        or response.status_code >= 400 then null
      else delivery.request_id
    end,
    last_response_code = coalesce(response.status_code, delivery.last_response_code),
    last_error = case
      when response.id is null then delivery.last_error
      when coalesce(response.timed_out, false) then 'Request timed out.'
      when nullif(trim(coalesce(response.error_msg, '')), '') is not null then response.error_msg
      when response.status_code is null then 'No response status code.'
      when response.status_code >= 400 then coalesce(nullif(trim(response.content), ''), 'Remote federation apply failed.')
      else null
    end,
    updated_at = case when response.id is null then delivery.updated_at else now() end
  from net._http_response response
  where delivery.status = 'dispatching'
    and delivery.request_id is not null
    and response.id = delivery.request_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

create or replace function public.index_federation_receive_package(
  p_package jsonb,
  p_signature text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_root_id uuid := public.index_federation_local_root_id();
  v_package jsonb := coalesce(p_package, '{}'::jsonb);
  v_payload jsonb := coalesce(v_package -> 'payload', '{}'::jsonb);
  v_package_id uuid := nullif(trim(coalesce(v_package ->> 'package_id', '')), '')::uuid;
  v_origin_index_id uuid := nullif(trim(coalesce(v_package ->> 'origin_index_id', '')), '')::uuid;
  v_sender_index_id uuid := nullif(trim(coalesce(v_package ->> 'sender_index_id', '')), '')::uuid;
  v_entity_type text := nullif(trim(coalesce(v_package ->> 'entity_type', '')), '');
  v_operation text := nullif(trim(coalesce(v_package ->> 'operation', '')), '');
  v_entity_id uuid := nullif(trim(coalesce(v_package ->> 'entity_id', '')), '')::uuid;
  v_index_id uuid := nullif(trim(coalesce(v_package ->> 'index_id', '')), '')::uuid;
  v_site_id uuid := nullif(trim(coalesce(v_package ->> 'site_id', '')), '')::uuid;
  v_peer public.index_federation_peers%rowtype;
  v_expected_signature text;
  v_result jsonb;
begin
  if v_local_root_id is null then
    raise exception 'Local root index is missing.';
  end if;

  if v_package_id is null
    or v_origin_index_id is null
    or v_sender_index_id is null
    or v_entity_type is null
    or v_operation is null then
    raise exception 'Federation package is missing required fields.';
  end if;

  select peer.*
  into v_peer
  from public.index_federation_peers peer
  where peer.local_index_id = v_local_root_id
    and peer.remote_index_id = v_sender_index_id
    and peer.is_active = true
  limit 1;

  if not found then
    raise exception 'Federation sender is not configured as an active peer.';
  end if;

  v_expected_signature := public.index_federation_sign_package(
    public.index_federation_build_package_json(
      v_package_id,
      v_origin_index_id,
      v_sender_index_id,
      v_entity_type,
      v_operation,
      v_entity_id,
      v_index_id,
      v_site_id,
      v_payload
    ),
    v_peer.shared_secret
  );

  if nullif(trim(coalesce(p_signature, '')), '') is null
    or v_expected_signature <> trim(p_signature) then
    raise exception 'Federation package signature is invalid.';
  end if;

  v_result := public.index_federation_apply_package(
    v_package_id,
    v_origin_index_id,
    v_sender_index_id,
    v_entity_type,
    v_operation,
    v_entity_id,
    v_index_id,
    v_site_id,
    v_payload
  );

  perform public.index_federation_dispatch_due_deliveries(20);

  return v_result;
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
  v_index_id uuid := coalesce(
    p_index_id,
    nullif(trim(coalesce(v_payload ->> 'index_id', '')), '')::uuid
  );
  v_site_id uuid := coalesce(
    p_site_id,
    nullif(trim(coalesce(v_payload ->> 'site_id', '')), '')::uuid,
    nullif(trim(coalesce(v_payload ->> 'id', '')), '')::uuid
  );
  v_entity_id uuid := coalesce(
    p_entity_id,
    nullif(trim(coalesce(v_payload ->> 'id', '')), '')::uuid
  );
  v_site_parent_index_id uuid := nullif(trim(coalesce(v_payload ->> 'parent_index_id', '')), '')::uuid;
begin
  if p_package_id is null
    or p_origin_index_id is null
    or p_sender_index_id is null
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

  if p_entity_type = 'index' then
    if v_entity_id is null or v_entity_id <> p_origin_index_id then
      raise exception 'Index packages must be authoritative for their own row.';
    end if;
  elsif p_entity_type = 'site' then
    if v_entity_id is null or v_site_parent_index_id is null or v_site_parent_index_id <> p_origin_index_id then
      raise exception 'Site packages must declare their authoritative parent index.';
    end if;
  elsif p_entity_type = 'index_site' then
    if v_index_id is null or v_site_id is null or v_index_id <> p_origin_index_id then
      raise exception 'Index membership packages must be authoritative for their owning index.';
    end if;
  else
    raise exception 'Unsupported federation entity type.';
  end if;

  if p_operation not in ('upsert', 'delete', 'delist') then
    raise exception 'Unsupported federation package operation.';
  end if;

  perform set_config('app.index_federation_suppress', 'on', true);

  if p_entity_type = 'index' then
    if p_operation = 'delete' then
      if v_entity_id = v_local_root_id then
        return jsonb_build_object('status', 'ignored_local_root');
      end if;

      if exists (
        select 1
        from public.index_sites membership
        where membership.index_id = v_entity_id
      ) then
        raise exception 'Cannot delete mirrored index while memberships still exist.';
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
  elsif p_entity_type = 'site' then
    if p_operation = 'delete' then
      if exists (
        select 1
        from public.index_sites membership
        where membership.site_id = v_entity_id
      ) then
        raise exception 'Cannot delete mirrored site while memberships still exist.';
      end if;

      delete from public.sites
      where id = v_entity_id
        and parent_index_id = p_origin_index_id;
    else
      insert into public.sites (
        id,
        canonical_url,
        title,
        description,
        image_url,
        visibility,
        protocol_version,
        last_manifest_hash,
        meta,
        parent_index_id,
        parent_index_url,
        parent_index_level
      )
      values (
        v_entity_id,
        nullif(v_payload ->> 'canonical_url', ''),
        nullif(v_payload ->> 'title', ''),
        nullif(v_payload ->> 'description', ''),
        nullif(v_payload ->> 'image_url', ''),
        coalesce(nullif(trim(v_payload ->> 'visibility'), ''), 'public'),
        coalesce(nullif(trim(v_payload ->> 'protocol_version'), ''), '1.0'),
        nullif(v_payload ->> 'last_manifest_hash', ''),
        coalesce(v_payload -> 'meta', '{}'::jsonb),
        p_origin_index_id,
        nullif(v_payload ->> 'parent_index_url', ''),
        nullif(trim(coalesce(v_payload ->> 'parent_index_level', '')), '')::int
      )
      on conflict (id) do update set
        canonical_url = excluded.canonical_url,
        title = excluded.title,
        description = excluded.description,
        image_url = excluded.image_url,
        visibility = excluded.visibility,
        protocol_version = excluded.protocol_version,
        last_manifest_hash = excluded.last_manifest_hash,
        meta = excluded.meta,
        parent_index_id = excluded.parent_index_id,
        parent_index_url = excluded.parent_index_url,
        parent_index_level = excluded.parent_index_level,
        updated_at = now();
    end if;
  else
    if p_operation = 'delete' then
      delete from public.index_sites
      where index_id = v_index_id
        and site_id = v_site_id;
    else
      if not exists (
        select 1
        from public.indexes index_row
        where index_row.id = v_index_id
      ) then
        raise exception 'Cannot apply mirrored membership before its index row exists.';
      end if;

      if not exists (
        select 1
        from public.sites site_row
        where site_row.id = v_site_id
      ) then
        raise exception 'Cannot apply mirrored membership before its site row exists.';
      end if;

      insert into public.index_sites (
        index_id,
        site_id,
        status,
        delist_reason_code,
        delist_note,
        created_at
      )
      values (
        v_index_id,
        v_site_id,
        case when p_operation = 'delist' then 'delisted' else 'tracked' end,
        nullif(v_payload ->> 'delist_reason_code', ''),
        nullif(v_payload ->> 'delist_note', ''),
        coalesce(
          nullif(trim(coalesce(v_payload ->> 'created_at', '')), '')::timestamptz,
          now()
        )
      )
      on conflict (index_id, site_id) do update set
        status = excluded.status,
        delist_reason_code = excluded.delist_reason_code,
        delist_note = excluded.delist_note,
        created_at = excluded.created_at;
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
    v_index_id,
    v_site_id,
    v_payload
  )
  on conflict (package_id) do nothing;

  perform public.index_federation_enqueue_package(
    p_package_id,
    p_origin_index_id,
    p_entity_type,
    p_operation,
    v_entity_id,
    v_index_id,
    v_site_id,
    v_payload,
    p_sender_index_id
  );

  return jsonb_build_object('status', 'applied');
end;
$$;

revoke all on function public.index_federation_local_root_id() from public;
revoke all on function public.index_federation_index_payload(public.indexes) from public;
revoke all on function public.index_federation_site_payload(public.sites) from public;
revoke all on function public.index_federation_index_site_payload(public.index_sites) from public;
revoke all on function public.index_federation_wake_dispatcher() from public;
revoke all on function public.index_federation_enqueue_package(uuid, uuid, text, text, uuid, uuid, uuid, jsonb, uuid, uuid) from public;
revoke all on function public.index_federation_enqueue_authoritative_snapshot(uuid) from public;
revoke all on function public.index_federation_build_package_json(uuid, uuid, uuid, text, text, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.index_federation_sign_package(jsonb, text) from public;
revoke all on function public.index_federation_after_index_change() from public;
revoke all on function public.index_federation_after_site_change() from public;
revoke all on function public.index_federation_after_index_site_change() from public;
revoke all on function public.index_federation_claim_deliveries(int) from public;
revoke all on function public.index_federation_dispatch_due_deliveries(int) from public;
revoke all on function public.index_federation_reconcile_deliveries() from public;
revoke all on function public.index_federation_apply_package(uuid, uuid, uuid, text, text, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.index_federation_receive_package(jsonb, text) from public;
grant execute on function public.index_federation_wake_dispatcher() to service_role;
grant execute on function public.index_federation_enqueue_authoritative_snapshot(uuid) to service_role;
grant execute on function public.index_federation_receive_package(jsonb, text) to anon, authenticated;

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
      site.parent_index_id,
      site.parent_index_url,
      site.parent_index_level
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
      index_row.parent_index_id,
      index_row.parent_index_url,
      index_row.parent_index_level
    from public.indexes index_row
    where index_row.type = 'index'
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
            'parent_index_id', node.parent_index_id,
            'parent_index_url', node.parent_index_url,
            'parent_index_level', node.parent_index_level
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

do $migration$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'index_federation_dispatch_every_minute'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'index_federation_dispatch_every_minute',
    '* * * * *',
    $cron$select public.index_federation_wake_dispatcher();$cron$
  );
end;
$migration$;

notify pgrst, 'reload schema';
