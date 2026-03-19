drop policy if exists "archives_select_public_root_index" on public.archives;

create policy "archives_select_public_root_index" on public.archives
  for select to anon, authenticated
  using (type = 'index' and is_root = true);

drop policy if exists "archive_sites_insert_root_site_owner" on public.archive_sites;

create policy "archive_sites_insert_root_site_owner" on public.archive_sites
  for insert to authenticated
  with check (
    status = 'tracked'
    and exists (
      select 1
      from public.archives archive
      where archive.id = archive_sites.archive_id
        and archive.type = 'index'
        and archive.is_root = true
    )
    and public.site_user_role_for_site(archive_sites.site_id, auth.uid()) = 'owner'
  );

notify pgrst, 'reload schema';
