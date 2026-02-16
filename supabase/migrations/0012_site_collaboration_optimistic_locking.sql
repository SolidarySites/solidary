alter table public.site_drafts
  add column if not exists revision bigint not null default 1,
  add column if not exists last_edited_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists last_edited_at timestamptz;

update public.site_drafts
set revision = 1
where revision < 1;

create or replace function public.site_drafts_locking_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id <> old.owner_user_id then
    raise exception 'owner_user_id is immutable for site_drafts';
  end if;

  new.revision = old.revision + 1;
  new.last_edited_by_user_id = coalesce(new.last_edited_by_user_id, auth.uid(), old.last_edited_by_user_id);
  new.last_edited_at = coalesce(new.last_edited_at, now());

  return new;
end;
$$;

drop trigger if exists site_drafts_locking_before_update on public.site_drafts;

create trigger site_drafts_locking_before_update
before update on public.site_drafts
for each row execute function public.site_drafts_locking_before_update();

drop policy if exists "site_drafts_owner_access" on public.site_drafts;
drop policy if exists "site_drafts_select_owner_or_collaborator" on public.site_drafts;
drop policy if exists "site_drafts_insert_owner" on public.site_drafts;
drop policy if exists "site_drafts_update_owner_admin_editor" on public.site_drafts;
drop policy if exists "site_drafts_delete_owner" on public.site_drafts;

create policy "site_drafts_select_owner_or_collaborator" on public.site_drafts
  for select using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from public.site_admins sa
      where sa.site_id = site_drafts.id
        and sa.user_id = auth.uid()
    )
  );

create policy "site_drafts_insert_owner" on public.site_drafts
  for insert with check (auth.uid() = owner_user_id);

create policy "site_drafts_update_owner_admin_editor" on public.site_drafts
  for update using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from public.site_admins sa
      where sa.site_id = site_drafts.id
        and sa.user_id = auth.uid()
        and sa.role in ('admin', 'editor')
    )
  )
  with check (
    auth.uid() = owner_user_id
    or exists (
      select 1 from public.site_admins sa
      where sa.site_id = site_drafts.id
        and sa.user_id = auth.uid()
        and sa.role in ('admin', 'editor')
    )
  );

create policy "site_drafts_delete_owner" on public.site_drafts
  for delete using (auth.uid() = owner_user_id);

drop policy if exists "site_admins_select_owner" on public.site_admins;
drop policy if exists "site_admins_select_self_or_site_owner" on public.site_admins;
drop policy if exists "site_admins_insert_site_owner" on public.site_admins;
drop policy if exists "site_admins_update_site_owner" on public.site_admins;
drop policy if exists "site_admins_delete_site_owner" on public.site_admins;

create policy "site_admins_select_self_or_site_owner" on public.site_admins
  for select using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

create policy "site_admins_insert_site_owner" on public.site_admins
  for insert with check (
    user_id <> auth.uid()
    and role in ('admin', 'editor', 'viewer')
    and exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

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
    and role in ('admin', 'editor', 'viewer')
    and exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

create policy "site_admins_delete_site_owner" on public.site_admins
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

drop policy if exists "site_draft_pages_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_select_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_insert_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_update_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_delete_access" on public.site_draft_pages;

create policy "site_draft_pages_select_access" on public.site_draft_pages
  for select using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
          )
        )
    )
  );

create policy "site_draft_pages_insert_access" on public.site_draft_pages
  for insert with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_pages_update_access" on public.site_draft_pages
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_pages_delete_access" on public.site_draft_pages
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

drop policy if exists "site_draft_settings_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_select_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_insert_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_update_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_delete_access" on public.site_draft_settings;

create policy "site_draft_settings_select_access" on public.site_draft_settings
  for select using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
          )
        )
    )
  );

create policy "site_draft_settings_insert_access" on public.site_draft_settings
  for insert with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_settings_update_access" on public.site_draft_settings
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_settings_delete_access" on public.site_draft_settings
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

drop policy if exists "site_draft_images_access" on public.site_draft_images;
drop policy if exists "site_draft_images_select_access" on public.site_draft_images;
drop policy if exists "site_draft_images_insert_access" on public.site_draft_images;
drop policy if exists "site_draft_images_update_access" on public.site_draft_images;
drop policy if exists "site_draft_images_delete_access" on public.site_draft_images;

create policy "site_draft_images_select_access" on public.site_draft_images
  for select using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
          )
        )
    )
  );

create policy "site_draft_images_insert_access" on public.site_draft_images
  for insert with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_images_update_access" on public.site_draft_images
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_images_delete_access" on public.site_draft_images
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

drop policy if exists "site_draft_images_objects_insert" on storage.objects;
drop policy if exists "site_draft_images_objects_update" on storage.objects;
drop policy if exists "site_draft_images_objects_delete" on storage.objects;

create policy "site_draft_images_objects_insert" on storage.objects
  for insert with check (
    bucket_id = 'site-draft-images'
    and (
      (
        (storage.foldername(name))[1] = 'drafts'
        and exists (
          select 1
          from public.site_drafts d
          where d.id::text = (storage.foldername(name))[2]
            and (
              d.owner_user_id = auth.uid()
              or exists (
                select 1
                from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
                  and sa.role in ('admin', 'editor')
              )
            )
        )
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'create-site'
      )
    )
  );

create policy "site_draft_images_objects_update" on storage.objects
  for update using (
    bucket_id = 'site-draft-images'
    and (
      (
        (storage.foldername(name))[1] = 'drafts'
        and exists (
          select 1
          from public.site_drafts d
          where d.id::text = (storage.foldername(name))[2]
            and (
              d.owner_user_id = auth.uid()
              or exists (
                select 1
                from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
                  and sa.role in ('admin', 'editor')
              )
            )
        )
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'create-site'
      )
    )
  )
  with check (
    bucket_id = 'site-draft-images'
    and (
      (
        (storage.foldername(name))[1] = 'drafts'
        and exists (
          select 1
          from public.site_drafts d
          where d.id::text = (storage.foldername(name))[2]
            and (
              d.owner_user_id = auth.uid()
              or exists (
                select 1
                from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
                  and sa.role in ('admin', 'editor')
              )
            )
        )
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'create-site'
      )
    )
  );

create policy "site_draft_images_objects_delete" on storage.objects
  for delete using (
    bucket_id = 'site-draft-images'
    and (
      (
        (storage.foldername(name))[1] = 'drafts'
        and exists (
          select 1
          from public.site_drafts d
          where d.id::text = (storage.foldername(name))[2]
            and (
              d.owner_user_id = auth.uid()
              or exists (
                select 1
                from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
                  and sa.role in ('admin', 'editor')
              )
            )
        )
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'create-site'
      )
    )
  );

drop policy if exists "sites_update_owner_or_admin" on public.sites;

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
        and sa.role in ('admin', 'editor')
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
        and sa.role in ('admin', 'editor')
    )
  );

drop policy if exists "sites_delete_owner_or_admin" on public.sites;

create policy "sites_delete_owner_or_admin" on public.sites
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = sites.id
        and d.owner_user_id = auth.uid()
    )
  );
