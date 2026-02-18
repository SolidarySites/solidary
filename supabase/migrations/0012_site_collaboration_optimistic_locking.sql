alter table public.site_drafts
  add column if not exists revision bigint not null default 1,
  add column if not exists last_edited_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists last_edited_at timestamptz;

update public.site_drafts
set revision = 1
where revision < 1;

create or replace function public.site_drafts_locking_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id <> old.owner_user_id then
    raise exception 'owner_user_id is immutable for site_drafts';
  end if;

  new.revision = old.revision + 1;
  new.last_edited_by_user_id = coalesce(new.last_edited_by_user_id, auth.uid(), old.last_edited_by_user_id);
  new.last_edited_at = coalesce(new.last_edited_at, now());

  return new;
end;
$$;

drop trigger if exists site_drafts_locking_before_update on public.site_drafts;

create trigger site_drafts_locking_before_update
before update on public.site_drafts
for each row execute function public.site_drafts_locking_before_update();

drop policy if exists "site_drafts_owner_access" on public.site_drafts;
drop policy if exists "site_drafts_select_owner_or_collaborator" on public.site_drafts;
drop policy if exists "site_drafts_insert_owner" on public.site_drafts;
drop policy if exists "site_drafts_update_owner_admin_editor" on public.site_drafts;
drop policy if exists "site_drafts_delete_owner" on public.site_drafts;

create policy "site_drafts_select_owner_or_collaborator" on public.site_drafts
  for select using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from public.site_admins sa
      where sa.site_id = site_drafts.id
        and sa.user_id = auth.uid()
    )
  );

create policy "site_drafts_insert_owner" on public.site_drafts
  for insert with check (auth.uid() = owner_user_id);

create policy "site_drafts_update_owner_admin_editor" on public.site_drafts
  for update using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from public.site_admins sa
      where sa.site_id = site_drafts.id
        and sa.user_id = auth.uid()
        and sa.role in ('admin', 'editor')
    )
  )
  with check (
    auth.uid() = owner_user_id
    or exists (
      select 1 from public.site_admins sa
      where sa.site_id = site_drafts.id
        and sa.user_id = auth.uid()
        and sa.role in ('admin', 'editor')
    )
  );

create policy "site_drafts_delete_owner" on public.site_drafts
  for delete using (auth.uid() = owner_user_id);

drop policy if exists "site_admins_select_owner" on public.site_admins;
drop policy if exists "site_admins_select_self_or_site_owner" on public.site_admins;
drop policy if exists "site_admins_insert_site_owner" on public.site_admins;
drop policy if exists "site_admins_update_site_owner" on public.site_admins;
drop policy if exists "site_admins_delete_site_owner" on public.site_admins;

create policy "site_admins_select_self_or_site_owner" on public.site_admins
  for select using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

create policy "site_admins_insert_site_owner" on public.site_admins
  for insert with check (
    user_id <> auth.uid()
    and role in ('admin', 'editor', 'viewer')
    and exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

create policy "site_admins_update_site_owner" on public.site_admins
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  )
  with check (
    user_id <> auth.uid()
    and role in ('admin', 'editor', 'viewer')
    and exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

create policy "site_admins_delete_site_owner" on public.site_admins
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_admins.site_id
        and d.owner_user_id = auth.uid()
    )
  );

drop policy if exists "site_draft_pages_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_select_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_insert_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_update_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_delete_access" on public.site_draft_pages;

create policy "site_draft_pages_select_access" on public.site_draft_pages
  for select using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
          )
        )
    )
  );

create policy "site_draft_pages_insert_access" on public.site_draft_pages
  for insert with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_pages_update_access" on public.site_draft_pages
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
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
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_pages_delete_access" on public.site_draft_pages
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_pages.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

drop policy if exists "site_draft_settings_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_select_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_insert_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_update_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_delete_access" on public.site_draft_settings;

create policy "site_draft_settings_select_access" on public.site_draft_settings
  for select using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
          )
        )
    )
  );

create policy "site_draft_settings_insert_access" on public.site_draft_settings
  for insert with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_settings_update_access" on public.site_draft_settings
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
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
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_settings_delete_access" on public.site_draft_settings
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_settings.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

drop policy if exists "site_draft_images_access" on public.site_draft_images;
drop policy if exists "site_draft_images_select_access" on public.site_draft_images;
drop policy if exists "site_draft_images_insert_access" on public.site_draft_images;
drop policy if exists "site_draft_images_update_access" on public.site_draft_images;
drop policy if exists "site_draft_images_delete_access" on public.site_draft_images;

create policy "site_draft_images_select_access" on public.site_draft_images
  for select using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
          )
        )
    )
  );

create policy "site_draft_images_insert_access" on public.site_draft_images
  for insert with check (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_images_update_access" on public.site_draft_images
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
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
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

create policy "site_draft_images_delete_access" on public.site_draft_images
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = site_draft_images.draft_id
        and (
          d.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.site_admins sa
            where sa.site_id = d.id
              and sa.user_id = auth.uid()
              and sa.role in ('admin', 'editor')
          )
        )
    )
  );

drop policy if exists "site_draft_images_objects_insert" on storage.objects;
drop policy if exists "site_draft_images_objects_update" on storage.objects;
drop policy if exists "site_draft_images_objects_delete" on storage.objects;

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
                select 1
                from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
                  and sa.role in ('admin', 'editor')
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
                select 1
                from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
                  and sa.role in ('admin', 'editor')
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
                select 1
                from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
                  and sa.role in ('admin', 'editor')
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
                select 1
                from public.site_admins sa
                where sa.site_id = d.id
                  and sa.user_id = auth.uid()
                  and sa.role in ('admin', 'editor')
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

drop policy if exists "sites_update_owner_or_admin" on public.sites;

create policy "sites_update_owner_or_admin" on public.sites
  for update using (
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
        and sa.role in ('admin', 'editor')
    )
  )
  with check (
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
        and sa.role in ('admin', 'editor')
    )
  );

drop policy if exists "sites_delete_owner_or_admin" on public.sites;

create policy "sites_delete_owner_or_admin" on public.sites
  for delete using (
    exists (
      select 1
      from public.site_drafts d
      where d.id = sites.id
        and d.owner_user_id = auth.uid()
    )
  );

create or replace function public.site_draft_user_can_read(
  p_draft_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.site_drafts d
    where d.id = p_draft_id
      and (
        d.owner_user_id = p_user_id
        or exists (
          select 1
          from public.site_admins sa
          where sa.site_id = d.id
            and sa.user_id = p_user_id
        )
      )
  );
$$;

create or replace function public.site_draft_user_can_edit(
  p_draft_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.site_drafts d
    where d.id = p_draft_id
      and (
        d.owner_user_id = p_user_id
        or exists (
          select 1
          from public.site_admins sa
          where sa.site_id = d.id
            and sa.user_id = p_user_id
            and sa.role in ('admin', 'editor')
        )
      )
  );
$$;

create table if not exists public.site_draft_section_locks (
  draft_id uuid not null references public.site_drafts(id) on delete cascade,
  section_key text not null,
  locked_by_user_id uuid not null references auth.users(id) on delete cascade,
  locked_by_name text not null default 'Unknown',
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (draft_id, section_key),
  check (
    section_key in ('metadata', 'pages', 'header', 'footer', 'styles')
    or section_key ~ '^page:[a-z0-9][a-z0-9_-]*$'
  )
);

create index if not exists site_draft_section_locks_draft_expires_idx
  on public.site_draft_section_locks (draft_id, expires_at);

drop trigger if exists site_draft_section_locks_set_updated_at on public.site_draft_section_locks;

create trigger site_draft_section_locks_set_updated_at
before update on public.site_draft_section_locks
for each row execute function public.set_updated_at();

alter table public.site_draft_section_locks enable row level security;

drop policy if exists "site_draft_section_locks_select_access" on public.site_draft_section_locks;
drop policy if exists "site_draft_section_locks_delete_self" on public.site_draft_section_locks;

create policy "site_draft_section_locks_select_access" on public.site_draft_section_locks
  for select using (public.site_draft_user_can_read(draft_id, auth.uid()));

create policy "site_draft_section_locks_delete_self" on public.site_draft_section_locks
  for delete using (
    public.site_draft_user_can_edit(draft_id, auth.uid())
    and locked_by_user_id = auth.uid()
  );

create or replace function public.site_draft_acquire_section_lock(
  p_draft_id uuid,
  p_section_key text,
  p_holder_name text default null,
  p_ttl_seconds int default 45
) returns table (
  acquired boolean,
  lock_user_id uuid,
  lock_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_ttl_seconds int := greatest(15, least(coalesce(p_ttl_seconds, 45), 300));
  v_expires_at timestamptz := v_now + make_interval(secs => v_ttl_seconds);
  v_holder_name text := coalesce(nullif(trim(p_holder_name), ''), 'Unknown');
  v_row public.site_draft_section_locks%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if
    p_section_key not in ('metadata', 'pages', 'header', 'footer', 'styles')
    and p_section_key !~ '^page:[a-z0-9][a-z0-9_-]*$'
  then
    raise exception 'Invalid section key.';
  end if;

  if not public.site_draft_user_can_edit(p_draft_id, v_user_id) then
    raise exception 'You do not have edit access to this draft.';
  end if;

  delete from public.site_draft_section_locks l
  where l.draft_id = p_draft_id
    and l.section_key = p_section_key
    and l.expires_at <= v_now;

  insert into public.site_draft_section_locks (
    draft_id,
    section_key,
    locked_by_user_id,
    locked_by_name,
    locked_at,
    expires_at
  )
  values (
    p_draft_id,
    p_section_key,
    v_user_id,
    v_holder_name,
    v_now,
    v_expires_at
  )
  on conflict (draft_id, section_key) do update
  set
    locked_by_user_id = excluded.locked_by_user_id,
    locked_by_name = excluded.locked_by_name,
    locked_at = excluded.locked_at,
    expires_at = excluded.expires_at
  where
    public.site_draft_section_locks.locked_by_user_id = v_user_id
    or public.site_draft_section_locks.expires_at <= v_now;

  select *
  into v_row
  from public.site_draft_section_locks
  where draft_id = p_draft_id
    and section_key = p_section_key
  limit 1;

  if not found then
    return query select false, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  return query
  select
    v_row.locked_by_user_id = v_user_id,
    v_row.locked_by_user_id,
    v_row.locked_by_name,
    v_row.expires_at;
end;
$$;

revoke all on function public.site_draft_acquire_section_lock(uuid, text, text, int) from public;
grant execute on function public.site_draft_acquire_section_lock(uuid, text, text, int) to authenticated;

create or replace function public.site_draft_release_section_lock(
  p_draft_id uuid,
  p_section_key text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  if not public.site_draft_user_can_edit(p_draft_id, v_user_id) then
    return false;
  end if;

  delete from public.site_draft_section_locks
  where draft_id = p_draft_id
    and section_key = p_section_key
    and locked_by_user_id = v_user_id;

  return found;
end;
$$;

revoke all on function public.site_draft_release_section_lock(uuid, text) from public;
grant execute on function public.site_draft_release_section_lock(uuid, text) to authenticated;

create or replace function public.site_draft_release_all_section_locks(
  p_draft_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  if not public.site_draft_user_can_edit(p_draft_id, v_user_id) then
    return 0;
  end if;

  delete from public.site_draft_section_locks
  where draft_id = p_draft_id
    and locked_by_user_id = v_user_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.site_draft_release_all_section_locks(uuid) from public;
grant execute on function public.site_draft_release_all_section_locks(uuid) to authenticated;

create or replace function public.site_draft_upsert_settings_metadata(
  p_draft_id uuid,
  p_title text,
  p_description text,
  p_site_url text,
  p_og_image text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.site_draft_user_can_edit(p_draft_id, auth.uid()) then
    raise exception 'You do not have edit access to this draft.';
  end if;

  insert into public.site_draft_settings (draft_id, settings, styles)
  values (
    p_draft_id,
    jsonb_build_object(
      'title', coalesce(p_title, ''),
      'description', coalesce(p_description, ''),
      'siteUrl', coalesce(p_site_url, ''),
      'ogImage', coalesce(p_og_image, '')
    ),
    '{}'::jsonb
  )
  on conflict (draft_id) do update
  set
    settings = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(public.site_draft_settings.settings, '{}'::jsonb), '{title}', to_jsonb(coalesce(p_title, '')), true),
          '{description}', to_jsonb(coalesce(p_description, '')), true
        ),
        '{siteUrl}', to_jsonb(coalesce(p_site_url, '')), true
      ),
      '{ogImage}', to_jsonb(coalesce(p_og_image, '')), true
    ),
    updated_at = now();
end;
$$;

revoke all on function public.site_draft_upsert_settings_metadata(uuid, text, text, text, text) from public;
grant execute on function public.site_draft_upsert_settings_metadata(uuid, text, text, text, text) to authenticated;

create or replace function public.site_draft_upsert_settings_header(
  p_draft_id uuid,
  p_header jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.site_draft_user_can_edit(p_draft_id, auth.uid()) then
    raise exception 'You do not have edit access to this draft.';
  end if;

  insert into public.site_draft_settings (draft_id, settings, styles)
  values (
    p_draft_id,
    jsonb_build_object('header', coalesce(p_header, '{}'::jsonb)),
    '{}'::jsonb
  )
  on conflict (draft_id) do update
  set
    settings = jsonb_set(
      coalesce(public.site_draft_settings.settings, '{}'::jsonb),
      '{header}',
      coalesce(p_header, '{}'::jsonb),
      true
    ),
    updated_at = now();
end;
$$;

revoke all on function public.site_draft_upsert_settings_header(uuid, jsonb) from public;
grant execute on function public.site_draft_upsert_settings_header(uuid, jsonb) to authenticated;

create or replace function public.site_draft_upsert_settings_footer(
  p_draft_id uuid,
  p_footer jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.site_draft_user_can_edit(p_draft_id, auth.uid()) then
    raise exception 'You do not have edit access to this draft.';
  end if;

  insert into public.site_draft_settings (draft_id, settings, styles)
  values (
    p_draft_id,
    jsonb_build_object('footer', coalesce(p_footer, '{}'::jsonb)),
    '{}'::jsonb
  )
  on conflict (draft_id) do update
  set
    settings = jsonb_set(
      coalesce(public.site_draft_settings.settings, '{}'::jsonb),
      '{footer}',
      coalesce(p_footer, '{}'::jsonb),
      true
    ),
    updated_at = now();
end;
$$;

revoke all on function public.site_draft_upsert_settings_footer(uuid, jsonb) from public;
grant execute on function public.site_draft_upsert_settings_footer(uuid, jsonb) to authenticated;

create or replace function public.site_draft_upsert_settings_styles(
  p_draft_id uuid,
  p_tokens_css text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.site_draft_user_can_edit(p_draft_id, auth.uid()) then
    raise exception 'You do not have edit access to this draft.';
  end if;

  insert into public.site_draft_settings (draft_id, settings, styles)
  values (
    p_draft_id,
    '{}'::jsonb,
    jsonb_build_object('tokensCss', coalesce(p_tokens_css, ''))
  )
  on conflict (draft_id) do update
  set
    styles = jsonb_set(
      coalesce(public.site_draft_settings.styles, '{}'::jsonb),
      '{tokensCss}',
      to_jsonb(coalesce(p_tokens_css, '')),
      true
    ),
    updated_at = now();
end;
$$;

revoke all on function public.site_draft_upsert_settings_styles(uuid, text) from public;
grant execute on function public.site_draft_upsert_settings_styles(uuid, text) to authenticated;

create or replace function public.site_search_collaborator_candidates(
  p_draft_id uuid,
  p_query text,
  p_limit int default 10
) returns table (
  user_id uuid,
  email text,
  display_name text,
  github_login text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 10), 10));
begin
  if auth.uid() is null then
    return;
  end if;

  if v_query is null then
    return;
  end if;

  if not exists (
    select 1
    from public.site_drafts d
    where d.id = p_draft_id
      and d.owner_user_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    u.id::uuid as user_id,
    coalesce(u.email, '')::text as email,
    coalesce(
      nullif(trim(coalesce(
        u.raw_user_meta_data ->> 'name',
        u.raw_user_meta_data ->> 'user_name',
        u.raw_user_meta_data ->> 'preferred_username',
        ''
      )), ''),
      coalesce(u.email, '')
    )::text as display_name,
    nullif(trim(coalesce(
      u.raw_user_meta_data ->> 'user_name',
      u.raw_user_meta_data ->> 'preferred_username',
      ''
    )), '')::text as github_login
  from auth.users u
  where u.id <> auth.uid()
    and (
      coalesce(u.email, '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'name', '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'user_name', '') ilike ('%' || v_query || '%')
      or coalesce(u.raw_user_meta_data ->> 'preferred_username', '') ilike ('%' || v_query || '%')
    )
  order by
    case
      when lower(coalesce(u.raw_user_meta_data ->> 'user_name', '')) = lower(v_query) then 0
      when lower(coalesce(u.email, '')) = lower(v_query) then 1
      else 2
    end,
    coalesce(u.last_sign_in_at, u.created_at) desc
  limit v_limit;
end;
$$;

revoke all on function public.site_search_collaborator_candidates(uuid, text, int) from public;
grant execute on function public.site_search_collaborator_candidates(uuid, text, int) to authenticated;

alter table public.site_drafts
  add column if not exists site_id uuid references public.sites(id) on delete cascade,
  add column if not exists draft_type text not null default 'owner',
  add column if not exists source_owner_draft_id uuid references public.site_drafts(id) on delete set null,
  add column if not exists touched_sections text[] not null default '{}'::text[],
  add column if not exists touched_page_slugs text[] not null default '{}'::text[],
  add column if not exists deleted_page_slugs text[] not null default '{}'::text[],
  add column if not exists editor_branch text,
  add column if not exists last_pull_request_number bigint,
  add column if not exists last_pull_request_url text,
  add column if not exists last_pull_request_state text;

update public.site_drafts
set
  site_id = coalesce(site_id, id),
  draft_type = case
    when draft_type in ('owner', 'editor') then draft_type
    else 'owner'
  end,
  touched_sections = coalesce(touched_sections, '{}'::text[]),
  touched_page_slugs = coalesce(touched_page_slugs, '{}'::text[]),
  deleted_page_slugs = coalesce(deleted_page_slugs, '{}'::text[]);

alter table public.site_drafts
  alter column site_id set not null,
  alter column touched_sections set default '{}'::text[],
  alter column touched_sections set not null,
  alter column touched_page_slugs set default '{}'::text[],
  alter column touched_page_slugs set not null,
  alter column deleted_page_slugs set default '{}'::text[],
  alter column deleted_page_slugs set not null,
  alter column last_pull_request_state set default null;

alter table public.site_drafts
  drop constraint if exists site_drafts_draft_type_check;

alter table public.site_drafts
  add constraint site_drafts_draft_type_check
  check (draft_type in ('owner', 'editor'));

alter table public.site_drafts
  drop constraint if exists site_drafts_owner_site_identity_check;

alter table public.site_drafts
  add constraint site_drafts_owner_site_identity_check
  check (draft_type <> 'owner' or site_id = id);

alter table public.site_drafts
  drop constraint if exists site_drafts_editor_source_required_check;

alter table public.site_drafts
  add constraint site_drafts_editor_source_required_check
  check (draft_type <> 'editor' or source_owner_draft_id is not null);

create unique index if not exists site_drafts_owner_per_site_idx
  on public.site_drafts (site_id)
  where draft_type = 'owner';

create unique index if not exists site_drafts_editor_per_site_user_idx
  on public.site_drafts (site_id, owner_user_id)
  where draft_type = 'editor';

create index if not exists site_drafts_site_id_idx
  on public.site_drafts (site_id);

create or replace function public.site_drafts_locking_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id <> old.owner_user_id then
    raise exception 'owner_user_id is immutable for site_drafts';
  end if;

  if new.site_id <> old.site_id then
    raise exception 'site_id is immutable for site_drafts';
  end if;

  if new.draft_type <> old.draft_type then
    raise exception 'draft_type is immutable for site_drafts';
  end if;

  if new.source_owner_draft_id is distinct from old.source_owner_draft_id then
    raise exception 'source_owner_draft_id is immutable for site_drafts';
  end if;

  new.revision = old.revision + 1;
  new.last_edited_by_user_id = coalesce(new.last_edited_by_user_id, auth.uid(), old.last_edited_by_user_id);
  new.last_edited_at = coalesce(new.last_edited_at, now());

  return new;
end;
$$;

create or replace function public.site_user_role_for_site(
  p_site_id uuid,
  p_user_id uuid
) returns text
language sql
stable
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.site_drafts d
      where d.site_id = p_site_id
        and d.draft_type = 'owner'
        and d.owner_user_id = p_user_id
    ) then 'owner'
    else (
      select sa.role
      from public.site_admins sa
      where sa.site_id = p_site_id
        and sa.user_id = p_user_id
      limit 1
    )
  end;
$$;

create or replace function public.site_draft_user_can_read(
  p_draft_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
set search_path = public
as $$
  with draft as (
    select d.id, d.site_id, d.owner_user_id, d.draft_type
    from public.site_drafts d
    where d.id = p_draft_id
    limit 1
  )
  select exists (
    select 1
    from draft d
    where
      p_user_id = d.owner_user_id
      or (
        d.draft_type = 'owner'
        and public.site_user_role_for_site(d.site_id, p_user_id) in ('owner', 'admin', 'editor', 'viewer')
      )
      or (
        d.draft_type = 'editor'
        and public.site_user_role_for_site(d.site_id, p_user_id) in ('owner', 'admin')
      )
  );
$$;

create or replace function public.site_draft_user_can_edit(
  p_draft_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
set search_path = public
as $$
  with draft as (
    select d.id, d.site_id, d.owner_user_id, d.draft_type
    from public.site_drafts d
    where d.id = p_draft_id
    limit 1
  )
  select exists (
    select 1
    from draft d
    where
      p_user_id = d.owner_user_id
      or (
        d.draft_type = 'owner'
        and public.site_user_role_for_site(d.site_id, p_user_id) in ('owner', 'admin')
      )
  );
$$;

drop policy if exists "site_drafts_select_owner_or_collaborator" on public.site_drafts;
drop policy if exists "site_drafts_insert_owner" on public.site_drafts;
drop policy if exists "site_drafts_update_owner_admin_editor" on public.site_drafts;
drop policy if exists "site_drafts_delete_owner" on public.site_drafts;

create policy "site_drafts_select_owner_or_collaborator" on public.site_drafts
  for select using (public.site_draft_user_can_read(id, auth.uid()));

create policy "site_drafts_insert_owner" on public.site_drafts
  for insert with check (
    auth.uid() = owner_user_id
    and draft_type in ('owner', 'editor')
    and (
      (draft_type = 'owner' and site_id = id and source_owner_draft_id is null)
      or (draft_type = 'editor' and site_id <> id and source_owner_draft_id is not null)
    )
  );

create policy "site_drafts_update_owner_admin_editor" on public.site_drafts
  for update using (public.site_draft_user_can_edit(id, auth.uid()))
  with check (public.site_draft_user_can_edit(id, auth.uid()));

create policy "site_drafts_delete_owner" on public.site_drafts
  for delete using (
    (draft_type = 'owner' and owner_user_id = auth.uid())
    or (draft_type = 'editor' and owner_user_id = auth.uid())
  );

drop policy if exists "site_draft_pages_select_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_insert_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_update_access" on public.site_draft_pages;
drop policy if exists "site_draft_pages_delete_access" on public.site_draft_pages;

create policy "site_draft_pages_select_access" on public.site_draft_pages
  for select using (public.site_draft_user_can_read(draft_id, auth.uid()));

create policy "site_draft_pages_insert_access" on public.site_draft_pages
  for insert with check (public.site_draft_user_can_edit(draft_id, auth.uid()));

create policy "site_draft_pages_update_access" on public.site_draft_pages
  for update using (public.site_draft_user_can_edit(draft_id, auth.uid()))
  with check (public.site_draft_user_can_edit(draft_id, auth.uid()));

create policy "site_draft_pages_delete_access" on public.site_draft_pages
  for delete using (public.site_draft_user_can_edit(draft_id, auth.uid()));

drop policy if exists "site_draft_settings_select_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_insert_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_update_access" on public.site_draft_settings;
drop policy if exists "site_draft_settings_delete_access" on public.site_draft_settings;

create policy "site_draft_settings_select_access" on public.site_draft_settings
  for select using (public.site_draft_user_can_read(draft_id, auth.uid()));

create policy "site_draft_settings_insert_access" on public.site_draft_settings
  for insert with check (public.site_draft_user_can_edit(draft_id, auth.uid()));

create policy "site_draft_settings_update_access" on public.site_draft_settings
  for update using (public.site_draft_user_can_edit(draft_id, auth.uid()))
  with check (public.site_draft_user_can_edit(draft_id, auth.uid()));

create policy "site_draft_settings_delete_access" on public.site_draft_settings
  for delete using (public.site_draft_user_can_edit(draft_id, auth.uid()));

drop policy if exists "site_draft_images_select_access" on public.site_draft_images;
drop policy if exists "site_draft_images_insert_access" on public.site_draft_images;
drop policy if exists "site_draft_images_update_access" on public.site_draft_images;
drop policy if exists "site_draft_images_delete_access" on public.site_draft_images;

create policy "site_draft_images_select_access" on public.site_draft_images
  for select using (public.site_draft_user_can_read(draft_id, auth.uid()));

create policy "site_draft_images_insert_access" on public.site_draft_images
  for insert with check (public.site_draft_user_can_edit(draft_id, auth.uid()));

create policy "site_draft_images_update_access" on public.site_draft_images
  for update using (public.site_draft_user_can_edit(draft_id, auth.uid()))
  with check (public.site_draft_user_can_edit(draft_id, auth.uid()));

create policy "site_draft_images_delete_access" on public.site_draft_images
  for delete using (public.site_draft_user_can_edit(draft_id, auth.uid()));

drop policy if exists "site_draft_images_objects_insert" on storage.objects;
drop policy if exists "site_draft_images_objects_update" on storage.objects;
drop policy if exists "site_draft_images_objects_delete" on storage.objects;

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
            and public.site_draft_user_can_edit(d.id, auth.uid())
        )
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'create-site'
      )
    )
  );

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
            and public.site_draft_user_can_edit(d.id, auth.uid())
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
            and public.site_draft_user_can_edit(d.id, auth.uid())
        )
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'create-site'
      )
    )
  );

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
            and public.site_draft_user_can_edit(d.id, auth.uid())
        )
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'create-site'
      )
    )
  );

drop policy if exists "sites_update_owner_or_admin" on public.sites;

create policy "sites_update_owner_or_admin" on public.sites
  for update using (
    exists (
      select 1
      from public.site_drafts d
      where d.site_id = sites.id
        and d.draft_type = 'owner'
        and d.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.site_admins sa
      where sa.site_id = sites.id
        and sa.user_id = auth.uid()
        and sa.role in ('admin')
    )
  )
  with check (
    exists (
      select 1
      from public.site_drafts d
      where d.site_id = sites.id
        and d.draft_type = 'owner'
        and d.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.site_admins sa
      where sa.site_id = sites.id
        and sa.user_id = auth.uid()
        and sa.role in ('admin')
    )
  );

create table if not exists public.site_collaboration_pull_requests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  editor_user_id uuid not null references auth.users(id) on delete cascade,
  editor_draft_id uuid not null references public.site_drafts(id) on delete cascade,
  owner_draft_id uuid not null references public.site_drafts(id) on delete cascade,
  repo_full_name text not null,
  base_branch text not null,
  head_branch text not null,
  github_pr_number bigint not null,
  github_pr_url text not null,
  github_pr_state text not null default 'open',
  status text not null default 'open',
  title text not null default '',
  body text not null default '',
  touched_sections text[] not null default '{}'::text[],
  touched_page_slugs text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  merged_at timestamptz,
  merged_by_user_id uuid references auth.users(id) on delete set null,
  check (github_pr_state in ('open', 'closed', 'merged')),
  check (status in ('open', 'closed', 'merged'))
);

create unique index if not exists site_collaboration_pr_open_editor_idx
  on public.site_collaboration_pull_requests (site_id, editor_user_id)
  where status = 'open';

create unique index if not exists site_collaboration_pr_site_number_idx
  on public.site_collaboration_pull_requests (site_id, github_pr_number);

create index if not exists site_collaboration_pr_site_status_idx
  on public.site_collaboration_pull_requests (site_id, status, updated_at desc);

drop trigger if exists site_collaboration_pull_requests_set_updated_at on public.site_collaboration_pull_requests;

create trigger site_collaboration_pull_requests_set_updated_at
before update on public.site_collaboration_pull_requests
for each row execute function public.set_updated_at();

alter table public.site_collaboration_pull_requests enable row level security;

drop policy if exists "site_collaboration_pr_select_access" on public.site_collaboration_pull_requests;
drop policy if exists "site_collaboration_pr_insert_access" on public.site_collaboration_pull_requests;
drop policy if exists "site_collaboration_pr_update_access" on public.site_collaboration_pull_requests;
drop policy if exists "site_collaboration_pr_delete_access" on public.site_collaboration_pull_requests;

create policy "site_collaboration_pr_select_access" on public.site_collaboration_pull_requests
  for select using (
    editor_user_id = auth.uid()
    or public.site_user_role_for_site(site_id, auth.uid()) in ('owner', 'admin')
  );

create policy "site_collaboration_pr_insert_access" on public.site_collaboration_pull_requests
  for insert with check (
    (editor_user_id = auth.uid() and public.site_user_role_for_site(site_id, auth.uid()) = 'editor')
    or public.site_user_role_for_site(site_id, auth.uid()) in ('owner', 'admin')
  );

create policy "site_collaboration_pr_update_access" on public.site_collaboration_pull_requests
  for update using (
    editor_user_id = auth.uid()
    or public.site_user_role_for_site(site_id, auth.uid()) in ('owner', 'admin')
  )
  with check (
    editor_user_id = auth.uid()
    or public.site_user_role_for_site(site_id, auth.uid()) in ('owner', 'admin')
  );

create policy "site_collaboration_pr_delete_access" on public.site_collaboration_pull_requests
  for delete using (
    editor_user_id = auth.uid()
    or public.site_user_role_for_site(site_id, auth.uid()) in ('owner', 'admin')
  );

create or replace function public.site_get_or_create_editor_draft(
  p_site_id uuid
) returns table (
  draft_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_owner_draft public.site_drafts%rowtype;
  v_existing_draft_id uuid;
  v_new_draft_id uuid;
  v_editor_branch text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  v_role := public.site_user_role_for_site(p_site_id, v_user_id);
  if v_role is distinct from 'editor' then
    raise exception 'Only editors can create personal collaboration drafts.';
  end if;

  select d.id
  into v_existing_draft_id
  from public.site_drafts d
  where d.site_id = p_site_id
    and d.draft_type = 'editor'
    and d.owner_user_id = v_user_id
  limit 1;

  if v_existing_draft_id is not null then
    return query select v_existing_draft_id, false;
    return;
  end if;

  select *
  into v_owner_draft
  from public.site_drafts d
  where d.site_id = p_site_id
    and d.draft_type = 'owner'
  order by d.created_at asc
  limit 1;

  if not found then
    raise exception 'Owner draft not found for this site.';
  end if;

  v_editor_branch := format(
    'studio/editor-%s-%s',
    substr(replace(p_site_id::text, '-', ''), 1, 8),
    substr(replace(v_user_id::text, '-', ''), 1, 8)
  );

  insert into public.site_drafts (
    id,
    site_id,
    owner_user_id,
    repo_full_name,
    branch,
    commit_sha,
    files,
    draft_type,
    source_owner_draft_id,
    touched_sections,
    touched_page_slugs,
    deleted_page_slugs,
    editor_branch
  )
  values (
    gen_random_uuid(),
    p_site_id,
    v_user_id,
    v_owner_draft.repo_full_name,
    v_editor_branch,
    coalesce(v_owner_draft.commit_sha, ''),
    coalesce(v_owner_draft.files, '{}'::jsonb),
    'editor',
    v_owner_draft.id,
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    v_editor_branch
  )
  returning id into v_new_draft_id;

  insert into public.site_draft_settings (draft_id, settings, styles)
  select v_new_draft_id, coalesce(s.settings, '{}'::jsonb), coalesce(s.styles, '{}'::jsonb)
  from public.site_draft_settings s
  where s.draft_id = v_owner_draft.id
  on conflict (draft_id) do update
  set
    settings = excluded.settings,
    styles = excluded.styles,
    updated_at = now();

  insert into public.site_draft_pages (
    draft_id,
    slug,
    title,
    content,
    show_in_nav,
    position,
    is_home
  )
  select
    v_new_draft_id,
    p.slug,
    p.title,
    p.content,
    p.show_in_nav,
    p.position,
    p.is_home
  from public.site_draft_pages p
  where p.draft_id = v_owner_draft.id
  on conflict (draft_id, slug) do update
  set
    title = excluded.title,
    content = excluded.content,
    show_in_nav = excluded.show_in_nav,
    position = excluded.position,
    is_home = excluded.is_home,
    updated_at = now();

  return query select v_new_draft_id, true;
end;
$$;

revoke all on function public.site_get_or_create_editor_draft(uuid) from public;
grant execute on function public.site_get_or_create_editor_draft(uuid) to authenticated;

create or replace function public.site_editor_mark_touched(
  p_draft_id uuid,
  p_section_key text,
  p_touched_page_slugs text[] default null,
  p_deleted_page_slugs text[] default null
) returns table (
  touched_sections text[],
  touched_page_slugs text[],
  deleted_page_slugs text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft public.site_drafts%rowtype;
  v_add_slugs text[] := '{}'::text[];
  v_remove_slugs text[] := '{}'::text[];
  v_next_sections text[] := '{}'::text[];
  v_next_touched text[] := '{}'::text[];
  v_next_deleted text[] := '{}'::text[];
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_section_key not in ('metadata', 'pages', 'header', 'footer', 'styles') then
    raise exception 'Invalid section key.';
  end if;

  select *
  into v_draft
  from public.site_drafts d
  where d.id = p_draft_id
    and d.draft_type = 'editor'
    and d.owner_user_id = v_user_id
  limit 1;

  if not found then
    raise exception 'Editor draft not found or access denied.';
  end if;

  if p_section_key = 'pages' then
    v_add_slugs := coalesce(
      (
        select array_agg(distinct lower(trim(slug)))
        from unnest(coalesce(p_touched_page_slugs, '{}'::text[])) slug
        where trim(slug) <> ''
      ),
      '{}'::text[]
    );

    v_remove_slugs := coalesce(
      (
        select array_agg(distinct lower(trim(slug)))
        from unnest(coalesce(p_deleted_page_slugs, '{}'::text[])) slug
        where trim(slug) <> ''
      ),
      '{}'::text[]
    );
  end if;

  v_next_sections := coalesce(
    (
      select array_agg(distinct section_name)
      from unnest(coalesce(v_draft.touched_sections, '{}'::text[]) || array[p_section_key]) section_name
      where section_name in ('metadata', 'pages', 'header', 'footer', 'styles')
    ),
    '{}'::text[]
  );

  v_next_touched := coalesce(
    (
      select array_agg(distinct slug)
      from unnest(coalesce(v_draft.touched_page_slugs, '{}'::text[]) || v_add_slugs) slug
      where slug <> ''
        and not (slug = any(v_remove_slugs))
    ),
    '{}'::text[]
  );

  v_next_deleted := coalesce(
    (
      select array_agg(distinct slug)
      from unnest(coalesce(v_draft.deleted_page_slugs, '{}'::text[]) || v_remove_slugs) slug
      where slug <> ''
        and not (slug = any(v_add_slugs))
    ),
    '{}'::text[]
  );

  update public.site_drafts
  set
    touched_sections = v_next_sections,
    touched_page_slugs = v_next_touched,
    deleted_page_slugs = v_next_deleted
  where id = p_draft_id
    and owner_user_id = v_user_id
    and draft_type = 'editor';

  return query select v_next_sections, v_next_touched, v_next_deleted;
end;
$$;

revoke all on function public.site_editor_mark_touched(uuid, text, text[], text[]) from public;
grant execute on function public.site_editor_mark_touched(uuid, text, text[], text[]) to authenticated;

create or replace function public.site_editor_clear_touched(
  p_draft_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft public.site_drafts%rowtype;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_draft
  from public.site_drafts d
  where d.id = p_draft_id
    and d.draft_type = 'editor'
  limit 1;

  if not found then
    raise exception 'Editor draft not found.';
  end if;

  v_role := public.site_user_role_for_site(v_draft.site_id, v_user_id);
  if v_user_id <> v_draft.owner_user_id and v_role not in ('owner', 'admin') then
    raise exception 'Insufficient permissions to clear editor draft changes.';
  end if;

  update public.site_drafts
  set
    touched_sections = '{}'::text[],
    touched_page_slugs = '{}'::text[],
    deleted_page_slugs = '{}'::text[]
  where id = p_draft_id
    and draft_type = 'editor';
end;
$$;

revoke all on function public.site_editor_clear_touched(uuid) from public;
grant execute on function public.site_editor_clear_touched(uuid) to authenticated;
