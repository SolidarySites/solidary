drop function if exists public.site_draft_upsert_settings_header(uuid, jsonb);
drop function if exists public.site_draft_upsert_settings_footer(uuid, jsonb);
drop function if exists public.site_draft_upsert_settings_head(uuid, text, text, boolean, boolean, boolean, boolean);
drop function if exists public.site_draft_upsert_settings_styles(uuid, jsonb);

create or replace function public.site_draft_upsert_settings_header(
  p_draft_id uuid,
  p_header jsonb
) returns table (
  revision bigint,
  last_edited_at timestamptz,
  last_edited_by_user_id uuid
)
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

  return query
    update public.site_drafts
    set last_edited_by_user_id = auth.uid(), last_edited_at = now()
    where id = p_draft_id
    returning site_drafts.revision, site_drafts.last_edited_at, site_drafts.last_edited_by_user_id;
end;
$$;

revoke all on function public.site_draft_upsert_settings_header(uuid, jsonb) from public;
grant execute on function public.site_draft_upsert_settings_header(uuid, jsonb) to authenticated;

create or replace function public.site_draft_upsert_settings_footer(
  p_draft_id uuid,
  p_footer jsonb
) returns table (
  revision bigint,
  last_edited_at timestamptz,
  last_edited_by_user_id uuid
)
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

  return query
    update public.site_drafts
    set last_edited_by_user_id = auth.uid(), last_edited_at = now()
    where id = p_draft_id
    returning site_drafts.revision, site_drafts.last_edited_at, site_drafts.last_edited_by_user_id;
end;
$$;

revoke all on function public.site_draft_upsert_settings_footer(uuid, jsonb) from public;
grant execute on function public.site_draft_upsert_settings_footer(uuid, jsonb) to authenticated;

create or replace function public.site_draft_upsert_settings_head(
  p_draft_id uuid,
  p_head_html text,
  p_locale text,
  p_twitter boolean,
  p_open_graph boolean,
  p_structured_data boolean,
  p_index_follow boolean
) returns table (
  revision bigint,
  last_edited_at timestamptz,
  last_edited_by_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locale text := coalesce(nullif(trim(coalesce(p_locale, '')), ''), 'en-US');
  v_twitter boolean := coalesce(p_twitter, true);
  v_open_graph boolean := coalesce(p_open_graph, true);
  v_structured_data boolean := coalesce(p_structured_data, true);
  v_index_follow boolean := coalesce(p_index_follow, true);
begin
  if not public.site_draft_user_can_edit(p_draft_id, auth.uid()) then
    raise exception 'You do not have edit access to this draft.';
  end if;

  insert into public.site_draft_settings (draft_id, settings, styles)
  values (
    p_draft_id,
    jsonb_build_object(
      'headHtml', coalesce(p_head_html, ''),
      'locale', v_locale,
      'twitter', v_twitter,
      'openGraph', v_open_graph,
      'structuredData', v_structured_data,
      'indexFollow', v_index_follow
    ),
    '{}'::jsonb
  )
  on conflict (draft_id) do update
  set
    settings = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                coalesce(public.site_draft_settings.settings, '{}'::jsonb),
                '{headHtml}',
                to_jsonb(coalesce(p_head_html, '')),
                true
              ),
              '{locale}',
              to_jsonb(v_locale),
              true
            ),
            '{twitter}',
            to_jsonb(v_twitter),
            true
          ),
          '{openGraph}',
          to_jsonb(v_open_graph),
          true
        ),
        '{structuredData}',
        to_jsonb(v_structured_data),
        true
      ),
      '{indexFollow}',
      to_jsonb(v_index_follow),
      true
    ),
    updated_at = now();

  return query
    update public.site_drafts
    set last_edited_by_user_id = auth.uid(), last_edited_at = now()
    where id = p_draft_id
    returning site_drafts.revision, site_drafts.last_edited_at, site_drafts.last_edited_by_user_id;
end;
$$;

revoke all on function public.site_draft_upsert_settings_head(
  uuid,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean
) from public;

grant execute on function public.site_draft_upsert_settings_head(
  uuid,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

notify pgrst, 'reload schema';

create or replace function public.site_draft_upsert_settings_styles(
  p_draft_id uuid,
  p_styles jsonb
) returns table (
  revision bigint,
  last_edited_at timestamptz,
  last_edited_by_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.site_draft_user_can_edit(p_draft_id, auth.uid()) then
    raise exception 'You do not have edit access to this draft.';
  end if;

  insert into public.site_draft_settings (draft_id, settings, styles)
  values (p_draft_id, '{}'::jsonb, coalesce(p_styles, '{}'::jsonb))
  on conflict (draft_id) do update
  set
    styles = coalesce(p_styles, '{}'::jsonb),
    updated_at = now();

  return query
    update public.site_drafts
    set last_edited_by_user_id = auth.uid(), last_edited_at = now()
    where id = p_draft_id
    returning site_drafts.revision, site_drafts.last_edited_at, site_drafts.last_edited_by_user_id;
end;
$$;

revoke all on function public.site_draft_upsert_settings_styles(uuid, jsonb) from public;
grant execute on function public.site_draft_upsert_settings_styles(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
