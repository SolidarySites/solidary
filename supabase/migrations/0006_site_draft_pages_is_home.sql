alter table public.site_draft_pages
  add column if not exists is_home boolean not null default false;

create index if not exists site_draft_pages_draft_home_idx
  on public.site_draft_pages (draft_id, is_home);
