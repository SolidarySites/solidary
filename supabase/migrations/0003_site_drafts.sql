create table if not exists public.site_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  repo_full_name text not null,
  branch text not null default 'main',
  commit_sha text not null,
  files jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, repo_full_name)
);

create trigger site_drafts_set_updated_at
before update on public.site_drafts
for each row execute function public.set_updated_at();

alter table public.site_drafts enable row level security;

create policy "site_drafts_owner_access" on public.site_drafts
  for all using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
