create table if not exists public.repo_provision_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  step text not null default 'Queued',
  error text,
  repo_full_name text,
  repo_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists repo_provision_jobs_owner_created_idx
  on public.repo_provision_jobs (owner_user_id, created_at desc);

create trigger repo_provision_jobs_set_updated_at
before update on public.repo_provision_jobs
for each row execute function public.set_updated_at();

alter table public.repo_provision_jobs enable row level security;

create policy "repo_provision_jobs_owner_access" on public.repo_provision_jobs
  for all using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
