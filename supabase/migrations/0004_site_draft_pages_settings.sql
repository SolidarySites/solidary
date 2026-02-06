create table if not exists public.site_draft_pages (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.site_drafts(id) on delete cascade,
  title text not null,
  show_in_nav boolean not null default true,
  position int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_draft_pages_draft_idx on public.site_draft_pages (draft_id);

create trigger site_draft_pages_set_updated_at
before update on public.site_draft_pages
for each row execute function public.set_updated_at();

create table if not exists public.site_draft_settings (
  draft_id uuid primary key references public.site_drafts(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  styles jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger site_draft_settings_set_updated_at
before update on public.site_draft_settings
for each row execute function public.set_updated_at();

alter table public.site_draft_pages enable row level security;
alter table public.site_draft_settings enable row level security;

create policy "site_draft_pages_access" on public.site_draft_pages
  for all using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
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
      where d.id = site_draft_pages.draft_id
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

create policy "site_draft_settings_access" on public.site_draft_settings
  for all using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
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
      where d.id = site_draft_settings.draft_id
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
