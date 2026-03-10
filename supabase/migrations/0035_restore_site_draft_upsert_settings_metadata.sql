drop function if exists public.site_draft_upsert_settings_metadata(uuid, text, text, text, text);

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

notify pgrst, 'reload schema';
