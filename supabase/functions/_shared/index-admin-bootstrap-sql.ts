const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

export const createIndexAdminBootstrapSql = ({
  indexId,
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
  indexId: string;
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
  const normalizedIndexId = indexId.trim();
  if (!normalizedIndexId) {
    throw new Error("createIndexAdminBootstrapSql requires indexId.");
  }

  const escapedIndexId = escapeSqlLiteral(normalizedIndexId);
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
    "alter table public.indexes",
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
    "alter table public.indexes",
    "  drop constraint if exists indexes_source_check;",
    "",
    "alter table public.indexes",
    "  add constraint indexes_source_check",
    "  check (source in ('manual', 'index_create', 'federation_mirror'));",
    "",
    "alter table public.indexes",
    "  drop constraint if exists indexes_type_check;",
    "",
    "alter table public.indexes",
    "  add constraint indexes_type_check",
    "  check (type in ('site', 'index'));",
    "",
    "alter table public.indexes",
    "  drop constraint if exists indexes_runtime_mode_check;",
    "",
    "alter table public.indexes",
    "  add constraint indexes_runtime_mode_check",
    "  check (runtime_mode in ('scaffold', 'finalized'));",
    "",
    "create index if not exists indexes_type_idx on public.indexes (type);",
    "create index if not exists indexes_parent_index_idx on public.indexes (parent_index_id);",
    "create index if not exists indexes_is_root_idx on public.indexes (is_root);",
    "create index if not exists indexes_runtime_mode_idx on public.indexes (runtime_mode);",
    "",
    'drop policy if exists "indexes_select_public_root_index" on public.indexes;',
    "",
    'create policy "indexes_select_public_root_index" on public.indexes',
    "  for select to anon, authenticated using (type = 'index' and is_root = true);",
    "",
    'drop policy if exists "index_sites_select_public_tracked" on public.index_sites;',
    "",
    'create policy "index_sites_select_public_tracked" on public.index_sites',
    "  for select to anon, authenticated using (status = 'tracked');",
    "",
    'drop policy if exists "index_sites_insert_root_site_owner" on public.index_sites;',
    "",
    'create policy "index_sites_insert_root_site_owner" on public.index_sites',
    "  for insert to authenticated with check (",
    "    status = 'tracked'",
    "    and exists (",
    "      select 1",
    "      from public.indexes index_row",
    "      where index_row.id = index_sites.index_id",
    "        and index_row.type = 'index'",
    "        and index_row.is_root = true",
    "    )",
    "    and public.site_user_role_for_site(index_sites.site_id, auth.uid()) = 'owner'",
    "  );",
    "",
    "insert into public.indexes (",
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
    `values ('${escapedIndexId}', null, '${escapedSlug}', '${escapedTitle}', '${escapedDescription}', '${escapedImageUrl}', '${escapedCanonicalUrl}', '${escapedProjectUrl}', '${escapedPublishableKey}', 'index', true, 'scaffold', ${indexLevel}, '${escapedParentIndexId}', '${escapedParentIndexUrl}', ${parentIndexLevel}, '${escapedParentRepoFullName}', '${escapedParentRepoUrl}', 'index_create')`,
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
