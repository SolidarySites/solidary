-- Profile avatars are stored in the "profile" bucket under:
-- profile/<auth.uid()>/<filename>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile',
  'profile',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_objects_select_owner" on storage.objects;
drop policy if exists "profile_objects_insert_owner" on storage.objects;
drop policy if exists "profile_objects_update_owner" on storage.objects;
drop policy if exists "profile_objects_delete_owner" on storage.objects;

create policy "profile_objects_select_owner" on storage.objects
  for select using (
    bucket_id = 'profile'
    and (storage.foldername(name))[1] = 'profile'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "profile_objects_insert_owner" on storage.objects
  for insert with check (
    bucket_id = 'profile'
    and (storage.foldername(name))[1] = 'profile'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "profile_objects_update_owner" on storage.objects
  for update using (
    bucket_id = 'profile'
    and (storage.foldername(name))[1] = 'profile'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile'
    and (storage.foldername(name))[1] = 'profile'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "profile_objects_delete_owner" on storage.objects
  for delete using (
    bucket_id = 'profile'
    and (storage.foldername(name))[1] = 'profile'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
