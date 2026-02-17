-- 0012 introduced helper functions used inside site_drafts RLS policies.
-- Those helpers queried site_drafts again as SECURITY INVOKER, which can
-- recurse into the same policy and overflow the Postgres stack.
-- Make them SECURITY DEFINER so policy evaluation does not recurse.

create or replace function public.site_user_role_for_site(
  p_site_id uuid,
  p_user_id uuid
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.site_drafts d
      where d.site_id = p_site_id
        and d.draft_type = 'owner'
        and d.owner_user_id = p_user_id
    ) then 'owner'
    else (
      select sa.role
      from public.site_admins sa
      where sa.site_id = p_site_id
        and sa.user_id = p_user_id
      limit 1
    )
  end;
$$;

create or replace function public.site_draft_user_can_read(
  p_draft_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with draft as (
    select d.id, d.site_id, d.owner_user_id, d.draft_type
    from public.site_drafts d
    where d.id = p_draft_id
    limit 1
  )
  select exists (
    select 1
    from draft d
    where
      p_user_id = d.owner_user_id
      or (
        d.draft_type = 'owner'
        and public.site_user_role_for_site(d.site_id, p_user_id) in ('owner', 'admin', 'editor', 'viewer')
      )
      or (
        d.draft_type = 'editor'
        and public.site_user_role_for_site(d.site_id, p_user_id) in ('owner', 'admin')
      )
  );
$$;

create or replace function public.site_draft_user_can_edit(
  p_draft_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with draft as (
    select d.id, d.site_id, d.owner_user_id, d.draft_type
    from public.site_drafts d
    where d.id = p_draft_id
    limit 1
  )
  select exists (
    select 1
    from draft d
    where
      p_user_id = d.owner_user_id
      or (
        d.draft_type = 'owner'
        and public.site_user_role_for_site(d.site_id, p_user_id) in ('owner', 'admin')
      )
  );
$$;

revoke all on function public.site_user_role_for_site(uuid, uuid) from public;
grant execute on function public.site_user_role_for_site(uuid, uuid) to authenticated;

revoke all on function public.site_draft_user_can_read(uuid, uuid) from public;
grant execute on function public.site_draft_user_can_read(uuid, uuid) to authenticated;

revoke all on function public.site_draft_user_can_edit(uuid, uuid) from public;
grant execute on function public.site_draft_user_can_edit(uuid, uuid) to authenticated;
