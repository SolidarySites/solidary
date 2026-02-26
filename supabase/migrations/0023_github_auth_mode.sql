alter table public.github_app_user_tokens
  add column if not exists auth_mode text not null default 'solidary';

alter table public.github_app_user_tokens
  drop constraint if exists github_app_user_tokens_auth_mode_check;

alter table public.github_app_user_tokens
  add constraint github_app_user_tokens_auth_mode_check
  check (auth_mode in ('solidary', 'github'));
