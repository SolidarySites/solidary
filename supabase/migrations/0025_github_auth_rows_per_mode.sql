update public.github_app_user_tokens
set auth_mode = 'solidary'
where auth_mode is null
   or btrim(auth_mode) = '';

alter table public.github_app_user_tokens
  alter column auth_mode set default 'solidary';

alter table public.github_app_user_tokens
  alter column auth_mode set not null;

alter table public.github_app_user_tokens
  drop constraint if exists github_app_user_tokens_auth_mode_check;

alter table public.github_app_user_tokens
  add constraint github_app_user_tokens_auth_mode_check
  check (auth_mode in ('solidary', 'github'));

alter table public.github_app_user_tokens
  drop constraint if exists github_app_user_tokens_pkey;

alter table public.github_app_user_tokens
  add constraint github_app_user_tokens_pkey primary key (user_id, auth_mode);

create index if not exists github_app_user_tokens_user_id_idx
  on public.github_app_user_tokens (user_id);
