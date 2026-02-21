alter table public.github_app_user_tokens
  drop column if exists access_token,
  drop column if exists refresh_token;
