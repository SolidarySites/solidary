alter table public.indexes
  add column if not exists description text,
  add column if not exists image_url text,
  add column if not exists repo_full_name text,
  add column if not exists repo_url text,
  add column if not exists supabase_project_id text,
  add column if not exists supabase_project_ref text,
  add column if not exists supabase_project_name text,
  add column if not exists supabase_dashboard_url text,
  add column if not exists source text not null default 'manual';

alter table public.indexes
  drop constraint if exists indexes_source_check;

alter table public.indexes
  add constraint indexes_source_check
  check (source in ('manual', 'index_create'));

create table if not exists public.index_provision_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  index_id uuid references public.indexes(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  step text not null default 'Queued',
  error text,
  repo_full_name text,
  repo_payload jsonb,
  project_payload jsonb,
  index_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists index_provision_jobs_owner_created_idx
  on public.index_provision_jobs (owner_user_id, created_at desc);

drop trigger if exists index_provision_jobs_set_updated_at
on public.index_provision_jobs;

create trigger index_provision_jobs_set_updated_at
before update on public.index_provision_jobs
for each row execute function public.set_updated_at();

alter table public.index_provision_jobs enable row level security;

drop policy if exists "index_provision_jobs_owner_access" on public.index_provision_jobs;

create policy "index_provision_jobs_owner_access" on public.index_provision_jobs
  for all using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
