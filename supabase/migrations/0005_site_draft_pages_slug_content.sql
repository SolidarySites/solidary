alter table public.site_draft_pages
  add column if not exists slug text not null default '',
  add column if not exists content text not null default '';

alter table public.site_draft_pages
  add constraint site_draft_pages_draft_slug_unique unique (draft_id, slug);

create index if not exists site_draft_pages_draft_slug_idx
  on public.site_draft_pages (draft_id, slug);
