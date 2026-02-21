create table if not exists public.github_app_user_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_user_id bigint,
  github_login text,
  access_token text not null,
  access_token_expires_at timestamptz,
  refresh_token text,
  refresh_token_expires_at timestamptz,
  token_type text,
  scope text,
  installation_id bigint,
  installation_account_login text,
  installation_account_type text,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists github_app_user_tokens_github_user_id_idx
  on public.github_app_user_tokens (github_user_id);

create index if not exists github_app_user_tokens_installation_id_idx
  on public.github_app_user_tokens (installation_id);

create index if not exists github_app_user_tokens_access_token_expires_idx
  on public.github_app_user_tokens (access_token_expires_at);

drop trigger if exists github_app_user_tokens_set_updated_at on public.github_app_user_tokens;
create trigger github_app_user_tokens_set_updated_at
before update on public.github_app_user_tokens
for each row execute function public.set_updated_at();

alter table public.github_app_user_tokens enable row level security;
