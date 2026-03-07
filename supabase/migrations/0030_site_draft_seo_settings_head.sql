drop function if exists public.site_draft_upsert_settings_head(uuid, text);

create or replace function public.site_draft_upsert_settings_head(
  p_draft_id uuid,
  p_head_html text,
  p_locale text,
  p_twitter boolean,
  p_open_graph boolean,
  p_structured_data boolean,
  p_index_follow boolean
) returns void
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
      'headHtml',
      coalesce(p_head_html, ''),
      'locale',
      v_locale,
      'twitter',
      v_twitter,
      'openGraph',
      v_open_graph,
      'structuredData',
      v_structured_data,
      'indexFollow',
      v_index_follow
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
