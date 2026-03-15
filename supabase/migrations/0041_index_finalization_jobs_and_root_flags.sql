alter table public.archives
  add column if not exists is_root boolean not null default false,
  add column if not exists runtime_mode text not null default 'scaffold',
  add column if not exists parent_repo_full_name text,
  add column if not exists parent_repo_url text,
  add column if not exists finalized_at timestamptz;

alter table public.archives
  drop constraint if exists archives_runtime_mode_check;

alter table public.archives
  add constraint archives_runtime_mode_check
  check (runtime_mode in ('scaffold', 'finalized'));

create index if not exists archives_is_root_idx on public.archives (is_root);
create index if not exists archives_runtime_mode_idx on public.archives (runtime_mode);

update public.archives
set
  is_root = true,
  runtime_mode = 'scaffold'
where coalesce(type, '') = 'index'
  and owner_user_id is null
  and coalesce(source, '') = 'index_create';

create table if not exists public.index_finalization_jobs (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  step text not null default 'Queued',
  error text,
  source_repo_full_name text,
  source_repo_url text,
  source_branch text,
  target_repo_full_name text,
  child_project_ref text,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists index_finalization_jobs_archive_created_idx
  on public.index_finalization_jobs (archive_id, created_at desc);

create index if not exists index_finalization_jobs_owner_created_idx
  on public.index_finalization_jobs (owner_user_id, created_at desc);

drop trigger if exists index_finalization_jobs_set_updated_at
on public.index_finalization_jobs;

create trigger index_finalization_jobs_set_updated_at
before update on public.index_finalization_jobs
for each row execute function public.set_updated_at();

alter table public.index_finalization_jobs enable row level security;

drop policy if exists "index_finalization_jobs_owner_access" on public.index_finalization_jobs;

create policy "index_finalization_jobs_owner_access" on public.index_finalization_jobs
  for all using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

notify pgrst, 'reload schema';
