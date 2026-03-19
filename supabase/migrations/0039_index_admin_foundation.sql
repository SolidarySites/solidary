alter table public.sites
  add column if not exists parent_index_id uuid,
  add column if not exists parent_index_url text,
  add column if not exists parent_index_level int;

create index if not exists sites_parent_index_idx on public.sites (parent_index_id);

alter table public.indexes
  add column if not exists type text not null default 'index',
  add column if not exists index_level int,
  add column if not exists parent_index_id uuid,
  add column if not exists parent_index_url text,
  add column if not exists parent_index_level int;

alter table public.indexes
  drop constraint if exists indexes_type_check;

alter table public.indexes
  add constraint indexes_type_check
  check (type in ('site', 'index'));

create index if not exists indexes_type_idx on public.indexes (type);
create index if not exists indexes_parent_index_idx on public.indexes (parent_index_id);

create table if not exists public.index_project_credentials (
  index_id uuid primary key references public.indexes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  supabase_project_ref text not null,
  supabase_project_url text not null,
  supabase_publishable_key text not null default '',
  supabase_secret_key_encrypted text not null,
  token_encryption_key_version text not null default 'v1',
  repo_owner text not null,
  repo_name text not null,
  repo_full_name text not null,
  repo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists index_project_credentials_owner_idx
  on public.index_project_credentials (owner_user_id, created_at desc);

drop trigger if exists index_project_credentials_set_updated_at
on public.index_project_credentials;

create trigger index_project_credentials_set_updated_at
before update on public.index_project_credentials
for each row execute function public.set_updated_at();

alter table public.index_project_credentials enable row level security;

create table if not exists public.index_admin_memberships (
  index_id uuid not null references public.indexes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (index_id, user_id),
  check (role in ('owner', 'admin', 'editor', 'contributor'))
);

create index if not exists index_admin_memberships_user_idx
  on public.index_admin_memberships (user_id, created_at desc);

drop trigger if exists index_admin_memberships_set_updated_at
on public.index_admin_memberships;

create trigger index_admin_memberships_set_updated_at
before update on public.index_admin_memberships
for each row execute function public.set_updated_at();

alter table public.index_admin_memberships enable row level security;

drop policy if exists "index_admin_memberships_select_self" on public.index_admin_memberships;

create policy "index_admin_memberships_select_self" on public.index_admin_memberships
  for select using (auth.uid() = user_id);

create or replace function public.index_search_collaborator_candidates(
  p_index_id uuid,
  p_actor_user_id uuid,
  p_query text,
  p_limit int default 10
) returns table (
  user_id uuid,
  email text,
  display_name text,
  github_login text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 10), 10));
  v_role text;
begin
  if p_index_id is null or p_actor_user_id is null or v_query is null then
    return;
  end if;

  select iam.role
  into v_role
  from public.index_admin_memberships iam
  where iam.index_id = p_index_id
    and iam.user_id = p_actor_user_id;

  if v_role is null or v_role not in ('owner', 'admin') then
    return;
  end if;

  return query
  select
    u.id::uuid as user_id,
    coalesce(u.email, '')::text as email,
    coalesce(
      nullif(trim(coalesce(
        u.raw_user_meta_data ->> 'name',
        u.raw_user_meta_data ->> 'user_name',
        u.raw_user_meta_data ->> 'preferred_username',
        ''
      )), ''),
      coalesce(u.email, '')
    )::text as display_name,
    nullif(trim(coalesce(
      u.raw_user_meta_data ->> 'user_name',
      u.raw_user_meta_data ->> 'preferred_username',
      ''
    )), '')::text as github_login
  from auth.users u
  where u.id <> p_actor_user_id
    and (
      coalesce(u.email, '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'name', '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'user_name', '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'preferred_username', '') ilike ('%' || v_query || '%')
    )
  order by
    case
      when lower(coalesce(u.raw_user_meta_data ->> 'user_name', '')) = lower(v_query) then 0
      when lower(coalesce(u.email, '')) = lower(v_query) then 1
      else 2
    end,
    coalesce(u.last_sign_in_at, u.created_at) desc
  limit v_limit;
end;
$$;

revoke all on function public.index_search_collaborator_candidates(uuid, uuid, text, int) from public;
grant execute on function public.index_search_collaborator_candidates(uuid, uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
