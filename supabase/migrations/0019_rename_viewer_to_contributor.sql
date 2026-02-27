update public.site_admins
set role = 'contributor'
where role = 'viewer';

alter table public.site_admins
  drop constraint if exists site_admins_role_check;

alter table public.site_admins
  add constraint site_admins_role_check
  check (role in ('owner', 'admin', 'editor', 'contributor'));

drop policy if exists "site_admins_insert_site_owner" on public.site_admins;
create policy "site_admins_insert_site_owner" on public.site_admins
  for insert with check (
    user_id <> auth.uid()
    and role in ('admin', 'editor', 'contributor')
    and exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

drop policy if exists "site_admins_update_site_owner" on public.site_admins;
create policy "site_admins_update_site_owner" on public.site_admins
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  )
  with check (
    user_id <> auth.uid()
    and role in ('admin', 'editor', 'contributor')
    and exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

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
        and public.site_user_role_for_site(d.site_id, p_user_id) in ('owner', 'admin', 'editor', 'contributor')
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
        and public.site_user_role_for_site(d.site_id, p_user_id) in ('owner', 'admin', 'editor')
      )
  );
$$;

revoke all on function public.site_draft_user_can_read(uuid, uuid) from public;
grant execute on function public.site_draft_user_can_read(uuid, uuid) to authenticated;

revoke all on function public.site_draft_user_can_edit(uuid, uuid) from public;
grant execute on function public.site_draft_user_can_edit(uuid, uuid) to authenticated;
