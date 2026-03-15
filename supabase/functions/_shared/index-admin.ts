import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { decryptTokenValue } from "./token-crypto.ts";
import type { HandlerEvent } from "./types.ts";
import {
  getSolidaryAppUrl,
  getSolidaryRootIndexId,
  getSolidaryRootIndexUrl,
  getSolidaryRootRepoFullName,
  getSolidaryRootRepoUrl,
} from "./solidary-root-index.ts";
import {
  buildStandaloneAdminUrl,
  createIndexAdminBridgeToken,
  type IndexAdminBridgeRole,
  parseIndexAdminBridgeToken,
} from "./index-admin-bridge.ts";
import { resolveGitHubTokenForUser } from "./github-auth-broker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const GITHUB_API = "https://api.github.com";
const DEFAULT_INDEX_IMAGE_PATH = "/assets/index-image.jpg";
const BRIDGE_TOKEN_TTL_MS = 1000 * 60 * 60 * 2;
const INDEX_FINALIZATION_STALE_WINDOW_MS = 1000 * 60 * 10;

export type IndexAdminRole = IndexAdminBridgeRole;

export type IndexArchiveRow = {
  id: string;
  owner_user_id: string | null;
  type: "site" | "index" | null;
  is_root: boolean | null;
  runtime_mode: "scaffold" | "finalized" | null;
  slug: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  canonical_url: string | null;
  repo_full_name: string | null;
  repo_url: string | null;
  supabase_project_id: string | null;
  supabase_project_ref: string | null;
  supabase_project_name: string | null;
  supabase_dashboard_url: string | null;
  index_level: number | null;
  parent_index_id: string | null;
  parent_index_url: string | null;
  parent_index_level: number | null;
  parent_repo_full_name: string | null;
  parent_repo_url: string | null;
  finalized_at: string | null;
};

export type IndexProjectCredentialsRow = {
  archive_id: string;
  owner_user_id: string;
  supabase_project_ref: string;
  supabase_project_url: string;
  supabase_publishable_key: string | null;
  supabase_secret_key_encrypted: string;
  repo_owner: string;
  repo_name: string;
  repo_full_name: string;
  repo_url: string | null;
};

type IndexMembershipRow = {
  archive_id: string;
  user_id: string;
  role: IndexAdminRole;
};

type ChildArchiveRow = {
  id: string;
  type: "site" | "index" | null;
  is_root: boolean | null;
  runtime_mode: "scaffold" | "finalized" | null;
  canonical_url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  index_level: number | null;
  parent_index_id: string | null;
  parent_index_url: string | null;
  parent_index_level: number | null;
  parent_repo_full_name: string | null;
  parent_repo_url: string | null;
  finalized_at: string | null;
};

type ChildSiteRow = {
  id: string;
  canonical_url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  parent_index_id: string | null;
  parent_index_url: string | null;
  parent_index_level: number | null;
  meta?: Record<string, unknown> | null;
};

type ChildArchiveSiteRow = {
  site_id: string;
  status: string | null;
  created_at: string | null;
  delist_reason_code: string | null;
  delist_note: string | null;
};

type AuthUserSummary = {
  userId: string;
  email: string;
  displayName: string;
  githubLogin: string | null;
};

export type IndexCollaboratorRecord = AuthUserSummary & {
  role: IndexAdminRole;
};

export type IndexConnectionRecord = {
  siteId: string;
  status: "tracked" | "delisted";
  createdAt: string | null;
  delistReasonCode: string | null;
  delistNote: string | null;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string | null;
  type: "site" | "index" | null;
  parentIndexId: string | null;
  parentIndexUrl: string | null;
  parentIndexLevel: number | null;
};

export type IndexAdminContext = {
  supabase: ReturnType<typeof createServiceSupabase>;
  archive: IndexArchiveRow;
  credentials: IndexProjectCredentialsRow;
  actorUserId: string;
  actorRole: IndexAdminRole;
  via: "session" | "bridge";
};

export type IndexFinalizationJobRow = {
  id: string;
  archive_id: string;
  owner_user_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  step: string | null;
  error: string | null;
  source_repo_full_name: string | null;
  source_repo_url: string | null;
  source_branch: string | null;
  target_repo_full_name: string | null;
  child_project_ref: string | null;
  payload: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type ParentSourceRepoStatus =
  | "child_lineage"
  | "solidary_lineage"
  | "root_fallback"
  | "missing";

type ParentSourceRepoInput = {
  parent_index_id?: string | null;
  parent_index_url?: string | null;
  parent_repo_full_name?: string | null;
  parent_repo_url?: string | null;
};

export type ParentSourceRepoResolution = {
  repoFullName: string | null;
  repoUrl: string | null;
  sourceKind: ParentSourceRepoStatus;
  message: string | null;
};

const roleRank: Record<IndexAdminRole, number> = {
  contributor: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeComparableUrl = (value: string) =>
  value.trim().replace(/\/+$/, "").toLowerCase();

const normalizeRepoFullName = (value: unknown) => {
  const trimmed = toTrimmedString(value);
  return /^[^/\s]+\/[^/\s]+$/.test(trimmed) ? trimmed : "";
};

const toRepoUrl = (
  repoFullName: string,
  explicitUrl?: string | null,
) => toTrimmedString(explicitUrl) || `https://github.com/${repoFullName}`;

const isSolidaryRootParent = (
  childArchive: ParentSourceRepoInput | null | undefined,
  archive: ParentSourceRepoInput,
) => {
  const rootIndexId = getSolidaryRootIndexId();
  const rootIndexUrl = normalizeComparableUrl(getSolidaryRootIndexUrl());
  const candidateIds = [
    toTrimmedString(childArchive?.parent_index_id),
    toTrimmedString(archive.parent_index_id),
  ].filter(Boolean);
  if (candidateIds.includes(rootIndexId)) {
    return true;
  }

  const candidateUrls = [
    toTrimmedString(childArchive?.parent_index_url),
    toTrimmedString(archive.parent_index_url),
  ]
    .filter(Boolean)
    .map(normalizeComparableUrl);
  return candidateUrls.includes(rootIndexUrl);
};

const createServiceSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Missing SUPABASE_URL or Supabase service key.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

export const parseBridgeTokenFromEvent = (
  event: HandlerEvent,
  body: Record<string, unknown>,
) => {
  const directHeader = toTrimmedString(
    event.headers["x-index-admin-bridge"] ??
      event.headers["X-Index-Admin-Bridge"],
  );
  if (directHeader) return directHeader;
  return toTrimmedString(body.bridge_token);
};

const getDisplayNameFromUser = (user: Record<string, unknown>) => {
  const rawUserMeta = asRecord(user.raw_user_meta_data);
  const userMeta = asRecord(user.user_metadata);
  const email = toTrimmedString(user.email);
  return (
    toTrimmedString(rawUserMeta?.name) ||
    toTrimmedString(rawUserMeta?.full_name) ||
    toTrimmedString(rawUserMeta?.user_name) ||
    toTrimmedString(userMeta?.name) ||
    toTrimmedString(userMeta?.full_name) ||
    toTrimmedString(userMeta?.user_name) ||
    email ||
    "Unknown user"
  );
};

const getGithubLoginFromUser = (user: Record<string, unknown>) => {
  const candidates = [
    asRecord(user.raw_user_meta_data),
    asRecord(user.user_metadata),
    asRecord(user.app_metadata),
  ];
  for (const candidate of candidates) {
    const login = toTrimmedString(candidate?.user_name) ||
      toTrimmedString(candidate?.preferred_username) ||
      toTrimmedString(candidate?.login) ||
      toTrimmedString(candidate?.username);
    if (login) {
      return login.startsWith("@") ? login.slice(1) : login;
    }
  }
  return null;
};

const readAuthUserSummaryById = async (
  supabase: ReturnType<typeof createServiceSupabase>,
  userId: string,
): Promise<AuthUserSummary> => {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw new Error(error?.message ?? `User ${userId} not found.`);
  }

  const rawUser = data.user as unknown as Record<string, unknown>;
  return {
    userId,
    email: toTrimmedString(data.user.email),
    displayName: getDisplayNameFromUser(rawUser),
    githubLogin: getGithubLoginFromUser(rawUser),
  };
};

const resolveSessionUserId = async ({
  supabase,
  accessToken,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  accessToken: string;
}) => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user) {
    throw new Error("Invalid Supabase session.");
  }
  return user.id;
};

const readMembership = async ({
  supabase,
  archiveId,
  userId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  archiveId: string;
  userId: string;
}) => {
  const { data, error } = await supabase
    .from("index_admin_memberships")
    .select("archive_id, user_id, role")
    .eq("archive_id", archiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("You do not have access to this index admin.");
  }

  return data as unknown as IndexMembershipRow;
};

const readArchive = async ({
  supabase,
  archiveId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  archiveId: string;
}) => {
  const { data, error } = await supabase
    .from("archives")
    .select(
      [
        "id",
        "owner_user_id",
        "type",
        "is_root",
        "runtime_mode",
        "slug",
        "title",
        "description",
        "image_url",
        "canonical_url",
        "repo_full_name",
        "repo_url",
        "supabase_project_id",
        "supabase_project_ref",
        "supabase_project_name",
        "supabase_dashboard_url",
        "index_level",
        "parent_index_id",
        "parent_index_url",
        "parent_index_level",
        "parent_repo_full_name",
        "parent_repo_url",
        "finalized_at",
      ].join(", "),
    )
    .eq("id", archiveId)
    .eq("type", "index")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Index archive not found.");
  }

  return data as unknown as IndexArchiveRow;
};

const readCredentials = async ({
  supabase,
  archiveId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  archiveId: string;
}) => {
  const { data, error } = await supabase
    .from("index_project_credentials")
    .select(
      [
        "archive_id",
        "owner_user_id",
        "supabase_project_ref",
        "supabase_project_url",
        "supabase_publishable_key",
        "supabase_secret_key_encrypted",
        "repo_owner",
        "repo_name",
        "repo_full_name",
        "repo_url",
      ].join(", "),
    )
    .eq("archive_id", archiveId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Index project credentials are missing.");
  }

  return data as unknown as IndexProjectCredentialsRow;
};

export const readLatestIndexFinalizationJob = async ({
  supabase,
  archiveId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  archiveId: string;
}) => {
  const { data, error } = await supabase
    .from("index_finalization_jobs")
    .select(
      [
        "id",
        "archive_id",
        "owner_user_id",
        "status",
        "step",
        "error",
        "source_repo_full_name",
        "source_repo_url",
        "source_branch",
        "target_repo_full_name",
        "child_project_ref",
        "payload",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
      ].join(", "),
    )
    .eq("archive_id", archiveId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as unknown as IndexFinalizationJobRow | null;
};

const getIndexFinalizationActivityTimestamp = (
  job: IndexFinalizationJobRow,
) => {
  const timestamp = toTrimmedString(job.updated_at) ||
    toTrimmedString(job.started_at) ||
    toTrimmedString(job.created_at);
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isIndexFinalizationJobStale = (
  job: IndexFinalizationJobRow | null,
) => {
  if (!job || (job.status !== "queued" && job.status !== "running")) {
    return false;
  }

  const activityAt = getIndexFinalizationActivityTimestamp(job);
  if (activityAt === null) {
    return false;
  }

  return Date.now() - activityAt > INDEX_FINALIZATION_STALE_WINDOW_MS;
};

export const getEffectiveIndexFinalizationJob = (
  job: IndexFinalizationJobRow | null,
): IndexFinalizationJobRow | null => {
  if (!job || !isIndexFinalizationJobStale(job)) {
    return job;
  }

  return {
    ...job,
    status: "failed",
    step: "Index finalization stalled.",
    error: toTrimmedString(job.error) ||
      "The previous finalization job stopped reporting progress. Retry finalization.",
    completed_at: job.completed_at ?? job.updated_at ?? job.started_at ??
      job.created_at,
  };
};

export const resolveIndexAdminContext = async ({
  archiveId,
  supabaseAccessToken,
  bridgeToken,
}: {
  archiveId: string;
  supabaseAccessToken?: string;
  bridgeToken?: string;
}): Promise<IndexAdminContext> => {
  const normalizedArchiveId = archiveId.trim();
  if (!normalizedArchiveId) {
    throw new Error("Missing archive_id.");
  }

  const supabase = createServiceSupabase();
  let actorUserId = "";
  let via: "session" | "bridge" = "session";

  if (bridgeToken?.trim()) {
    const payload = parseIndexAdminBridgeToken(bridgeToken.trim());
    if (payload.archiveId !== normalizedArchiveId) {
      throw new Error("Admin bridge token does not match this index.");
    }
    actorUserId = payload.userId;
    via = "bridge";
  } else if (supabaseAccessToken?.trim()) {
    actorUserId = await resolveSessionUserId({
      supabase,
      accessToken: supabaseAccessToken.trim(),
    });
  } else {
    throw new Error("Missing Supabase session or admin bridge token.");
  }

  const membership = await readMembership({
    supabase,
    archiveId: normalizedArchiveId,
    userId: actorUserId,
  });
  const archive = await readArchive({
    supabase,
    archiveId: normalizedArchiveId,
  });
  const credentials = await readCredentials({
    supabase,
    archiveId: normalizedArchiveId,
  });

  return {
    supabase,
    archive,
    credentials,
    actorUserId,
    actorRole: membership.role,
    via,
  };
};

export const assertIndexAdminRole = (
  role: IndexAdminRole,
  minimumRole: IndexAdminRole,
) => {
  if ((roleRank[role] ?? -1) < (roleRank[minimumRole] ?? -1)) {
    throw new Error("You do not have permission for this action.");
  }
};

export const createChildProjectClient = (
  credentials: IndexProjectCredentialsRow,
) => {
  const secretKey = decryptTokenValue(
    credentials.supabase_secret_key_encrypted,
  );
  return createClient(
    credentials.supabase_project_url,
    secretKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
};

export const resolveParentSourceRepo = ({
  archive,
  childArchive,
}: {
  archive: ParentSourceRepoInput;
  childArchive?: ParentSourceRepoInput | null;
}): ParentSourceRepoResolution => {
  const childRepoFullName = normalizeRepoFullName(
    childArchive?.parent_repo_full_name,
  );
  if (childRepoFullName) {
    return {
      repoFullName: childRepoFullName,
      repoUrl: toRepoUrl(childRepoFullName, childArchive?.parent_repo_url),
      sourceKind: "child_lineage",
      message: null,
    };
  }

  const solidaryRepoFullName = normalizeRepoFullName(
    archive.parent_repo_full_name,
  );
  if (solidaryRepoFullName) {
    return {
      repoFullName: solidaryRepoFullName,
      repoUrl: toRepoUrl(solidaryRepoFullName, archive.parent_repo_url),
      sourceKind: "solidary_lineage",
      message:
        "Using the parent repo stored in Solidary. Finalization will backfill the child index lineage.",
    };
  }

  if (isSolidaryRootParent(childArchive, archive)) {
    const rootRepoFullName = normalizeRepoFullName(
      getSolidaryRootRepoFullName(),
    );
    if (rootRepoFullName) {
      return {
        repoFullName: rootRepoFullName,
        repoUrl: toRepoUrl(rootRepoFullName, getSolidaryRootRepoUrl()),
        sourceKind: "root_fallback",
        message:
          "Using the Solidary root repo fallback. Finalization will backfill stored lineage before copying files.",
      };
    }

    return {
      repoFullName: null,
      repoUrl: null,
      sourceKind: "missing",
      message:
        "This first-generation index is missing both stored lineage and Solidary root repo configuration.",
    };
  }

  return {
    repoFullName: null,
    repoUrl: null,
    sourceKind: "missing",
    message:
      "This index is missing parent repo lineage in both the child project and the parent archive record.",
  };
};

const resolveRepoDefaultSiteUrl = (owner: string, repo: string) => {
  const pagesRootUrl = `https://${owner}.github.io`;
  const isUserSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  return isUserSite ? pagesRootUrl : `${pagesRootUrl}/${repo}`;
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

const githubErrorMessage = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  return toTrimmedString(payload.message) || fallback;
};

const readRepoFileSha = async ({
  githubToken,
  owner,
  repo,
  path,
}: {
  githubToken: string;
  owner: string;
  repo: string;
  path: string;
}) => {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeGitHubPath(path)}`,
    {
      headers: githubHeaders(githubToken),
    },
  );
  if (response.status === 404) {
    return null;
  }
  const payload = (await response.json().catch(() => ({}))) as { sha?: string };
  if (!response.ok) {
    throw new Error(
      await githubErrorMessage(response, `Failed to read ${path} from GitHub.`),
    );
  }
  return toTrimmedString(payload.sha) || null;
};

const writeRepoFile = async ({
  githubToken,
  owner,
  repo,
  path,
  contentB64,
  message,
}: {
  githubToken: string;
  owner: string;
  repo: string;
  path: string;
  contentB64: string;
  message: string;
}) => {
  const currentSha = await readRepoFileSha({
    githubToken,
    owner,
    repo,
    path,
  });
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeGitHubPath(path)}`,
    {
      method: "PUT",
      headers: githubHeaders(githubToken),
      body: JSON.stringify({
        message,
        content: contentB64,
        sha: currentSha ?? undefined,
        branch: "main",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await githubErrorMessage(response, `Failed to write ${path} to GitHub.`),
    );
  }
};

const buildAbsoluteAssetUrl = ({
  siteUrl,
  assetPath,
}: {
  siteUrl: string;
  assetPath: string;
}) => {
  try {
    const base = new URL(siteUrl.trim());
    const normalizedAssetPath = assetPath.trim().replace(/^\/+/, "");
    const basePath = base.pathname.replace(/\/$/, "");
    base.pathname = `${basePath}/${normalizedAssetPath}`.replace(
      /\/{2,}/g,
      "/",
    );
    base.search = "";
    base.hash = "";
    return base.toString();
  } catch {
    return assetPath.trim();
  }
};

const encodeGitHubPath = (value: string) =>
  value.split("/").map((segment) => encodeURIComponent(segment)).join("/");

const buildSolidaryManifest = ({
  rootId,
  siteUrl,
  title,
  description,
  imageUrl,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
}: {
  rootId: string;
  siteUrl: string;
  title: string;
  description: string;
  imageUrl: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
}) =>
  `${
    JSON.stringify(
      {
        protocol_version: "1.0",
        type: "index",
        site_id: rootId,
        site_url: siteUrl,
        title,
        site_image: imageUrl,
        site_image_thumb: "",
        description,
        index_level: indexLevel,
        parent_index_id: parentIndexId,
        parent_index_url: parentIndexUrl,
        parent_index_level: parentIndexLevel,
      },
      null,
      2,
    )
  }\n`;

const buildSolidaryLinksManifest = ({
  rootId,
  siteUrl,
  connections,
}: {
  rootId: string;
  siteUrl: string;
  connections: {
    connectedSiteId: string;
    connectedSiteUrl: string;
    connectedSiteType?: "site" | "index";
  }[];
}) =>
  `${
    JSON.stringify(
      {
        "@context": {
          site: "urn:solidary:type:site",
          index: "urn:solidary:type:index",
          connection: "urn:solidary:type:connection",
          site_id: "urn:solidary:term:site_id",
          connections: {
            "@id": "urn:solidary:term:connections",
            "@container": "@set",
          },
          connected_site: "urn:solidary:term:connected_site",
        },
        "@id": siteUrl,
        "@type": "index",
        site_id: rootId,
        connections: connections.map((entry) => ({
          "@id": `urn:uuid:${entry.connectedSiteId}`,
          "@type": "connection",
          connected_site: {
            "@id": entry.connectedSiteUrl,
            "@type": entry.connectedSiteType === "index" ? "index" : "site",
            site_id: entry.connectedSiteId,
          },
        })),
      },
      null,
      2,
    )
  }\n`;

const syncParentIndexState = async ({
  context,
  title,
  description,
  imageUrl,
  siteUrl,
}: {
  context: IndexAdminContext;
  title: string;
  description: string;
  imageUrl: string;
  siteUrl: string;
}) => {
  const { error: archiveError } = await context.supabase
    .from("archives")
    .update({
      type: "index",
      title,
      description,
      image_url: imageUrl,
      canonical_url: siteUrl,
      index_level: context.archive.index_level,
      parent_index_id: context.archive.parent_index_id,
      parent_index_url: context.archive.parent_index_url,
      parent_index_level: context.archive.parent_index_level,
    })
    .eq("id", context.archive.id);
  if (archiveError) {
    throw new Error(archiveError.message);
  }
};

export const listAccessibleIndexesForUser = async ({
  supabaseAccessToken,
}: {
  supabaseAccessToken: string;
}) => {
  const supabase = createServiceSupabase();
  const userId = await resolveSessionUserId({
    supabase,
    accessToken: supabaseAccessToken,
  });

  const { data, error } = await supabase
    .from("index_admin_memberships")
    .select("archive_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }

  const archiveIds = (data ?? [])
    .map((row) => toTrimmedString(row.archive_id))
    .filter(Boolean);
  if (!archiveIds.length) return [];

  const { data: archives, error: archivesError } = await supabase
    .from("archives")
    .select(
      [
        "id",
        "owner_user_id",
        "type",
        "slug",
        "title",
        "description",
        "image_url",
        "canonical_url",
        "repo_full_name",
        "repo_url",
        "supabase_project_ref",
        "supabase_dashboard_url",
        "index_level",
        "parent_index_id",
        "parent_index_url",
        "parent_index_level",
      ].join(", "),
    )
    .in("id", archiveIds)
    .eq("type", "index")
    .order("updated_at", { ascending: false });
  if (archivesError) {
    throw new Error(archivesError.message);
  }

  const roleByArchiveId = new Map(
    (data ?? []).map((
      row,
    ) => [toTrimmedString(row.archive_id), toTrimmedString(row.role)]),
  );

  return ((archives ?? []) as unknown as IndexArchiveRow[]).map((archive) => ({
    id: archive.id,
    slug: archive.slug ?? "",
    title: archive.title ?? "Untitled index",
    description: archive.description ?? "",
    imageUrl: archive.image_url ?? "",
    canonicalUrl: archive.canonical_url ?? "",
    repoFullName: archive.repo_full_name ?? null,
    repoUrl: archive.repo_url ?? null,
    supabaseProjectRef: archive.supabase_project_ref ?? null,
    supabaseDashboardUrl: archive.supabase_dashboard_url ?? null,
    indexLevel: archive.index_level ?? null,
    parentIndexId: archive.parent_index_id ?? null,
    parentIndexUrl: archive.parent_index_url ?? null,
    parentIndexLevel: archive.parent_index_level ?? null,
    accessRole:
      (roleByArchiveId.get(archive.id) as IndexAdminRole | undefined) ??
        "owner",
  }));
};

const listCollaborators = async (
  context: IndexAdminContext,
): Promise<IndexCollaboratorRecord[]> => {
  const { data, error } = await context.supabase
    .from("index_admin_memberships")
    .select("archive_id, user_id, role")
    .eq("archive_id", context.archive.id)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  const memberships = (data ?? []) as unknown as IndexMembershipRow[];
  const collaborators = await Promise.all(
    memberships.map(async (membership) => {
      const summary = await readAuthUserSummaryById(
        context.supabase,
        membership.user_id,
      );
      return {
        ...summary,
        role: membership.role,
      } satisfies IndexCollaboratorRecord;
    }),
  );

  return collaborators.sort((left, right) =>
    roleRank[right.role] - roleRank[left.role]
  );
};

export const readIndexAdminState = async (context: IndexAdminContext) => {
  const child = createChildProjectClient(context.credentials);
  const { data: archiveData, error: archiveError } = await child
    .from("archives")
    .select(
      [
        "id",
        "type",
        "is_root",
        "runtime_mode",
        "canonical_url",
        "title",
        "description",
        "image_url",
        "index_level",
        "parent_index_id",
        "parent_index_url",
        "parent_index_level",
        "parent_repo_full_name",
        "parent_repo_url",
        "finalized_at",
      ].join(", "),
    )
    .eq("id", context.archive.id)
    .maybeSingle();
  if (archiveError) {
    throw new Error(archiveError.message);
  }
  const archive = (archiveData ?? null) as unknown as ChildArchiveRow | null;
  if (!archive) {
    throw new Error("The child index is missing its archive metadata row.");
  }

  const { data: connectionRows, error: connectionsError } = await child
    .from("archive_sites")
    .select("site_id, status, created_at, delist_reason_code, delist_note")
    .eq("archive_id", context.archive.id)
    .order("created_at", { ascending: false });
  if (connectionsError) {
    throw new Error(connectionsError.message);
  }

  const rawConnections =
    (connectionRows ?? []) as unknown as ChildArchiveSiteRow[];
  const siteIds = rawConnections
    .map((row) => toTrimmedString(row.site_id))
    .filter(Boolean);
  let connectedSites: ChildSiteRow[] = [];

  if (siteIds.length) {
    const { data: childSites, error: childSitesError } = await child
      .from("sites")
      .select(
        [
          "id",
          "canonical_url",
          "title",
          "description",
          "image_url",
          "parent_index_id",
          "parent_index_url",
          "parent_index_level",
        ].join(", "),
      )
      .in("id", siteIds);
    if (childSitesError) {
      throw new Error(childSitesError.message);
    }
    connectedSites = (childSites ?? []) as unknown as ChildSiteRow[];
  }

  const connectedSiteById = new Map(
    connectedSites.map((entry) => [entry.id, entry] as const),
  );
  const connections = rawConnections
    .filter((row) => toTrimmedString(row.site_id))
    .map((row) => {
      const childSite = connectedSiteById.get(row.site_id);
      return {
        siteId: row.site_id,
        status: row.status === "delisted" ? "delisted" : "tracked",
        createdAt: row.created_at,
        delistReasonCode: row.delist_reason_code,
        delistNote: row.delist_note,
        title: childSite?.title ?? row.site_id,
        description: childSite?.description ?? "",
        canonicalUrl: childSite?.canonical_url ?? "",
        imageUrl: childSite?.image_url ?? null,
        type: childSite ? "site" : null,
        parentIndexId: childSite?.parent_index_id ?? null,
        parentIndexUrl: childSite?.parent_index_url ?? null,
        parentIndexLevel: childSite?.parent_index_level ?? null,
      } satisfies IndexConnectionRecord;
    });

  const collaborators = await listCollaborators(context);
  const bridgeToken = createIndexAdminBridgeToken({
    archiveId: context.archive.id,
    userId: context.actorUserId,
    role: context.actorRole,
    expiresAt: new Date(Date.now() + BRIDGE_TOKEN_TTL_MS).toISOString(),
  });
  const standaloneAdminUrl = buildStandaloneAdminUrl({
    siteUrl: archive.canonical_url ?? context.archive.canonical_url ?? "",
    bridgeToken,
  });

  return {
    actor: {
      userId: context.actorUserId,
      role: context.actorRole,
      via: context.via,
      canEditGeneral: roleRank[context.actorRole] >= roleRank.editor,
      canManageConnections: roleRank[context.actorRole] >= roleRank.admin,
      canManageCollaborators: roleRank[context.actorRole] >= roleRank.admin,
      canManageAdvanced: context.actorRole === "owner",
    },
    archive: {
      id: context.archive.id,
      slug: context.archive.slug ?? "",
      title: archive.title ?? context.archive.title ?? "",
      description: archive.description ?? context.archive.description ?? "",
      imageUrl: archive.image_url ?? context.archive.image_url ?? "",
      canonicalUrl: archive.canonical_url ?? context.archive.canonical_url ??
        "",
      repoFullName: context.archive.repo_full_name ??
        context.credentials.repo_full_name,
      repoUrl: context.archive.repo_url ?? context.credentials.repo_url ?? null,
      supabaseProjectRef: context.archive.supabase_project_ref ??
        context.credentials.supabase_project_ref,
      supabaseDashboardUrl: context.archive.supabase_dashboard_url ?? null,
      supabaseProjectUrl: context.credentials.supabase_project_url,
      supabasePublishableKey: context.credentials.supabase_publishable_key ??
        "",
      indexLevel: archive.index_level ?? context.archive.index_level ?? null,
      parentIndexId: archive.parent_index_id ??
        context.archive.parent_index_id ??
        null,
      parentIndexUrl: archive.parent_index_url ??
        context.archive.parent_index_url ?? null,
      parentIndexLevel: archive.parent_index_level ??
        context.archive.parent_index_level ?? null,
      parentRepoFullName: archive.parent_repo_full_name ?? null,
      parentRepoUrl: archive.parent_repo_url ?? null,
      type: archive.type ?? context.archive.type ?? "index",
      standaloneAdminUrl,
      solidaryAdminUrl:
        `${getSolidaryAppUrl()}/admin?archiveId=${context.archive.id}`,
      authCallbackUrl:
        `${context.credentials.supabase_project_url}/auth/v1/callback`,
      authProvidersDashboardUrl: context.archive.supabase_dashboard_url
        ? `${context.archive.supabase_dashboard_url}/auth/providers`
        : "",
    },
    connections,
    collaborators,
  };
};

const updateChildIndexMetadata = async ({
  context,
  title,
  description,
  imageUrl,
  siteUrl,
}: {
  context: IndexAdminContext;
  title: string;
  description: string;
  imageUrl: string;
  siteUrl: string;
}) => {
  const child = createChildProjectClient(context.credentials);
  const { error: archiveError } = await child
    .from("archives")
    .update({
      type: "index",
      title,
      description,
      image_url: imageUrl,
      canonical_url: siteUrl,
      index_level: context.archive.index_level,
      parent_index_id: context.archive.parent_index_id,
      parent_index_url: context.archive.parent_index_url,
      parent_index_level: context.archive.parent_index_level,
    })
    .eq("id", context.archive.id);
  if (archiveError) {
    throw new Error(archiveError.message);
  }

  await syncParentIndexState({
    context,
    title,
    description,
    imageUrl,
    siteUrl,
  });
};

const resolveOwnerGitHubToken = async (context: IndexAdminContext) => {
  const ownerUserId = toTrimmedString(context.archive.owner_user_id);
  if (!ownerUserId) {
    throw new Error("Index owner GitHub identity is not available.");
  }

  const resolved = await resolveGitHubTokenForUser({
    supabase: context.supabase,
    userId: ownerUserId,
  });
  const token = toTrimmedString(resolved?.token);
  if (!token) {
    throw new Error(
      "Reconnect GitHub from Profile before changing standalone index files.",
    );
  }

  return token;
};

export const updateIndexGeneralSettings = async ({
  context,
  title,
  description,
  imageContentB64,
}: {
  context: IndexAdminContext;
  title: string;
  description: string;
  imageContentB64?: string;
}) => {
  assertIndexAdminRole(context.actorRole, "editor");

  const currentState = await readIndexAdminState(context);
  let nextImageUrl = currentState.archive.imageUrl || "";

  if (toTrimmedString(imageContentB64)) {
    const githubToken = await resolveOwnerGitHubToken(context);
    await writeRepoFile({
      githubToken,
      owner: context.credentials.repo_owner,
      repo: context.credentials.repo_name,
      path: "site/assets/index-image.jpg",
      contentB64: toTrimmedString(imageContentB64),
      message: "Update standalone index image",
    });
    nextImageUrl = buildAbsoluteAssetUrl({
      siteUrl: currentState.archive.canonicalUrl,
      assetPath: DEFAULT_INDEX_IMAGE_PATH,
    });
  }

  const manifest = buildSolidaryManifest({
    rootId: currentState.archive.id,
    siteUrl: currentState.archive.canonicalUrl,
    title,
    description,
    imageUrl: nextImageUrl,
    indexLevel: currentState.archive.indexLevel ?? 1,
    parentIndexId: currentState.archive.parentIndexId ?? "",
    parentIndexUrl: currentState.archive.parentIndexUrl ?? "",
    parentIndexLevel: currentState.archive.parentIndexLevel ?? 0,
  });
  const githubToken = await resolveOwnerGitHubToken(context);
  await writeRepoFile({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    path: "site/.well-known/solidary.json",
    contentB64: Buffer.from(manifest, "utf8").toString("base64"),
    message: "Update standalone index metadata",
  });

  await updateChildIndexMetadata({
    context,
    title,
    description,
    imageUrl: nextImageUrl,
    siteUrl: currentState.archive.canonicalUrl,
  });
};

export const searchIndexCollaboratorCandidates = async ({
  context,
  query,
  limit = 10,
}: {
  context: IndexAdminContext;
  query: string;
  limit?: number;
}) => {
  assertIndexAdminRole(context.actorRole, "admin");
  const { data, error } = await context.supabase.rpc(
    "index_search_collaborator_candidates",
    {
      p_archive_id: context.archive.id,
      p_actor_user_id: context.actorUserId,
      p_query: query,
      p_limit: limit,
    },
  );
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown[]).map((row) => {
    const record = asRecord(row) ?? {};
    return {
      userId: toTrimmedString(record.user_id),
      email: toTrimmedString(record.email),
      displayName: toTrimmedString(record.display_name) ||
        toTrimmedString(record.email),
      githubLogin: toTrimmedString(record.github_login) || null,
    };
  }).filter(
    (
      entry,
    ): entry is {
      userId: string;
      email: string;
      displayName: string;
      githubLogin: string | null;
    } => Boolean(entry.userId && entry.email),
  );
};

export const upsertIndexCollaborator = async ({
  context,
  collaboratorUserId,
  role,
}: {
  context: IndexAdminContext;
  collaboratorUserId: string;
  role: Exclude<IndexAdminRole, "owner">;
}) => {
  assertIndexAdminRole(context.actorRole, "admin");
  const targetUserId = collaboratorUserId.trim();
  if (!targetUserId) {
    throw new Error("Missing collaborator user id.");
  }
  if (targetUserId === context.archive.owner_user_id) {
    throw new Error("Owner access cannot be modified from collaborators.");
  }

  const { error } = await context.supabase
    .from("index_admin_memberships")
    .upsert({
      archive_id: context.archive.id,
      user_id: targetUserId,
      role,
    });
  if (error) {
    throw new Error(error.message);
  }
};

export const removeIndexCollaborator = async ({
  context,
  collaboratorUserId,
}: {
  context: IndexAdminContext;
  collaboratorUserId: string;
}) => {
  assertIndexAdminRole(context.actorRole, "admin");
  const targetUserId = collaboratorUserId.trim();
  if (!targetUserId) {
    throw new Error("Missing collaborator user id.");
  }
  if (targetUserId === context.archive.owner_user_id) {
    throw new Error("Owner access cannot be removed.");
  }

  const { error } = await context.supabase
    .from("index_admin_memberships")
    .delete()
    .eq("archive_id", context.archive.id)
    .eq("user_id", targetUserId);
  if (error) {
    throw new Error(error.message);
  }
};

export const updateIndexConnectionStatus = async ({
  context,
  siteId,
  status,
}: {
  context: IndexAdminContext;
  siteId: string;
  status: "tracked" | "delisted";
}) => {
  assertIndexAdminRole(context.actorRole, "admin");
  const normalizedSiteId = siteId.trim();
  if (!normalizedSiteId) {
    throw new Error("Missing site id.");
  }

  const child = createChildProjectClient(context.credentials);
  const { error } = await child.from("archive_sites").upsert({
    archive_id: context.archive.id,
    site_id: normalizedSiteId,
    status,
    delist_reason_code: status === "delisted" ? "index_admin_removed" : null,
    delist_note: null,
  });
  if (error) {
    throw new Error(error.message);
  }

  const updatedState = await readIndexAdminState(context);
  const linksManifest = buildSolidaryLinksManifest({
    rootId: updatedState.archive.id,
    siteUrl: updatedState.archive.canonicalUrl,
    connections: updatedState.connections
      .filter((entry) => entry.status === "tracked" && entry.canonicalUrl)
      .map((entry) => ({
        connectedSiteId: entry.siteId,
        connectedSiteUrl: entry.canonicalUrl,
        connectedSiteType: entry.type ?? "site",
      })),
  });
  const githubToken = await resolveOwnerGitHubToken(context);
  await writeRepoFile({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    path: "site/.well-known/solidary-links.json",
    contentB64: Buffer.from(linksManifest, "utf8").toString("base64"),
    message: "Update standalone index connections metadata",
  });
};

const updateGitHubPagesDomain = async ({
  githubToken,
  owner,
  repo,
  domain,
}: {
  githubToken: string;
  owner: string;
  repo: string;
  domain: string | null;
}) => {
  const initialResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pages`,
    {
      headers: githubHeaders(githubToken),
    },
  );
  const initialPayload =
    (await initialResponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!initialResponse.ok) {
    throw new Error(
      toTrimmedString(initialPayload.message) ||
        "GitHub Pages is not enabled for this repository yet.",
    );
  }

  const source = asRecord(initialPayload.source);
  const updatePayload: Record<string, unknown> = {
    cname: domain ?? "",
  };
  const branch = toTrimmedString(source?.branch);
  const path = toTrimmedString(source?.path) || "/";
  const buildType = toTrimmedString(initialPayload.build_type);
  if (branch) {
    updatePayload.source = {
      branch,
      path,
    };
  }
  if (buildType) {
    updatePayload.build_type = buildType;
  }

  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
    method: "PUT",
    headers: githubHeaders(githubToken),
    body: JSON.stringify(updatePayload),
  });
  if (!response.ok) {
    throw new Error(
      await githubErrorMessage(
        response,
        "Failed to update GitHub Pages domain.",
      ),
    );
  }
};

export const updateIndexAdvancedSettings = async ({
  context,
  domain,
}: {
  context: IndexAdminContext;
  domain: string | null;
}) => {
  assertIndexAdminRole(context.actorRole, "owner");
  const githubToken = await resolveOwnerGitHubToken(context);
  const normalizedDomain =
    toTrimmedString(domain).replace(/^https?:\/\//i, "").replace(/\/.*$/, "")
      .replace(/\.+$/, "").toLowerCase() || null;

  await updateGitHubPagesDomain({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    domain: normalizedDomain,
  });

  const nextSiteUrl = normalizedDomain
    ? `https://${normalizedDomain}`
    : resolveRepoDefaultSiteUrl(
      context.credentials.repo_owner,
      context.credentials.repo_name,
    );
  const currentState = await readIndexAdminState(context);
  const imageUrl = currentState.archive.imageUrl
    ? buildAbsoluteAssetUrl({
      siteUrl: nextSiteUrl,
      assetPath: DEFAULT_INDEX_IMAGE_PATH,
    })
    : "";

  const manifest = buildSolidaryManifest({
    rootId: currentState.archive.id,
    siteUrl: nextSiteUrl,
    title: currentState.archive.title,
    description: currentState.archive.description,
    imageUrl,
    indexLevel: currentState.archive.indexLevel ?? 1,
    parentIndexId: currentState.archive.parentIndexId ?? "",
    parentIndexUrl: currentState.archive.parentIndexUrl ?? "",
    parentIndexLevel: currentState.archive.parentIndexLevel ?? 0,
  });
  await writeRepoFile({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    path: "site/.well-known/solidary.json",
    contentB64: Buffer.from(manifest, "utf8").toString("base64"),
    message: "Update standalone index domain metadata",
  });
  const linksManifest = buildSolidaryLinksManifest({
    rootId: currentState.archive.id,
    siteUrl: nextSiteUrl,
    connections: currentState.connections
      .filter((entry) => entry.status === "tracked" && entry.canonicalUrl)
      .map((entry) => ({
        connectedSiteId: entry.siteId,
        connectedSiteUrl: entry.canonicalUrl,
        connectedSiteType: entry.type ?? "site",
      })),
  });
  await writeRepoFile({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    path: "site/.well-known/solidary-links.json",
    contentB64: Buffer.from(linksManifest, "utf8").toString("base64"),
    message: "Update standalone index connection metadata",
  });

  await updateChildIndexMetadata({
    context,
    title: currentState.archive.title,
    description: currentState.archive.description,
    imageUrl,
    siteUrl: nextSiteUrl,
  });

  return nextSiteUrl;
};

const buildFinalizationSetup = ({
  context,
  state,
  latestJob,
}: {
  context: IndexAdminContext;
  state: Awaited<ReturnType<typeof readIndexAdminState>>;
  latestJob: IndexFinalizationJobRow | null;
}) => {
  const parentSource = resolveParentSourceRepo({
    archive: context.archive,
    childArchive: {
      parent_index_id: state.archive.parentIndexId,
      parent_index_url: state.archive.parentIndexUrl,
      parent_repo_full_name: state.archive.parentRepoFullName,
      parent_repo_url: state.archive.parentRepoUrl,
    },
  });
  const effectiveJob = getEffectiveIndexFinalizationJob(latestJob);
  const jobStatus = effectiveJob?.status ?? null;
  const isFinalized = context.archive.runtime_mode === "finalized";
  const isRunning = jobStatus === "queued" || jobStatus === "running";

  return {
    available: context.actorRole === "owner" &&
      !isFinalized &&
      parentSource.sourceKind !== "missing",
    isFinalized,
    isRunning,
    status: isFinalized ? "finalized" : jobStatus ?? "idle",
    step: isFinalized
      ? "Standalone app finalized."
      : toTrimmedString(effectiveJob?.step) || null,
    error: jobStatus === "failed" ? toTrimmedString(effectiveJob?.error) : null,
    startedAt: effectiveJob?.started_at ?? null,
    completedAt: isFinalized
      ? (context.archive.finalized_at ?? effectiveJob?.completed_at ?? null)
      : (effectiveJob?.completed_at ?? null),
    sourceRepoFullName: parentSource.repoFullName,
    sourceRepoUrl: parentSource.repoUrl,
    sourceRepoStatus: parentSource.sourceKind,
    sourceRepoMessage: parentSource.message,
    targetStudioUrl: context.archive.canonical_url
      ? `${context.archive.canonical_url.replace(/\/+$/, "")}/studio`
      : "",
    targetExplorerUrl: context.archive.canonical_url
      ? `${context.archive.canonical_url.replace(/\/+$/, "")}/explorer`
      : "",
    targetSearchUrl: context.archive.canonical_url
      ? `${context.archive.canonical_url.replace(/\/+$/, "")}/search`
      : "",
  };
};

export const buildStandaloneAdminSetup = ({
  context,
  state,
  latestJob,
}: {
  context: IndexAdminContext;
  state: Awaited<ReturnType<typeof readIndexAdminState>>;
  latestJob: IndexFinalizationJobRow | null;
}) => ({
  finalization: buildFinalizationSetup({
    context,
    state,
    latestJob,
  }),
  liveUrl: state.archive.canonicalUrl,
  repoUrl: state.archive.repoUrl,
  supabaseDashboardUrl: state.archive.supabaseDashboardUrl,
  standaloneAdminUrl: state.archive.standaloneAdminUrl,
  authCallbackUrl: state.archive.authCallbackUrl,
  authProvidersDashboardUrl: state.archive.authProvidersDashboardUrl,
  nextSteps: context.archive.runtime_mode === "finalized"
    ? [
      "Open Search, Explorer, and Studio from the links below to verify the copied app is live.",
      "Keep using the standalone /admin bridge link until you complete local auth and GitHub app setup on the child project.",
      "If you want the finalized repo to spawn sites or indexes, make sure the child project's GitHub App and Supabase OAuth secrets are configured too.",
    ]
    : [
      "Create a GitHub OAuth application for the standalone index.",
      "Enable GitHub in the new Supabase project's Auth providers.",
      "Use the standalone index URL as the site URL and the Supabase auth callback URL in the GitHub app.",
      "When the standalone setup is ready, click Finalise Index to copy over Search, Explorer, Studio, functions, and repo files from the parent index.",
      "Until that is configured, use the bridge link below to access /admin.",
    ],
  solidaryAdminUrl:
    `${getSolidaryAppUrl()}/admin?archiveId=${context.archive.id}`,
});
