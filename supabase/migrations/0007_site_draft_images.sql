create table if not exists public.site_draft_images (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.site_drafts(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists site_draft_images_draft_idx on public.site_draft_images (draft_id);

alter table public.site_draft_images enable row level security;

create policy "site_draft_images_access" on public.site_draft_images
  for all using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
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
  with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1 from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
          )
        )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-draft-images',
  'site-draft-images',
  true,
  104857600,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "site_draft_images_objects_insert" on storage.objects
  for insert with check (
    bucket_id = 'site-draft-images'
    and (storage.foldername(name))[1] = 'drafts'
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
  );

create policy "site_draft_images_objects_update" on storage.objects
  for update using (
    bucket_id = 'site-draft-images'
    and (storage.foldername(name))[1] = 'drafts'
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
  with check (
    bucket_id = 'site-draft-images'
    and (storage.foldername(name))[1] = 'drafts'
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
  );

create policy "site_draft_images_objects_delete" on storage.objects
  for delete using (
    bucket_id = 'site-draft-images'
    and (storage.foldername(name))[1] = 'drafts'
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
  );
