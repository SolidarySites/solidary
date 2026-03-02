alter table public.site_draft_pages
  add column if not exists javascript text not null default '';

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
    javascript,
    show_in_nav,
    position,
    is_home
  )
  select
    v_new_draft_id,
    p.slug,
    p.title,
    p.content,
    p.javascript,
    p.show_in_nav,
    p.position,
    p.is_home
  from public.site_draft_pages p
  where p.draft_id = v_owner_draft.id
  on conflict (draft_id, slug) do update
  set
    title = excluded.title,
    content = excluded.content,
    javascript = excluded.javascript,
    show_in_nav = excluded.show_in_nav,
    position = excluded.position,
    is_home = excluded.is_home,
    updated_at = now();

  return query select v_new_draft_id, true;
end;
$$;

revoke all on function public.site_get_or_create_editor_draft(uuid) from public;
grant execute on function public.site_get_or_create_editor_draft(uuid) to authenticated;
