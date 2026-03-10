create or replace function public.site_connection_links_refresh_root(
  p_owner_draft_id uuid,
  p_site_id uuid,
  p_actor_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_links_key constant text := 'public/.well-known/solidary-links.json';
  v_files jsonb;
  v_links_raw text;
  v_links jsonb;
  v_connections jsonb;
  v_site_url text;
begin
  select coalesce(d.files, '{}'::jsonb)
  into v_files
  from public.site_drafts d
  where d.id = p_owner_draft_id
    and d.draft_type = 'owner'
  for update;

  if not found then
    raise exception 'Owner draft not found.';
  end if;

  select nullif(trim(s.canonical_url), '')
  into v_site_url
  from public.sites s
  where s.id = p_site_id;

  if v_site_url is null then
    raise exception 'Site % is missing canonical_url.', p_site_id;
  end if;

  v_links_raw := coalesce(v_files ->> v_links_key, '');
  if v_links_raw = '' then
    v_links := '{}'::jsonb;
  else
    begin
      v_links := v_links_raw::jsonb;
    exception
      when others then
        raise exception 'Invalid solidary-links.json content on owner draft %.', p_owner_draft_id;
    end;

    if jsonb_typeof(v_links) <> 'object' then
      raise exception 'solidary-links.json must be a JSON object.';
    end if;
  end if;

  v_connections :=
    case
      when jsonb_typeof(v_links -> 'connections') = 'array'
        then (v_links -> 'connections')
      else '[]'::jsonb
    end;

  v_links := jsonb_build_object(
    '@context',
      jsonb_build_object(
        'site', 'urn:solidary:type:site',
        'connection', 'urn:solidary:type:connection',
        'site_id', 'urn:solidary:term:site_id',
        'connections', jsonb_build_object(
          '@id', 'urn:solidary:term:connections',
          '@container', '@set'
        ),
        'connected_site', 'urn:solidary:term:connected_site'
      ),
    '@id', v_site_url,
    '@type', 'site',
    'site_id', p_site_id::text,
    'connections', v_connections
  );

  v_files := jsonb_set(v_files, array[v_links_key], to_jsonb(jsonb_pretty(v_links)), true);

  update public.site_drafts
  set
    files = v_files,
    last_edited_by_user_id = p_actor_user_id,
    last_edited_at = now()
  where id = p_owner_draft_id;
end;
$$;

revoke all on function public.site_connection_links_refresh_root(uuid, uuid, uuid) from public;

create or replace function public.site_connection_manifest_append(
  p_owner_draft_id uuid,
  p_connection_uuid uuid,
  p_site_a_id uuid,
  p_site_b_id uuid,
  p_actor_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_links_key constant text := 'public/.well-known/solidary-links.json';
  v_files jsonb;
  v_links_raw text;
  v_links jsonb;
  v_connections jsonb;
  v_connection_entry jsonb;
  v_connection_urn text := concat('urn:uuid:', p_connection_uuid::text);
  v_root_site_id uuid;
  v_connected_site_id uuid;
  v_connected_site_url text;
begin
  select d.site_id
  into v_root_site_id
  from public.site_drafts d
  where d.id = p_owner_draft_id
    and d.draft_type = 'owner'
  for update;

  if not found then
    raise exception 'Owner draft not found.';
  end if;

  if v_root_site_id is null then
    raise exception 'Owner draft missing site_id.';
  end if;

  if v_root_site_id <> p_site_a_id and v_root_site_id <> p_site_b_id then
    raise exception 'Owner draft site_id does not match connection sites.';
  end if;

  v_connected_site_id :=
    case
      when v_root_site_id = p_site_a_id then p_site_b_id
      else p_site_a_id
    end;

  select nullif(trim(s.canonical_url), '')
  into v_connected_site_url
  from public.sites s
  where s.id = v_connected_site_id;

  if v_connected_site_url is null then
    raise exception 'Connected site % is missing canonical_url.', v_connected_site_id;
  end if;

  perform public.site_connection_links_refresh_root(
    p_owner_draft_id,
    v_root_site_id,
    p_actor_user_id
  );

  select coalesce(d.files, '{}'::jsonb)
  into v_files
  from public.site_drafts d
  where d.id = p_owner_draft_id
    and d.draft_type = 'owner'
  for update;

  v_links_raw := coalesce(v_files ->> v_links_key, '');
  begin
    v_links := v_links_raw::jsonb;
  exception
    when others then
      raise exception 'Invalid solidary-links.json content on owner draft %.', p_owner_draft_id;
  end;

  if jsonb_typeof(v_links) <> 'object' then
    raise exception 'solidary-links.json must be a JSON object.';
  end if;

  v_connections :=
    case
      when jsonb_typeof(v_links -> 'connections') = 'array'
        then coalesce(
          (
            select jsonb_agg(c.entry)
            from jsonb_array_elements(v_links -> 'connections') as c(entry)
            where c.entry ->> '@id' <> v_connection_urn
          ),
          '[]'::jsonb
        )
      else '[]'::jsonb
    end;

  v_connection_entry := jsonb_build_object(
    '@id', v_connection_urn,
    '@type', 'connection',
    'connected_site', jsonb_build_object(
      '@id', v_connected_site_url,
      '@type', 'site',
      'site_id', v_connected_site_id::text
    )
  );

  v_connections := v_connections || jsonb_build_array(v_connection_entry);
  v_links := jsonb_set(v_links, '{connections}', v_connections, true);
  v_files := jsonb_set(v_files, array[v_links_key], to_jsonb(jsonb_pretty(v_links)), true);

  update public.site_drafts
  set
    files = v_files,
    last_edited_by_user_id = p_actor_user_id,
    last_edited_at = now()
  where id = p_owner_draft_id;
end;
$$;

revoke all on function public.site_connection_manifest_append(uuid, uuid, uuid, uuid, uuid) from public;
