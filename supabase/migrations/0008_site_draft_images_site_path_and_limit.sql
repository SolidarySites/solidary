alter table public.site_draft_images
  add column if not exists site_path text;

update public.site_draft_images
set site_path = '/images/uploads/' || coalesce(
  nullif(regexp_replace(storage_path, '^.*/', ''), ''),
  md5(storage_path) || '.img'
)
where site_path is null;

alter table public.site_draft_images
  alter column site_path set not null;

create unique index if not exists site_draft_images_draft_site_path_idx
  on public.site_draft_images (draft_id, site_path);

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
where id = 'site-draft-images';
