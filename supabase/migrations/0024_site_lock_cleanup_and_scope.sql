create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create index if not exists site_draft_section_locks_draft_updated_idx
  on public.site_draft_section_locks (draft_id, updated_at);

create index if not exists site_draft_section_locks_updated_idx
  on public.site_draft_section_locks (updated_at);

create or replace function public.site_draft_cleanup_stale_section_locks(
  p_draft_id uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int := 0;
begin
  if p_draft_id is null and v_user_id is not null then
    raise exception 'Global cleanup is only available to internal jobs.';
  end if;

  if
    p_draft_id is not null
    and v_user_id is not null
    and not public.site_draft_user_can_read(p_draft_id, v_user_id)
  then
    raise exception 'You do not have read access to this draft.';
  end if;

  if p_draft_id is null then
    if not exists (select 1 from public.site_draft_section_locks limit 1) then
      return 0;
    end if;

    delete from public.site_draft_section_locks
    where updated_at < now() - interval '1 minute';
  else
    delete from public.site_draft_section_locks
    where draft_id = p_draft_id
      and updated_at < now() - interval '1 minute';
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.site_draft_cleanup_stale_section_locks(uuid) from public;
grant execute on function public.site_draft_cleanup_stale_section_locks(uuid) to authenticated;

create or replace function public.site_draft_list_active_section_locks(
  p_draft_id uuid,
  p_scope text
) returns table (
  section_key text,
  locked_by_user_id uuid,
  locked_by_name text,
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
    or public.site_draft_section_locks.updated_at < v_now - interval '1 minute';

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

do $migration$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'site_draft_lock_cleanup_every_minute'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'site_draft_lock_cleanup_every_minute',
    '* * * * *',
    $cron$select public.site_draft_cleanup_stale_section_locks(null);$cron$
  );
end;
$migration$;
