do $$
begin
  create policy "sites_update_owner_or_admin" on public.sites
    for update using (
      exists (
        select 1
        from public.site_drafts d
        where d.id = sites.id
          and d.owner_user_id = auth.uid()
      )
      or exists (
        select 1
        from public.site_admins sa
        where sa.site_id = sites.id
          and sa.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.site_drafts d
        where d.id = sites.id
          and d.owner_user_id = auth.uid()
      )
      or exists (
        select 1
        from public.site_admins sa
        where sa.site_id = sites.id
          and sa.user_id = auth.uid()
      )
    );
exception
  when duplicate_object then null;
end $$;
