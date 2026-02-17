-- Fix return type mismatch in site_search_collaborator_candidates.
-- auth.users.email is varchar, while function output column is text.
-- Cast return columns explicitly so RPC calls do not fail with 42804.

create or replace function public.site_search_collaborator_candidates(
  p_draft_id uuid,
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
begin
  if auth.uid() is null then
    return;
  end if;

  if v_query is null then
    return;
  end if;

  if not exists (
    select 1
    from public.site_drafts d
    where d.id = p_draft_id
      and d.owner_user_id = auth.uid()
  ) then
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
  where u.id <> auth.uid()
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

revoke all on function public.site_search_collaborator_candidates(uuid, text, int) from public;
grant execute on function public.site_search_collaborator_candidates(uuid, text, int) to authenticated;
