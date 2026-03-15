alter table public.sites
  drop constraint if exists sites_site_status_check;

drop index if exists sites_site_status_idx;

alter table public.sites
  drop column if exists site_status,
  drop column if exists index_level;

drop index if exists archives_site_id_idx;

alter table public.archives
  add column if not exists type text not null default 'index';

update public.archives
set type = 'index'
where coalesce(type, '') = '';

alter table public.archives
  drop constraint if exists archives_type_check;

alter table public.archives
  add constraint archives_type_check
  check (type in ('site', 'index'));

create index if not exists archives_type_idx on public.archives (type);
create index if not exists archives_parent_index_idx on public.archives (parent_index_id);

alter table public.archives
  drop column if exists site_id;

notify pgrst, 'reload schema';
