-- Allow temporary create-site staging uploads in site-draft-images bucket.
-- Path format: <auth.uid()>/create-site/<site_id>/<filename>
-- Existing draft image paths under drafts/<draft_id>/... remain supported.

drop policy if exists "site_draft_images_objects_insert" on storage.objects;

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
                select 1 from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
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

drop policy if exists "site_draft_images_objects_update" on storage.objects;

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
                select 1 from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
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
                select 1 from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
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

drop policy if exists "site_draft_images_objects_delete" on storage.objects;

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
                select 1 from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
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
