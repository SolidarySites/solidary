-- Ensure every draft has a matching site row so site deletion can be the single source of truth.
insert into public.sites (id, meta)
select
  d.id,
  jsonb_build_object('completion', 'draft', 'source', 'studio')
from public.site_drafts d
left join public.sites s on s.id = d.id
where s.id is null;

-- Link drafts to sites and cascade draft deletion when a site is deleted.
do $$
begin
  alter table public.site_drafts
    add constraint site_drafts_id_fkey
    foreign key (id)
    references public.sites(id)
    on delete cascade;
exception
  when duplicate_object then null;
end $$;

-- Allow owners/admins to delete sites directly.
do $$
begin
  create policy "sites_delete_owner_or_admin" on public.sites
    for delete using (
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

-- Remove physical draft image objects from Storage whenever draft image metadata rows are deleted.
create or replace function public.delete_site_draft_image_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.storage_path is not null and old.storage_path <> '' then
    delete from storage.objects
    where bucket_id = 'site-draft-images'
      and name = old.storage_path;
  end if;

  return old;
end;
$$;

drop trigger if exists site_draft_images_delete_storage_object on public.site_draft_images;

create trigger site_draft_images_delete_storage_object
after delete on public.site_draft_images
for each row execute function public.delete_site_draft_image_storage_object();
