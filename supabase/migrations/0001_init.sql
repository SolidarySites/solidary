-- Solidary Links master schema
create extension if not exists "pgcrypto";

-- Sites
create table if not exists public.sites (
  id uuid primary key,
  canonical_url text not null unique,
  title text,
  description text,
  image_url text,
  visibility text not null default 'public',
  protocol_version text not null default '1.0',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_manifest_hash text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility in ('public', 'unlisted', 'private'))
);

create index if not exists sites_visibility_idx on public.sites (visibility);

-- Site URL history
create table if not exists public.site_urls (
  site_id uuid not null references public.sites(id) on delete cascade,
  url text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  is_canonical boolean not null default false,
  primary key (site_id, url)
);

create index if not exists site_urls_url_idx on public.site_urls (url);
create index if not exists site_urls_canonical_idx on public.site_urls (site_id, is_canonical);

-- Archives
create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  slug text not null unique,
  title text not null,
  canonical_url text,
  availability_window_days int not null default 14,
  default_ui_depth int not null default 2,
  max_ui_depth int not null default 6,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9-]{3,48}$')
);

-- Archive ↔ site tracking
create table if not exists public.archive_sites (
  archive_id uuid not null references public.archives(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  status text not null default 'tracked',
  delist_reason_code text,
  delist_note text,
  created_at timestamptz not null default now(),
  primary key (archive_id, site_id),
  check (status in ('tracked', 'delisted'))
);

create index if not exists archive_sites_status_idx on public.archive_sites (archive_id, status);

-- Archive membership events
create table if not exists public.archive_membership_events (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  event_kind text not null,
  at timestamptz not null default now(),
  snapshot_id uuid null,
  note text,
  check (event_kind in ('added', 'inactive', 'reactivated', 'delisted'))
);

create index if not exists archive_membership_events_site_idx on public.archive_membership_events (site_id, at desc);

-- Observations
create table if not exists public.site_observations (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  url text not null,
  status_code int,
  etag text,
  last_modified text,
  bytes int,
  error text
);

create index if not exists site_observations_site_idx on public.site_observations (site_id, fetched_at desc);
create index if not exists site_observations_archive_idx on public.site_observations (archive_id, fetched_at desc);

-- Snapshots
create table if not exists public.site_snapshots (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  snapshot_id text not null,
  dataset_hash text not null,
  hash_algo text not null default 'sha256',
  created_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique (site_id, dataset_hash)
);

create index if not exists site_snapshots_site_idx on public.site_snapshots (site_id, ingested_at desc);

-- Snapshot pages
create table if not exists public.snapshot_pages (
  snapshot_pk uuid not null references public.site_snapshots(id) on delete cascade,
  rel text not null,
  url text not null,
  page_hash text not null,
  bytes int,
  content_type text,
  primary key (snapshot_pk, rel, url),
  check (rel in ('docs', 'links', 'archives'))
);

-- Docs cache (optional)
create table if not exists public.docs_cache (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  doc_id text not null,
  url text not null,
  title text,
  occurred_at timestamptz,
  tags text[] not null default '{}',
  visibility text not null default 'public',
  doc_hash text not null,
  last_seen_snapshot_pk uuid references public.site_snapshots(id) on delete set null,
  unique (site_id, doc_id),
  check (visibility in ('public', 'unlisted', 'private'))
);

create index if not exists docs_cache_site_idx on public.docs_cache (site_id);
create index if not exists docs_cache_tags_gin on public.docs_cache using gin (tags);

-- Edges
create table if not exists public.edges (
  id uuid primary key,
  source_site_id uuid not null references public.sites(id) on delete cascade,
  source_doc_cache_id uuid references public.docs_cache(id) on delete set null,
  kind text not null,
  target_type text not null,
  target_site_url text,
  target_doc_url text,
  target_external_url text,
  asserted_by_site_id uuid not null references public.sites(id) on delete cascade,
  asserted_at timestamptz,
  evidence_url text not null,
  evidence_hash text not null,
  edge_hash text not null,
  last_seen_snapshot_pk uuid references public.site_snapshots(id) on delete set null,
  check (target_type in ('site', 'doc', 'external')),
  check (
    (target_type = 'site' and target_site_url is not null and target_doc_url is null and target_external_url is null)
    or (target_type = 'doc' and target_site_url is not null and target_doc_url is not null and target_external_url is null)
    or (target_type = 'external' and target_site_url is null and target_doc_url is null and target_external_url is not null)
  )
);

create index if not exists edges_source_site_idx on public.edges (source_site_id);
create index if not exists edges_kind_idx on public.edges (kind);
create index if not exists edges_target_site_idx on public.edges (target_site_url);
create index if not exists edges_edge_hash_idx on public.edges (edge_hash);

-- Edge verification events
create table if not exists public.edge_verification_events (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  edge_id uuid not null references public.edges(id) on delete cascade,
  status text not null,
  at timestamptz not null default now(),
  basis jsonb not null default '{}'::jsonb,
  check (status in ('asserted', 'mutual', 'attested', 'stale'))
);

create index if not exists edge_verification_events_idx on public.edge_verification_events (archive_id, edge_id, at desc);

-- Site admins
create table if not exists public.site_admins (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  primary key (site_id, user_id),
  check (role in ('owner', 'admin', 'editor', 'viewer'))
);

create index if not exists site_admins_user_idx on public.site_admins (user_id);

-- Updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sites_set_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

create trigger archives_set_updated_at
before update on public.archives
for each row execute function public.set_updated_at();

-- RLS
alter table public.sites enable row level security;
alter table public.site_urls enable row level security;
alter table public.archives enable row level security;
alter table public.archive_sites enable row level security;
alter table public.archive_membership_events enable row level security;
alter table public.site_observations enable row level security;
alter table public.site_snapshots enable row level security;
alter table public.snapshot_pages enable row level security;
alter table public.docs_cache enable row level security;
alter table public.edges enable row level security;
alter table public.edge_verification_events enable row level security;
alter table public.site_admins enable row level security;

-- Public read access to sites + urls
create policy "sites_select_public" on public.sites
  for select using (true);

create policy "site_urls_select_public" on public.site_urls
  for select using (true);

-- Archives owner policies
create policy "archives_select_owner" on public.archives
  for select using (auth.uid() = owner_user_id);

create policy "archives_insert_owner" on public.archives
  for insert with check (auth.uid() = owner_user_id);

create policy "archives_update_owner" on public.archives
  for update using (auth.uid() = owner_user_id);

-- Archive sites management by owner
create policy "archive_sites_select_owner" on public.archive_sites
  for select using (
    exists (
      select 1 from public.archives a
      where a.id = archive_sites.archive_id
        and a.owner_user_id = auth.uid()
    )
  );

create policy "archive_sites_insert_owner" on public.archive_sites
  for insert with check (
    exists (
      select 1 from public.archives a
      where a.id = archive_sites.archive_id
        and a.owner_user_id = auth.uid()
    )
  );

create policy "archive_sites_update_owner" on public.archive_sites
  for update using (
    exists (
      select 1 from public.archives a
      where a.id = archive_sites.archive_id
        and a.owner_user_id = auth.uid()
    )
  );

create policy "archive_sites_delete_owner" on public.archive_sites
  for delete using (
    exists (
      select 1 from public.archives a
      where a.id = archive_sites.archive_id
        and a.owner_user_id = auth.uid()
    )
  );

-- Docs cache read: public only
create policy "docs_cache_select_public" on public.docs_cache
  for select using (visibility = 'public');

-- Site admins read for user
create policy "site_admins_select_owner" on public.site_admins
  for select using (auth.uid() = user_id);

-- RPCs
create or replace function public.rpc_edges_for_site(
  archive_id uuid,
  site_id uuid
) returns setof public.edges
language sql
security definer
set search_path = public
as $$
  select e.*
  from public.edges e
  join public.archive_sites a
    on a.site_id = e.source_site_id
   and a.archive_id = rpc_edges_for_site.archive_id
  join public.archives ar
    on ar.id = a.archive_id
  where ar.owner_user_id = auth.uid()
    and a.status = 'tracked'
    and e.source_site_id = rpc_edges_for_site.site_id;
$$;

create or replace function public.rpc_graph_traverse(
  archive_id uuid,
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
    join public.archive_sites a
      on a.site_id = e.source_site_id
     and a.archive_id = rpc_graph_traverse.archive_id
    join public.archives ar
      on ar.id = a.archive_id
    where ar.owner_user_id = auth.uid()
      and a.status = 'tracked'
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
    join public.archive_sites a
      on a.site_id = e.source_site_id
     and a.archive_id = rpc_graph_traverse.archive_id
    join public.archives ar
      on ar.id = a.archive_id
    where ar.owner_user_id = auth.uid()
      and a.status = 'tracked'
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
