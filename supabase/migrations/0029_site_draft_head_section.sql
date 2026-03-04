create or replace function public.site_draft_upsert_settings_head(
  p_draft_id uuid,
  p_head_html text
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
    jsonb_build_object('headHtml', coalesce(p_head_html, '')),
    '{}'::jsonb
  )
  on conflict (draft_id) do update
  set
    settings = jsonb_set(
      coalesce(public.site_draft_settings.settings, '{}'::jsonb),
      '{headHtml}',
      to_jsonb(coalesce(p_head_html, '')),
      true
    ),
    updated_at = now();
end;
$$;

revoke all on function public.site_draft_upsert_settings_head(uuid, text) from public;
grant execute on function public.site_draft_upsert_settings_head(uuid, text) to authenticated;

alter table if exists public.site_draft_section_locks
  drop constraint if exists site_draft_section_locks_section_key_check;

alter table public.site_draft_section_locks
  add constraint site_draft_section_locks_section_key_check
  check (
    section_key in (
      'metadata',
      'pages',
      'header',
      'footer',
      'head',
      'styles',
      'settings:general',
      'settings:connections',
      'settings:collaborators',
      'settings:danger'
    )
    or section_key ~ '^page:[a-z0-9][a-z0-9_-]*$'
  );

create or replace function public.site_draft_list_active_section_locks(
  p_draft_id uuid,
  p_scope text
) returns table (
  section_key text,
  locked_by_user_id uuid,
  locked_by_name text,
  locked_by_avatar_url text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.site_draft_user_can_read(p_draft_id, v_user_id) then
    raise exception 'You do not have read access to this draft.';
  end if;

  perform public.site_draft_cleanup_stale_section_locks(p_draft_id);

  if p_scope = 'builder' then
    return query
    select
      l.section_key,
      l.locked_by_user_id,
      l.locked_by_name,
      l.locked_by_avatar_url,
      l.updated_at
    from public.site_draft_section_locks l
    where l.draft_id = p_draft_id
      and l.updated_at >= now() - interval '1 minute'
      and (
        l.section_key in ('metadata', 'pages', 'header', 'footer', 'head', 'styles')
        or l.section_key ~ '^page:[a-z0-9][a-z0-9_-]*$'
      )
    order by l.updated_at desc;
    return;
  end if;

  if p_scope = 'settings' then
    return query
    select
      l.section_key,
      l.locked_by_user_id,
      l.locked_by_name,
      l.locked_by_avatar_url,
      l.updated_at
    from public.site_draft_section_locks l
    where l.draft_id = p_draft_id
      and l.updated_at >= now() - interval '1 minute'
      and l.section_key like 'settings:%'
    order by l.updated_at desc;
    return;
  end if;

  raise exception 'Invalid scope.';
end;
$$;

revoke all on function public.site_draft_list_active_section_locks(uuid, text) from public;
grant execute on function public.site_draft_list_active_section_locks(uuid, text) to authenticated;

create or replace function public.site_draft_acquire_section_lock(
  p_draft_id uuid,
  p_section_key text,
  p_holder_name text default null,
  p_holder_avatar_url text default null,
  p_ttl_seconds int default 45
) returns table (
  acquired boolean,
  lock_user_id uuid,
  lock_name text,
  lock_avatar_url text,
  expires_at timestamptz,
  updated_at timestamptz
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
  v_holder_avatar_url text := nullif(trim(coalesce(p_holder_avatar_url, '')), '');
  v_row public.site_draft_section_locks%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if
    p_section_key not in (
      'metadata',
      'pages',
      'header',
      'footer',
      'head',
      'styles',
      'settings:general',
      'settings:connections',
      'settings:collaborators',
      'settings:danger'
    )
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
    and l.updated_at < v_now - interval '1 minute';

  if p_section_key like 'settings:%' then
    delete from public.site_draft_section_locks l
    where l.draft_id = p_draft_id
      and l.locked_by_user_id = v_user_id
      and l.section_key like 'settings:%'
      and l.section_key <> p_section_key;
  else
    delete from public.site_draft_section_locks l
    where l.draft_id = p_draft_id
      and l.locked_by_user_id = v_user_id
      and l.section_key not like 'settings:%'
      and l.section_key <> p_section_key;
  end if;

  insert into public.site_draft_section_locks (
    draft_id,
    section_key,
    locked_by_user_id,
    locked_by_name,
    locked_by_avatar_url,
    locked_at,
    expires_at
  )
  values (
    p_draft_id,
    p_section_key,
    v_user_id,
    v_holder_name,
    v_holder_avatar_url,
    v_now,
    v_expires_at
  )
  on conflict (draft_id, section_key) do update
  set
    locked_by_user_id = excluded.locked_by_user_id,
    locked_by_name = excluded.locked_by_name,
    locked_by_avatar_url = excluded.locked_by_avatar_url,
    locked_at = excluded.locked_at,
    expires_at = excluded.expires_at
  where
    public.site_draft_section_locks.locked_by_user_id = v_user_id
    or public.site_draft_section_locks.updated_at < v_now - interval '1 minute';

  select *
  into v_row
  from public.site_draft_section_locks
  where draft_id = p_draft_id
    and section_key = p_section_key
  limit 1;

  if not found then
    return query select false, null::uuid, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  return query
  select
    v_row.locked_by_user_id = v_user_id,
    v_row.locked_by_user_id,
    v_row.locked_by_name,
    v_row.locked_by_avatar_url,
    v_row.expires_at,
    v_row.updated_at;
end;
$$;

revoke all on function public.site_draft_acquire_section_lock(uuid, text, text, text, int) from public;
grant execute on function public.site_draft_acquire_section_lock(uuid, text, text, text, int) to authenticated;

create or replace function public.site_draft_acquire_section_lock(
  p_draft_id uuid,
  p_section_key text,
  p_holder_name text default null,
  p_ttl_seconds int default 45
) returns table (
  acquired boolean,
  lock_user_id uuid,
  lock_name text,
  lock_avatar_url text,
  expires_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select * from public.site_draft_acquire_section_lock(
    p_draft_id,
    p_section_key,
    p_holder_name,
    null::text,
    p_ttl_seconds
  );
$$;

revoke all on function public.site_draft_acquire_section_lock(uuid, text, text, int) from public;
grant execute on function public.site_draft_acquire_section_lock(uuid, text, text, int) to authenticated;

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

  if p_section_key not in ('metadata', 'pages', 'header', 'footer', 'head', 'styles') then
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
      where section_name in ('metadata', 'pages', 'header', 'footer', 'head', 'styles')
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
