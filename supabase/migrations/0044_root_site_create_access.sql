drop policy if exists "indexes_select_public_root_index" on public.indexes;

create policy "indexes_select_public_root_index" on public.indexes
  for select to anon, authenticated
  using (type = 'index' and is_root = true);

drop policy if exists "index_sites_insert_root_site_owner" on public.index_sites;

create policy "index_sites_insert_root_site_owner" on public.index_sites
  for insert to authenticated
  with check (
    status = 'tracked'
    and exists (
      select 1
      from public.indexes index_row
      where index_row.id = index_sites.index_id
        and index_row.type = 'index'
        and index_row.is_root = true
    )
    and public.site_user_role_for_site(index_sites.site_id, auth.uid()) = 'owner'
  );

notify pgrst, 'reload schema';
