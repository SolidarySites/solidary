alter table public.sites
  drop constraint if exists sites_site_status_check;

drop index if exists sites_site_status_idx;

alter table public.sites
  drop column if exists site_status,
  drop column if exists index_level;

drop index if exists indexes_site_id_idx;

alter table public.indexes
  add column if not exists type text not null default 'index';

update public.indexes
set type = 'index'
where coalesce(type, '') = '';

alter table public.indexes
  drop constraint if exists indexes_type_check;

alter table public.indexes
  add constraint indexes_type_check
  check (type in ('site', 'index'));

create index if not exists indexes_type_idx on public.indexes (type);
create index if not exists indexes_parent_index_idx on public.indexes (parent_index_id);

alter table public.indexes
  drop column if exists site_id;

notify pgrst, 'reload schema';
