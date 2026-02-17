-- Allow per-page lock keys (page:<slug>) for collaborative page editing.
-- This keeps static section locks and extends lock scope for Pages.

alter table if exists public.site_draft_section_locks
  drop constraint if exists site_draft_section_locks_section_key_check;

alter table public.site_draft_section_locks
  add constraint site_draft_section_locks_section_key_check
  check (
    section_key in ('metadata', 'pages', 'header', 'footer', 'styles')
    or section_key ~ '^page:[a-z0-9][a-z0-9_-]*$'
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
