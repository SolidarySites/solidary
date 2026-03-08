create table if not exists public.supabase_management_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token_encrypted text not null,
  access_token_expires_at timestamptz,
  refresh_token_encrypted text,
  refresh_token_expires_at timestamptz,
  token_encryption_key_version text not null default 'v1',
  token_type text,
  scope text not null default '',
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supabase_management_connections_access_token_expires_idx
  on public.supabase_management_connections (access_token_expires_at);

drop trigger if exists supabase_management_connections_set_updated_at
on public.supabase_management_connections;

create trigger supabase_management_connections_set_updated_at
before update on public.supabase_management_connections
for each row execute function public.set_updated_at();

alter table public.supabase_management_connections enable row level security;
