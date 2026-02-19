-- Protocol v1 node core
-- This migration introduces a tightly-scoped contract surface for Solidary network coordination
-- while preserving node-level ownership and autonomy.

create schema if not exists solidary_core;

-- Optional dedicated roles for root network actors.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'solidary_root_reader') then
    create role solidary_root_reader nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'solidary_root_writer') then
    create role solidary_root_writer nologin;
  end if;
end
$$;

create table if not exists solidary_core.node_contract (
  id boolean primary key default true,
  node_id uuid not null default gen_random_uuid() unique,
  owner_user_id uuid references auth.users(id) on delete set null,
  node_slug text not null unique,
  node_title text not null default 'Solidary Node',
  node_kind text not null default 'index',
  protocol_version text not null default '1.0.0',
  protocol_channel text not null default 'stable',
  network_status text not null default 'active',
  allow_root_updates boolean not null default true,
  root_public_key_id text not null default 'solidary-root-main',
  root_public_key_pem text not null default '',
  last_protocol_bundle text,
  last_protocol_bundle_signed_at timestamptz,
  last_sync_at timestamptz,
  capabilities jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id = true),
  check (node_slug ~ '^[a-z0-9-]{3,64}$'),
  check (node_kind in ('index', 'archive', 'library', 'catalog', 'custom')),
  check (protocol_channel in ('stable', 'beta', 'canary')),
  check (network_status in ('active', 'paused', 'isolated'))
);

create table if not exists solidary_core.protocol_inbox (
  id uuid primary key default gen_random_uuid(),
  envelope_id text not null unique,
  node_id uuid not null,
  command_type text not null,
  command_version int not null default 1,
  issued_at timestamptz not null,
  not_before_at timestamptz,
  expires_at timestamptz,
  issuer text not null,
  key_id text not null,
  signature text not null,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  status text not null default 'pending',
  received_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  processor text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (command_version >= 1),
  check (status in ('pending', 'applied', 'failed', 'rejected', 'expired', 'skipped')),
  check (not_before_at is null or expires_at is null or not_before_at <= expires_at)
);

create table if not exists solidary_core.protocol_events (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid references solidary_core.protocol_inbox(id) on delete set null,
  node_id uuid not null,
  envelope_id text,
  event_type text not null,
  event_at timestamptz not null default now(),
  actor text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (event_type in ('received', 'validated', 'applied', 'failed', 'rejected', 'expired', 'skipped'))
);

-- Compact pointer-only site export intended for root discovery and inter-node sync.
create table if not exists solidary_core.discovery_export (
  site_id uuid primary key references public.sites(id) on delete cascade,
  canonical_url text not null,
  title text,
  description text,
  image_url text,
  visibility text not null default 'public',
  protocol_version text,
  last_manifest_hash text,
  source_snapshot_id uuid references public.site_snapshots(id) on delete set null,
  last_seen_at timestamptz,
  exported_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility in ('public', 'unlisted', 'private'))
);

create table if not exists solidary_core.discovery_edges_export (
  edge_id uuid primary key references public.edges(id) on delete cascade,
  source_site_id uuid not null references public.sites(id) on delete cascade,
  kind text not null,
  target_type text not null,
  target_site_url text,
  target_doc_url text,
  target_external_url text,
  evidence_hash text not null,
  asserted_at timestamptz,
  verification_status text not null default 'unknown',
  exported_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_type in ('site', 'doc', 'external')),
  check (verification_status in ('unknown', 'asserted', 'mutual', 'attested', 'stale')),
  check (
    (target_type = 'site' and target_site_url is not null and target_doc_url is null and target_external_url is null)
    or (target_type = 'doc' and target_site_url is not null and target_doc_url is not null and target_external_url is null)
    or (target_type = 'external' and target_site_url is null and target_doc_url is null and target_external_url is not null)
  )
);

create index if not exists protocol_inbox_pending_idx
  on solidary_core.protocol_inbox (status, issued_at asc);

create index if not exists protocol_inbox_node_status_idx
  on solidary_core.protocol_inbox (node_id, status, issued_at asc);

create index if not exists protocol_events_node_event_idx
  on solidary_core.protocol_events (node_id, event_at desc);

create index if not exists protocol_events_envelope_idx
  on solidary_core.protocol_events (envelope_id, event_at desc);

create index if not exists discovery_export_visibility_idx
  on solidary_core.discovery_export (visibility, last_seen_at desc);

create index if not exists discovery_edges_source_kind_idx
  on solidary_core.discovery_edges_export (source_site_id, kind);

create index if not exists discovery_edges_target_site_idx
  on solidary_core.discovery_edges_export (target_site_url);

create or replace function solidary_core.current_node_owner_user_id()
returns uuid
language sql
stable
set search_path = public, solidary_core
as $$
  select owner_user_id
  from solidary_core.node_contract
  where id = true
  limit 1;
$$;

create or replace function solidary_core.is_node_owner()
returns boolean
language sql
stable
set search_path = public, solidary_core
as $$
  select auth.uid() is not null
    and auth.uid() = solidary_core.current_node_owner_user_id();
$$;

create or replace function solidary_core.is_service_actor()
returns boolean
language sql
stable
set search_path = public, solidary_core
as $$
  select auth.role() in ('service_role', 'postgres');
$$;

create or replace function solidary_core.is_root_actor()
returns boolean
language sql
stable
set search_path = public, solidary_core
as $$
  select auth.role() in ('solidary_root_writer', 'service_role', 'postgres');
$$;

create or replace function solidary_core.guard_node_contract_update()
returns trigger
language plpgsql
security definer
set search_path = public, solidary_core
as $$
begin
  if new.node_id <> old.node_id then
    raise exception 'node_id is immutable';
  end if;

  if auth.role() not in ('solidary_root_writer', 'service_role', 'postgres') then
    if new.protocol_version is distinct from old.protocol_version
      or new.protocol_channel is distinct from old.protocol_channel
      or new.root_public_key_id is distinct from old.root_public_key_id
      or new.root_public_key_pem is distinct from old.root_public_key_pem
      or new.last_protocol_bundle is distinct from old.last_protocol_bundle
      or new.last_protocol_bundle_signed_at is distinct from old.last_protocol_bundle_signed_at then
      raise exception 'Protocol-managed fields are write-restricted to Solidary root actors.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function solidary_core.bootstrap_node_contract(
  p_node_slug text,
  p_node_title text,
  p_owner_user_id uuid,
  p_node_kind text default 'index'
) returns solidary_core.node_contract
language plpgsql
security definer
set search_path = public, solidary_core
as $$
declare
  v_contract solidary_core.node_contract;
begin
  if coalesce(trim(p_node_slug), '') = '' then
    raise exception 'p_node_slug is required';
  end if;

  if coalesce(trim(p_node_title), '') = '' then
    raise exception 'p_node_title is required';
  end if;

  if p_node_kind not in ('index', 'archive', 'library', 'catalog', 'custom') then
    raise exception 'Unsupported node kind: %', p_node_kind;
  end if;

  if not solidary_core.is_service_actor() then
    if auth.uid() is null then
      raise exception 'Authentication required.';
    end if;

    if p_owner_user_id is distinct from auth.uid() then
      raise exception 'Only the authenticated owner can bootstrap node contract via client sessions.';
    end if;
  end if;

  insert into solidary_core.node_contract (
    id,
    owner_user_id,
    node_slug,
    node_title,
    node_kind
  )
  values (
    true,
    p_owner_user_id,
    trim(p_node_slug),
    trim(p_node_title),
    p_node_kind
  )
  on conflict (id)
  do update set
    owner_user_id = excluded.owner_user_id,
    node_slug = excluded.node_slug,
    node_title = excluded.node_title,
    node_kind = excluded.node_kind,
    updated_at = now()
  returning * into v_contract;

  return v_contract;
end;
$$;

create or replace function solidary_core.enqueue_protocol_command(
  p_envelope_id text,
  p_command_type text,
  p_command_version int,
  p_issued_at timestamptz,
  p_not_before_at timestamptz,
  p_expires_at timestamptz,
  p_issuer text,
  p_key_id text,
  p_signature text,
  p_payload jsonb,
  p_payload_hash text
) returns uuid
language plpgsql
security definer
set search_path = public, solidary_core
as $$
declare
  v_node_id uuid;
  v_inbox_id uuid;
  v_was_inserted boolean := false;
begin
  if not solidary_core.is_root_actor() then
    raise exception 'Only Solidary root actors can enqueue protocol commands.';
  end if;

  if coalesce(trim(p_envelope_id), '') = '' then
    raise exception 'p_envelope_id is required';
  end if;

  if coalesce(trim(p_command_type), '') = '' then
    raise exception 'p_command_type is required';
  end if;

  if p_command_version is null or p_command_version < 1 then
    raise exception 'p_command_version must be >= 1';
  end if;

  if p_issued_at is null then
    raise exception 'p_issued_at is required';
  end if;

  if coalesce(trim(p_issuer), '') = '' then
    raise exception 'p_issuer is required';
  end if;

  if coalesce(trim(p_key_id), '') = '' then
    raise exception 'p_key_id is required';
  end if;

  if coalesce(trim(p_signature), '') = '' then
    raise exception 'p_signature is required';
  end if;

  if coalesce(trim(p_payload_hash), '') = '' then
    raise exception 'p_payload_hash is required';
  end if;

  select node_id
  into v_node_id
  from solidary_core.node_contract
  where id = true
  limit 1;

  if v_node_id is null then
    raise exception 'Node contract has not been initialized.';
  end if;

  with inserted as (
    insert into solidary_core.protocol_inbox (
      envelope_id,
      node_id,
      command_type,
      command_version,
      issued_at,
      not_before_at,
      expires_at,
      issuer,
      key_id,
      signature,
      payload,
      payload_hash,
      status,
      received_at
    )
    values (
      trim(p_envelope_id),
      v_node_id,
      trim(p_command_type),
      p_command_version,
      p_issued_at,
      p_not_before_at,
      p_expires_at,
      trim(p_issuer),
      trim(p_key_id),
      trim(p_signature),
      coalesce(p_payload, '{}'::jsonb),
      trim(p_payload_hash),
      'pending',
      now()
    )
    on conflict (envelope_id) do nothing
    returning id
  )
  select id
  into v_inbox_id
  from inserted;

  if v_inbox_id is null then
    select id
    into v_inbox_id
    from solidary_core.protocol_inbox
    where envelope_id = trim(p_envelope_id)
    limit 1;
  else
    v_was_inserted := true;
  end if;

  if v_was_inserted then
    insert into solidary_core.protocol_events (
      inbox_id,
      node_id,
      envelope_id,
      event_type,
      actor,
      details
    )
    values (
      v_inbox_id,
      v_node_id,
      trim(p_envelope_id),
      'received',
      'solidary_root',
      jsonb_build_object(
        'command_type', trim(p_command_type),
        'command_version', p_command_version,
        'issuer', trim(p_issuer),
        'key_id', trim(p_key_id)
      )
    );
  end if;

  return v_inbox_id;
end;
$$;

create or replace function solidary_core.list_pending_protocol_commands(
  p_limit int default 20
) returns setof solidary_core.protocol_inbox
language plpgsql
security definer
set search_path = public, solidary_core
as $$
declare
  v_limit int;
begin
  if not solidary_core.is_service_actor() then
    raise exception 'Only service actors can list pending protocol commands.';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 200));

  return query
    select p.*
    from solidary_core.protocol_inbox p
    where p.status = 'pending'
      and (p.not_before_at is null or p.not_before_at <= now())
      and (p.expires_at is null or p.expires_at > now())
    order by p.issued_at asc
    limit v_limit;
end;
$$;

create or replace function solidary_core.mark_protocol_command_result(
  p_envelope_id text,
  p_status text,
  p_processor text,
  p_error_code text default null,
  p_error_message text default null,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, solidary_core
as $$
declare
  v_inbox_id uuid;
  v_node_id uuid;
  v_status text;
begin
  if not solidary_core.is_service_actor() then
    raise exception 'Only service actors can mark protocol command results.';
  end if;

  if coalesce(trim(p_envelope_id), '') = '' then
    raise exception 'p_envelope_id is required';
  end if;

  v_status := lower(trim(coalesce(p_status, '')));
  if v_status not in ('applied', 'failed', 'rejected', 'expired', 'skipped') then
    raise exception 'Unsupported status: %', p_status;
  end if;

  update solidary_core.protocol_inbox p
  set
    status = v_status,
    processed_at = now(),
    processor = nullif(trim(coalesce(p_processor, '')), ''),
    error_code = nullif(trim(coalesce(p_error_code, '')), ''),
    error_message = nullif(trim(coalesce(p_error_message, '')), '')
  where p.envelope_id = trim(p_envelope_id)
  returning p.id, p.node_id
  into v_inbox_id, v_node_id;

  if v_inbox_id is null then
    raise exception 'Unknown envelope_id: %', p_envelope_id;
  end if;

  insert into solidary_core.protocol_events (
    inbox_id,
    node_id,
    envelope_id,
    event_type,
    actor,
    details
  )
  values (
    v_inbox_id,
    v_node_id,
    trim(p_envelope_id),
    v_status,
    coalesce(nullif(trim(coalesce(p_processor, '')), ''), 'node_worker'),
    coalesce(p_details, '{}'::jsonb)
      || jsonb_build_object(
        'error_code', nullif(trim(coalesce(p_error_code, '')), ''),
        'error_message', nullif(trim(coalesce(p_error_message, '')), '')
      )
  );

  return v_inbox_id;
end;
$$;

-- Public RPC wrappers for PostgREST/Supabase clients.
create or replace function public.rpc_protocol_bootstrap_node_contract(
  p_node_slug text,
  p_node_title text,
  p_owner_user_id uuid,
  p_node_kind text default 'index'
) returns jsonb
language plpgsql
security definer
set search_path = public, solidary_core
as $$
declare
  v_contract solidary_core.node_contract;
begin
  v_contract := solidary_core.bootstrap_node_contract(
    p_node_slug,
    p_node_title,
    p_owner_user_id,
    p_node_kind
  );

  return jsonb_build_object(
    'node_id', v_contract.node_id,
    'owner_user_id', v_contract.owner_user_id,
    'node_slug', v_contract.node_slug,
    'node_title', v_contract.node_title,
    'node_kind', v_contract.node_kind,
    'protocol_version', v_contract.protocol_version,
    'protocol_channel', v_contract.protocol_channel,
    'network_status', v_contract.network_status,
    'allow_root_updates', v_contract.allow_root_updates,
    'created_at', v_contract.created_at,
    'updated_at', v_contract.updated_at
  );
end;
$$;

create or replace function public.rpc_protocol_enqueue_command(
  p_envelope_id text,
  p_command_type text,
  p_command_version int,
  p_issued_at timestamptz,
  p_not_before_at timestamptz,
  p_expires_at timestamptz,
  p_issuer text,
  p_key_id text,
  p_signature text,
  p_payload jsonb,
  p_payload_hash text
) returns uuid
language sql
security definer
set search_path = public, solidary_core
as $$
  select solidary_core.enqueue_protocol_command(
    p_envelope_id,
    p_command_type,
    p_command_version,
    p_issued_at,
    p_not_before_at,
    p_expires_at,
    p_issuer,
    p_key_id,
    p_signature,
    p_payload,
    p_payload_hash
  );
$$;

create or replace function public.rpc_protocol_list_pending_commands(
  p_limit int default 20
) returns jsonb
language sql
security definer
set search_path = public, solidary_core
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'envelope_id', p.envelope_id,
        'node_id', p.node_id,
        'command_type', p.command_type,
        'command_version', p.command_version,
        'issued_at', p.issued_at,
        'not_before_at', p.not_before_at,
        'expires_at', p.expires_at,
        'issuer', p.issuer,
        'key_id', p.key_id,
        'signature', p.signature,
        'payload', p.payload,
        'payload_hash', p.payload_hash,
        'status', p.status,
        'received_at', p.received_at,
        'claimed_at', p.claimed_at,
        'processed_at', p.processed_at,
        'processor', p.processor,
        'error_code', p.error_code,
        'error_message', p.error_message
      )
      order by p.issued_at asc
    ),
    '[]'::jsonb
  )
  from solidary_core.list_pending_protocol_commands(p_limit) p;
$$;

create or replace function public.rpc_protocol_mark_command_result(
  p_envelope_id text,
  p_status text,
  p_processor text,
  p_error_code text default null,
  p_error_message text default null,
  p_details jsonb default '{}'::jsonb
) returns uuid
language sql
security definer
set search_path = public, solidary_core
as $$
  select solidary_core.mark_protocol_command_result(
    p_envelope_id,
    p_status,
    p_processor,
    p_error_code,
    p_error_message,
    p_details
  );
$$;

create or replace view solidary_core.discovery_snapshot as
select
  n.node_id,
  n.node_slug,
  n.node_title,
  n.node_kind,
  n.protocol_version,
  n.protocol_channel,
  n.network_status,
  s.site_id,
  s.canonical_url,
  s.title,
  s.description,
  s.image_url,
  s.visibility,
  s.protocol_version as site_protocol_version,
  s.last_manifest_hash,
  s.last_seen_at,
  s.exported_at,
  s.meta
from solidary_core.discovery_export s
join solidary_core.node_contract n on n.id = true;

alter table solidary_core.node_contract enable row level security;
alter table solidary_core.protocol_inbox enable row level security;
alter table solidary_core.protocol_events enable row level security;
alter table solidary_core.discovery_export enable row level security;
alter table solidary_core.discovery_edges_export enable row level security;

drop policy if exists node_contract_select_access on solidary_core.node_contract;
drop policy if exists node_contract_insert_access on solidary_core.node_contract;
drop policy if exists node_contract_update_access on solidary_core.node_contract;

drop policy if exists protocol_inbox_select_access on solidary_core.protocol_inbox;
drop policy if exists protocol_inbox_insert_access on solidary_core.protocol_inbox;
drop policy if exists protocol_inbox_update_access on solidary_core.protocol_inbox;
drop policy if exists protocol_inbox_delete_access on solidary_core.protocol_inbox;

drop policy if exists protocol_events_select_access on solidary_core.protocol_events;
drop policy if exists protocol_events_insert_access on solidary_core.protocol_events;

drop policy if exists discovery_export_select_access on solidary_core.discovery_export;
drop policy if exists discovery_export_insert_access on solidary_core.discovery_export;
drop policy if exists discovery_export_update_access on solidary_core.discovery_export;
drop policy if exists discovery_export_delete_access on solidary_core.discovery_export;

drop policy if exists discovery_edges_export_select_access on solidary_core.discovery_edges_export;
drop policy if exists discovery_edges_export_insert_access on solidary_core.discovery_edges_export;
drop policy if exists discovery_edges_export_update_access on solidary_core.discovery_edges_export;
drop policy if exists discovery_edges_export_delete_access on solidary_core.discovery_edges_export;

create policy node_contract_select_access on solidary_core.node_contract
  for select using (
    solidary_core.is_node_owner()
    or auth.role() in ('solidary_root_reader', 'solidary_root_writer', 'service_role', 'postgres')
  );

create policy node_contract_insert_access on solidary_core.node_contract
  for insert with check (
    auth.role() in ('solidary_root_writer', 'service_role', 'postgres')
    or (auth.uid() is not null and owner_user_id = auth.uid())
  );

create policy node_contract_update_access on solidary_core.node_contract
  for update using (
    solidary_core.is_node_owner()
    or auth.role() in ('solidary_root_writer', 'service_role', 'postgres')
  )
  with check (
    solidary_core.is_node_owner()
    or auth.role() in ('solidary_root_writer', 'service_role', 'postgres')
  );

create policy protocol_inbox_select_access on solidary_core.protocol_inbox
  for select using (
    solidary_core.is_node_owner()
    or auth.role() in ('solidary_root_reader', 'solidary_root_writer', 'service_role', 'postgres')
  );

create policy protocol_inbox_insert_access on solidary_core.protocol_inbox
  for insert with check (
    auth.role() in ('solidary_root_writer', 'service_role', 'postgres')
  );

create policy protocol_inbox_update_access on solidary_core.protocol_inbox
  for update using (
    auth.role() in ('service_role', 'postgres')
  )
  with check (
    auth.role() in ('service_role', 'postgres')
  );

create policy protocol_inbox_delete_access on solidary_core.protocol_inbox
  for delete using (
    auth.role() in ('service_role', 'postgres')
  );

create policy protocol_events_select_access on solidary_core.protocol_events
  for select using (
    solidary_core.is_node_owner()
    or auth.role() in ('solidary_root_reader', 'solidary_root_writer', 'service_role', 'postgres')
  );

create policy protocol_events_insert_access on solidary_core.protocol_events
  for insert with check (
    auth.role() in ('service_role', 'postgres')
  );

create policy discovery_export_select_access on solidary_core.discovery_export
  for select using (
    solidary_core.is_node_owner()
    or auth.role() in ('solidary_root_reader', 'solidary_root_writer', 'service_role', 'postgres')
  );

create policy discovery_export_insert_access on solidary_core.discovery_export
  for insert with check (
    auth.role() in ('service_role', 'postgres')
  );

create policy discovery_export_update_access on solidary_core.discovery_export
  for update using (
    auth.role() in ('service_role', 'postgres')
  )
  with check (
    auth.role() in ('service_role', 'postgres')
  );

create policy discovery_export_delete_access on solidary_core.discovery_export
  for delete using (
    auth.role() in ('service_role', 'postgres')
  );

create policy discovery_edges_export_select_access on solidary_core.discovery_edges_export
  for select using (
    solidary_core.is_node_owner()
    or auth.role() in ('solidary_root_reader', 'solidary_root_writer', 'service_role', 'postgres')
  );

create policy discovery_edges_export_insert_access on solidary_core.discovery_edges_export
  for insert with check (
    auth.role() in ('service_role', 'postgres')
  );

create policy discovery_edges_export_update_access on solidary_core.discovery_edges_export
  for update using (
    auth.role() in ('service_role', 'postgres')
  )
  with check (
    auth.role() in ('service_role', 'postgres')
  );

create policy discovery_edges_export_delete_access on solidary_core.discovery_edges_export
  for delete using (
    auth.role() in ('service_role', 'postgres')
  );

drop trigger if exists node_contract_set_updated_at on solidary_core.node_contract;
create trigger node_contract_set_updated_at
before update on solidary_core.node_contract
for each row execute function public.set_updated_at();

drop trigger if exists node_contract_guard_update on solidary_core.node_contract;
create trigger node_contract_guard_update
before update on solidary_core.node_contract
for each row execute function solidary_core.guard_node_contract_update();

drop trigger if exists protocol_inbox_set_updated_at on solidary_core.protocol_inbox;
create trigger protocol_inbox_set_updated_at
before update on solidary_core.protocol_inbox
for each row execute function public.set_updated_at();

drop trigger if exists discovery_export_set_updated_at on solidary_core.discovery_export;
create trigger discovery_export_set_updated_at
before update on solidary_core.discovery_export
for each row execute function public.set_updated_at();

drop trigger if exists discovery_edges_export_set_updated_at on solidary_core.discovery_edges_export;
create trigger discovery_edges_export_set_updated_at
before update on solidary_core.discovery_edges_export
for each row execute function public.set_updated_at();

revoke all on schema solidary_core from public;
grant usage on schema solidary_core to authenticated;
grant usage on schema solidary_core to service_role;
grant usage on schema solidary_core to solidary_root_reader;
grant usage on schema solidary_core to solidary_root_writer;

grant select on solidary_core.node_contract to authenticated;
grant select on solidary_core.protocol_inbox to authenticated;
grant select on solidary_core.protocol_events to authenticated;
grant select on solidary_core.discovery_export to authenticated;
grant select on solidary_core.discovery_edges_export to authenticated;
grant select on solidary_core.discovery_snapshot to authenticated;

grant select on solidary_core.node_contract to solidary_root_reader;
grant select on solidary_core.protocol_inbox to solidary_root_reader;
grant select on solidary_core.protocol_events to solidary_root_reader;
grant select on solidary_core.discovery_export to solidary_root_reader;
grant select on solidary_core.discovery_edges_export to solidary_root_reader;
grant select on solidary_core.discovery_snapshot to solidary_root_reader;

grant select on solidary_core.node_contract to solidary_root_writer;
grant select on solidary_core.protocol_inbox to solidary_root_writer;
grant select on solidary_core.protocol_events to solidary_root_writer;
grant select on solidary_core.discovery_export to solidary_root_writer;
grant select on solidary_core.discovery_edges_export to solidary_root_writer;
grant select on solidary_core.discovery_snapshot to solidary_root_writer;

grant select, insert, update, delete on solidary_core.node_contract to service_role;
grant select, insert, update, delete on solidary_core.protocol_inbox to service_role;
grant select, insert, update, delete on solidary_core.protocol_events to service_role;
grant select, insert, update, delete on solidary_core.discovery_export to service_role;
grant select, insert, update, delete on solidary_core.discovery_edges_export to service_role;
grant select on solidary_core.discovery_snapshot to service_role;
grant usage, select on all sequences in schema solidary_core to service_role;

revoke all on function solidary_core.bootstrap_node_contract(text, text, uuid, text) from public;
revoke all on function solidary_core.enqueue_protocol_command(text, text, int, timestamptz, timestamptz, timestamptz, text, text, text, jsonb, text) from public;
revoke all on function solidary_core.list_pending_protocol_commands(int) from public;
revoke all on function solidary_core.mark_protocol_command_result(text, text, text, text, text, jsonb) from public;

revoke all on function public.rpc_protocol_bootstrap_node_contract(text, text, uuid, text) from public;
revoke all on function public.rpc_protocol_enqueue_command(text, text, int, timestamptz, timestamptz, timestamptz, text, text, text, jsonb, text) from public;
revoke all on function public.rpc_protocol_list_pending_commands(int) from public;
revoke all on function public.rpc_protocol_mark_command_result(text, text, text, text, text, jsonb) from public;

grant execute on function solidary_core.bootstrap_node_contract(text, text, uuid, text) to service_role;
grant execute on function solidary_core.bootstrap_node_contract(text, text, uuid, text) to solidary_root_writer;
grant execute on function solidary_core.enqueue_protocol_command(text, text, int, timestamptz, timestamptz, timestamptz, text, text, text, jsonb, text) to service_role;
grant execute on function solidary_core.enqueue_protocol_command(text, text, int, timestamptz, timestamptz, timestamptz, text, text, text, jsonb, text) to solidary_root_writer;
grant execute on function solidary_core.list_pending_protocol_commands(int) to service_role;
grant execute on function solidary_core.mark_protocol_command_result(text, text, text, text, text, jsonb) to service_role;

grant execute on function public.rpc_protocol_bootstrap_node_contract(text, text, uuid, text) to authenticated;
grant execute on function public.rpc_protocol_bootstrap_node_contract(text, text, uuid, text) to service_role;
grant execute on function public.rpc_protocol_enqueue_command(text, text, int, timestamptz, timestamptz, timestamptz, text, text, text, jsonb, text) to service_role;
grant execute on function public.rpc_protocol_list_pending_commands(int) to service_role;
grant execute on function public.rpc_protocol_mark_command_result(text, text, text, text, text, jsonb) to service_role;
