const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

export const createIndexAdminBootstrapSql = ({
  archiveId,
  slug,
  title,
  description,
  canonicalUrl,
  imageUrl,
  projectUrl,
  publishableKey,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
  parentRepoFullName,
  parentRepoUrl,
}: {
  archiveId: string;
  slug: string;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  projectUrl: string;
  publishableKey: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
  parentRepoFullName: string;
  parentRepoUrl: string;
}) => {
  const escapedArchiveId = escapeSqlLiteral(archiveId);
  const escapedSlug = escapeSqlLiteral(slug);
  const escapedTitle = escapeSqlLiteral(title);
  const escapedDescription = escapeSqlLiteral(description);
  const escapedCanonicalUrl = escapeSqlLiteral(canonicalUrl);
  const escapedImageUrl = escapeSqlLiteral(imageUrl);
  const escapedProjectUrl = escapeSqlLiteral(projectUrl);
  const escapedPublishableKey = escapeSqlLiteral(publishableKey);
  const escapedParentIndexId = escapeSqlLiteral(parentIndexId);
  const escapedParentIndexUrl = escapeSqlLiteral(parentIndexUrl);
  const escapedParentRepoFullName = escapeSqlLiteral(parentRepoFullName);
  const escapedParentRepoUrl = escapeSqlLiteral(parentRepoUrl);

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
    "  add column if not exists repo_full_name text,",
    "  add column if not exists repo_url text,",
    "  add column if not exists supabase_project_id text,",
    "  add column if not exists supabase_project_ref text,",
    "  add column if not exists supabase_project_name text,",
    "  add column if not exists supabase_dashboard_url text,",
    "  add column if not exists supabase_project_url text,",
    "  add column if not exists supabase_publishable_key text not null default '',",
    "  add column if not exists source text not null default 'manual',",
    "  add column if not exists type text not null default 'index',",
    "  add column if not exists is_root boolean not null default false,",
    "  add column if not exists runtime_mode text not null default 'scaffold',",
    "  add column if not exists index_level int,",
    "  add column if not exists parent_index_id uuid,",
    "  add column if not exists parent_index_url text,",
    "  add column if not exists parent_index_level int,",
    "  add column if not exists parent_repo_full_name text,",
    "  add column if not exists parent_repo_url text,",
    "  add column if not exists finalized_at timestamptz;",
    "",
    "alter table public.archives",
    "  drop constraint if exists archives_source_check;",
    "",
    "alter table public.archives",
    "  add constraint archives_source_check",
    "  check (source in ('manual', 'index_create', 'federation_mirror'));",
    "",
    "alter table public.archives",
    "  drop constraint if exists archives_type_check;",
    "",
    "alter table public.archives",
    "  add constraint archives_type_check",
    "  check (type in ('site', 'index'));",
    "",
    "alter table public.archives",
    "  drop constraint if exists archives_runtime_mode_check;",
    "",
    "alter table public.archives",
    "  add constraint archives_runtime_mode_check",
    "  check (runtime_mode in ('scaffold', 'finalized'));",
    "",
    "create index if not exists archives_type_idx on public.archives (type);",
    "create index if not exists archives_parent_index_idx on public.archives (parent_index_id);",
    "create index if not exists archives_is_root_idx on public.archives (is_root);",
    "create index if not exists archives_runtime_mode_idx on public.archives (runtime_mode);",
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
    "  supabase_project_url,",
    "  supabase_publishable_key,",
    "  type,",
    "  is_root,",
    "  runtime_mode,",
    "  index_level,",
    "  parent_index_id,",
    "  parent_index_url,",
    "  parent_index_level,",
    "  parent_repo_full_name,",
    "  parent_repo_url,",
    "  source",
    ")",
    `values ('${escapedArchiveId}', null, '${escapedSlug}', '${escapedTitle}', '${escapedDescription}', '${escapedImageUrl}', '${escapedCanonicalUrl}', '${escapedProjectUrl}', '${escapedPublishableKey}', 'index', true, 'scaffold', ${indexLevel}, '${escapedParentIndexId}', '${escapedParentIndexUrl}', ${parentIndexLevel}, '${escapedParentRepoFullName}', '${escapedParentRepoUrl}', 'index_create')`,
    "on conflict (id) do update set",
    "  slug = excluded.slug,",
    "  title = excluded.title,",
    "  description = excluded.description,",
    "  image_url = excluded.image_url,",
    "  canonical_url = excluded.canonical_url,",
    "  supabase_project_url = excluded.supabase_project_url,",
    "  supabase_publishable_key = excluded.supabase_publishable_key,",
    "  type = excluded.type,",
    "  is_root = excluded.is_root,",
    "  runtime_mode = excluded.runtime_mode,",
    "  index_level = excluded.index_level,",
    "  parent_index_id = excluded.parent_index_id,",
    "  parent_index_url = excluded.parent_index_url,",
    "  parent_index_level = excluded.parent_index_level,",
    "  parent_repo_full_name = excluded.parent_repo_full_name,",
    "  parent_repo_url = excluded.parent_repo_url,",
    "  source = excluded.source,",
    "  updated_at = now();",
  ].join("\n");
};
