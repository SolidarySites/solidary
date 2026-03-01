alter table public.site_drafts
  add column if not exists has_publish_pending_changes boolean not null default false;

update public.site_drafts
set has_publish_pending_changes =
  (
    coalesce(array_length(touched_sections, 1), 0) > 0
    or coalesce(array_length(touched_page_slugs, 1), 0) > 0
    or coalesce(array_length(deleted_page_slugs, 1), 0) > 0
  )
where draft_type = 'editor';

create or replace function public.site_draft_set_publish_pending(
  p_draft_id uuid,
  p_pending boolean
) returns table (
  has_publish_pending_changes boolean,
  revision bigint,
  last_edited_at timestamptz,
  last_edited_by_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pending boolean := coalesce(p_pending, false);
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.site_draft_user_can_edit(p_draft_id, v_user_id) then
    raise exception 'You do not have edit access to this draft.';
  end if;

  if not exists (select 1 from public.site_drafts d where d.id = p_draft_id) then
    raise exception 'Draft not found.';
  end if;

  update public.site_drafts d
  set has_publish_pending_changes = v_pending
  where d.id = p_draft_id
    and d.has_publish_pending_changes is distinct from v_pending;

  return query
  select
    d.has_publish_pending_changes,
    d.revision,
    d.last_edited_at,
    d.last_edited_by_user_id
  from public.site_drafts d
  where d.id = p_draft_id
  limit 1;
end;
$$;

revoke all on function public.site_draft_set_publish_pending(uuid, boolean) from public;
grant execute on function public.site_draft_set_publish_pending(uuid, boolean) to authenticated;
