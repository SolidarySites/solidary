const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

export const createIndexAdminBootstrapSql = ({
  archiveId,
  slug,
  title,
  description,
  canonicalUrl,
  imageUrl,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
}: {
  archiveId: string;
  slug: string;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
}) => {
  const escapedArchiveId = escapeSqlLiteral(archiveId);
  const escapedSlug = escapeSqlLiteral(slug);
  const escapedTitle = escapeSqlLiteral(title);
  const escapedDescription = escapeSqlLiteral(description);
  const escapedCanonicalUrl = escapeSqlLiteral(canonicalUrl);
  const escapedImageUrl = escapeSqlLiteral(imageUrl);
  const escapedParentIndexId = escapeSqlLiteral(parentIndexId);
  const escapedParentIndexUrl = escapeSqlLiteral(parentIndexUrl);

  return [
    "alter table public.sites",
    "  add column if not exists parent_index_id uuid,",
    "  add column if not exists parent_index_url text,",
    "  add column if not exists parent_index_level int;",
    "",
    "create index if not exists sites_parent_index_idx on public.sites (parent_index_id);",
    "",
    "alter table public.archives",
    "  add column if not exists description text,",
    "  add column if not exists image_url text,",
    "  add column if not exists type text not null default 'index',",
    "  add column if not exists index_level int,",
    "  add column if not exists parent_index_id uuid,",
    "  add column if not exists parent_index_url text,",
    "  add column if not exists parent_index_level int;",
    "",
    "alter table public.archives",
    "  drop constraint if exists archives_type_check;",
    "",
    "alter table public.archives",
    "  add constraint archives_type_check",
    "  check (type in ('site', 'index'));",
    "",
    "create index if not exists archives_type_idx on public.archives (type);",
    "create index if not exists archives_parent_index_idx on public.archives (parent_index_id);",
    "",
    'drop policy if exists "archives_select_public_root_index" on public.archives;',
    "",
    'create policy "archives_select_public_root_index" on public.archives',
    `  for select using (id = '${escapedArchiveId}');`,
    "",
    'drop policy if exists "archive_sites_select_public_tracked" on public.archive_sites;',
    "",
    'create policy "archive_sites_select_public_tracked" on public.archive_sites',
    "  for select using (status = 'tracked');",
    "",
    "insert into public.archives (",
    "  id,",
    "  owner_user_id,",
    "  slug,",
    "  title,",
    "  description,",
    "  image_url,",
    "  canonical_url,",
    "  type,",
    "  index_level,",
    "  parent_index_id,",
    "  parent_index_url,",
    "  parent_index_level",
    ")",
    `values ('${escapedArchiveId}', null, '${escapedSlug}', '${escapedTitle}', '${escapedDescription}', '${escapedImageUrl}', '${escapedCanonicalUrl}', 'index', ${indexLevel}, '${escapedParentIndexId}', '${escapedParentIndexUrl}', ${parentIndexLevel})`,
    "on conflict (id) do update set",
    "  slug = excluded.slug,",
    "  title = excluded.title,",
    "  description = excluded.description,",
    "  image_url = excluded.image_url,",
    "  canonical_url = excluded.canonical_url,",
    "  type = excluded.type,",
    "  index_level = excluded.index_level,",
    "  parent_index_id = excluded.parent_index_id,",
    "  parent_index_url = excluded.parent_index_url,",
    "  parent_index_level = excluded.parent_index_level,",
    "  updated_at = now();",
  ].join("\n");
};
