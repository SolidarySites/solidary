alter table public.site_draft_section_locks
  add column if not exists locked_by_avatar_url text;

create or replace function public.site_draft_owner_display_name(
  p_draft_id uuid
) returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.site_draft_user_can_read(p_draft_id, v_user_id) then
    raise exception 'You do not have read access to this draft.';
  end if;

  select
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'user_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'preferred_username'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      nullif(trim(split_part(u.email, '@', 1)), ''),
      'site owner'
    )
  into v_owner_name
  from public.site_drafts d
  join auth.users u on u.id = d.owner_user_id
  where d.id = p_draft_id
  limit 1;

  return coalesce(v_owner_name, 'site owner');
end;
$$;

revoke all on function public.site_draft_owner_display_name(uuid) from public;
grant execute on function public.site_draft_owner_display_name(uuid) to authenticated;

drop function if exists public.site_draft_list_active_section_locks(uuid, text);

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
        l.section_key in ('metadata', 'pages', 'header', 'footer', 'styles')
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

drop function if exists public.site_draft_acquire_section_lock(uuid, text, text, text, int);
drop function if exists public.site_draft_acquire_section_lock(uuid, text, text, int);

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
