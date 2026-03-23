import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import sodium from "npm:libsodium-wrappers-sumo@0.7.15";
import { decryptTokenValue, encryptTokenValue } from "./token-crypto.ts";
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
import {
  resolveGitHubTokenForUser,
  resolveGitHubTokenForUserByMode,
} from "./github-auth-broker.ts";
import {
  buildSupabaseManagementUriAllowList,
  readSupabaseProjectAuthConfig,
  resolveSupabaseManagementAccessForUser,
  splitSupabaseManagementScopes,
  SupabaseManagementReauthError,
  updateSupabaseProjectAuthConfig,
  updateSupabaseProjectFunctionSecrets,
  updateSupabaseProjectGitHubAuthConfig,
} from "./supabase-management-auth/index.ts";
import {
  type IndexFinalizationPhase,
  parseIndexFinalizationPayload,
} from "./index-finalization.ts";
import { buildIndexParentConnectionUuid } from "./index-parent-connection.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";
const GITHUB_API = "https://api.github.com";
const DEFAULT_INDEX_IMAGE_PATH = "/assets/index-image.jpg";
const BRIDGE_TOKEN_TTL_MS = 1000 * 60 * 60 * 2;
const INDEX_FINALIZATION_STALE_WINDOW_MS = 1000 * 60 * 2;
const INDEX_LIVE_DEPLOY_WORKFLOW_FILE = "deploy.yml";
const INDEX_FUNCTIONS_WORKFLOW_BRANCH = "main";
const INDEX_AUTH_CONFIG_REQUIRED_SCOPES = ["auth:write"] as const;
const GITHUB_OAUTH_APP_CREATE_URL =
  "https://github.com/settings/applications/new";
const INDEX_REQUIRED_REPO_SECRET_NAMES = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF_PROD",
  "ADMIN_PASSWORD",
] as const;
export const ROOT_INDEX_ADMIN_BRIDGE_USER_ID = "__solidary_root_admin__";

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
  supabase_project_url: string | null;
  supabase_publishable_key: string | null;
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
  index_id: string;
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
  index_id: string;
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

type ChildConnectionRow = {
  id: string;
  connection_uuid: string;
  source_site_id: string;
  status: string | null;
  created_at: string | null;
  responded_at: string | null;
};

type ChildOwnerDraftRow = {
  site_id: string;
  owner_user_id: string;
  repo_full_name: string | null;
};

type AuthUserSummary = {
  userId: string;
  email: string;
  displayName: string;
  githubLogin: string | null;
};

type GitHubActionsSecretPayload = {
  name?: unknown;
};

type GitHubActionsSecretPublicKeyPayload = {
  key?: unknown;
  key_id?: unknown;
};

type GitHubActionsSecretsListPayload = {
  secrets?: unknown;
};

type GitHubActionsWorkflowRun = {
  id?: unknown;
  html_url?: unknown;
  status?: unknown;
  conclusion?: unknown;
  path?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  run_started_at?: unknown;
};

type GitHubActionsWorkflowRunsPayload = {
  workflow_runs?: unknown;
};

type GitHubActionsWorkflowRunStep = {
  name?: unknown;
  status?: unknown;
  conclusion?: unknown;
};

type GitHubActionsWorkflowRunJob = {
  name?: unknown;
  status?: unknown;
  conclusion?: unknown;
  steps?: unknown;
};

type GitHubActionsWorkflowRunJobsPayload = {
  jobs?: unknown;
};

export type IndexCollaboratorRecord = AuthUserSummary & {
  role: IndexAdminRole;
};

export type IndexConnectionRecord = {
  requestId: string;
  connectionUuid: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string | null;
  respondedAt: string | null;
  sourceSiteId: string;
  sourceSiteTitle: string;
  sourceSiteUrl: string;
  sourceSiteImageUrl: string;
  sourceOwnerDisplayName: string;
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
  index_id: string;
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

export type IndexFunctionsDeploymentStatus =
  | "not_ready"
  | "needs_secrets"
  | "ready_to_run"
  | "running"
  | "failed"
  | "deployed"
  | "unknown";

export type IndexRepoSecretRequirement = {
  name: (typeof INDEX_REQUIRED_REPO_SECRET_NAMES)[number];
  isConfigured: boolean;
  value: string | null;
  description: string;
};

export type IndexAuthSetup = {
  siteUrl: string;
  callbackUrl: string;
  providerSettingsUrl: string;
  githubOauthAppUrl: string;
  githubOauthAppName: string;
  githubProviderEnabled: boolean;
  githubClientIdConfigured: boolean;
  githubClientIdMatches: boolean;
  siteUrlMatches: boolean;
  uriAllowListMatches: boolean;
  localAuthReady: boolean;
  message: string | null;
};

export type IndexFunctionsDeploymentRunStep = {
  name: string;
  status: string | null;
  conclusion: string | null;
};

export type IndexFunctionsDeploymentRunJob = {
  name: string;
  status: string | null;
  conclusion: string | null;
  steps: IndexFunctionsDeploymentRunStep[];
};

export type IndexFunctionsDeploymentRun = {
  status: string | null;
  conclusion: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  jobs: IndexFunctionsDeploymentRunJob[];
};

export type IndexFunctionsDeploymentSetup = {
  status: IndexFunctionsDeploymentStatus;
  message: string | null;
  workflowUrl: string | null;
  runUrl: string | null;
  latestRun: IndexFunctionsDeploymentRun | null;
  requiredSecrets: IndexRepoSecretRequirement[];
  canDispatch: boolean;
};

export type IndexFinalizationStatus =
  | "idle"
  | "queued"
  | "running"
  | "failed"
  | "finalized";

export type IndexFinalizationState = {
  available: boolean;
  isFinalized: boolean;
  isRunning: boolean;
  status: IndexFinalizationStatus;
  phase: IndexFinalizationPhase | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  canRetry: boolean;
  step: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sourceRepoFullName: string | null;
  sourceRepoUrl: string | null;
  sourceRepoStatus: ParentSourceRepoStatus;
  sourceRepoMessage: string | null;
  targetStudioUrl: string;
  targetExplorerUrl: string;
  targetSearchUrl: string;
  functionsDeployStatus: IndexFunctionsDeploymentStatus;
  functionsDeployMessage: string | null;
  functionsDeployWorkflowUrl: string | null;
  functionsDeployRunUrl: string | null;
  requiredRepoSecrets: IndexRepoSecretRequirement[];
};

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

const deriveProjectRefFromSupabaseUrl = (value: string) => {
  const normalized = toTrimmedString(value);
  if (!normalized) return "";

  try {
    const hostname = new URL(normalized).hostname.trim().toLowerCase();
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
};

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

const isSolidaryRootArchive = (
  archive: Pick<IndexArchiveRow, "id" | "is_root"> | null | undefined,
) => archive?.is_root === true || toTrimmedString(archive?.id) === getSolidaryRootIndexId();

const isRootPasswordAdminUserId = (value: string) =>
  value.trim() === ROOT_INDEX_ADMIN_BRIDGE_USER_ID;

export const isRootPasswordAdminContext = (
  context: Pick<IndexAdminContext, "archive" | "actorUserId" | "via">,
) =>
  context.via === "bridge" &&
  isSolidaryRootArchive(context.archive) &&
  isRootPasswordAdminUserId(context.actorUserId);

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
    .select("index_id, user_id, role")
    .eq("index_id", archiveId)
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
  const archiveSelect = [
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
    "supabase_project_url",
    "supabase_publishable_key",
    "supabase_dashboard_url",
    "index_level",
    "parent_index_id",
    "parent_index_url",
    "parent_index_level",
    "parent_repo_full_name",
    "parent_repo_url",
    "finalized_at",
  ].join(", ");
  const { data, error } = await supabase
    .from("indexes")
    .select(archiveSelect)
    .eq("id", archiveId)
    .eq("type", "index")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (data) {
    return data as unknown as IndexArchiveRow;
  }

  if (archiveId === getSolidaryRootIndexId()) {
    const { data: rootData, error: rootError } = await supabase
      .from("indexes")
      .select(archiveSelect)
      .eq("type", "index")
      .eq("is_root", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (rootError) {
      throw new Error(rootError.message);
    }
    if (rootData) {
      return rootData as unknown as IndexArchiveRow;
    }
  }

  throw new Error("Index not found.");
};

const readCredentials = async ({
  supabase,
  archiveId,
  archive,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  archiveId: string;
  archive?: IndexArchiveRow | null;
}) => {
  const { data, error } = await supabase
    .from("index_project_credentials")
    .select(
      [
        "index_id",
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
    .eq("index_id", archiveId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (data) {
    return data as unknown as IndexProjectCredentialsRow;
  }

  if (archive && isSolidaryRootArchive(archive)) {
    const repoFullName = normalizeRepoFullName(archive.repo_full_name) ||
      normalizeRepoFullName(getSolidaryRootRepoFullName());
    const [repoOwner = "", repoName = ""] = repoFullName.split("/");
    const supabaseProjectUrl = toTrimmedString(archive.supabase_project_url) ||
      toTrimmedString(SUPABASE_URL);
    const supabaseProjectRef = toTrimmedString(archive.supabase_project_ref) ||
      deriveProjectRefFromSupabaseUrl(supabaseProjectUrl);
    const supabasePublishableKey =
      toTrimmedString(archive.supabase_publishable_key) ||
      toTrimmedString(Deno.env.get("SOLIDARY_PUBLISHABLE_KEY")) ||
      toTrimmedString(Deno.env.get("SUPABASE_PUBLISHABLE_KEY")) ||
      "";

    if (!supabaseProjectUrl || !SUPABASE_SERVICE_KEY) {
      throw new Error("Index project credentials are missing.");
    }

    return {
      index_id: archive.id,
      owner_user_id: ROOT_INDEX_ADMIN_BRIDGE_USER_ID,
      supabase_project_ref: supabaseProjectRef,
      supabase_project_url: supabaseProjectUrl,
      supabase_publishable_key: supabasePublishableKey || null,
      supabase_secret_key_encrypted: encryptTokenValue(SUPABASE_SERVICE_KEY),
      repo_owner: repoOwner,
      repo_name: repoName,
      repo_full_name: repoFullName,
      repo_url: toTrimmedString(archive.repo_url) || getSolidaryRootRepoUrl(),
    } satisfies IndexProjectCredentialsRow;
  }

  throw new Error("Index project credentials are missing.");
};

export const readLatestIndexFinalizationJob = async ({
  supabase,
  indexId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  indexId: string;
}) => {
  const { data, error } = await supabase
    .from("index_finalization_jobs")
    .select(
      [
        "id",
        "index_id",
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
    .eq("index_id", indexId)
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
  indexId,
  supabaseAccessToken,
  bridgeToken,
}: {
  indexId: string;
  supabaseAccessToken?: string;
  bridgeToken?: string;
}): Promise<IndexAdminContext> => {
  const normalizedIndexId = indexId.trim();
  if (!normalizedIndexId) {
    throw new Error("Missing index_id.");
  }

  const supabase = createServiceSupabase();
  const archive = await readArchive({
    supabase,
    archiveId: normalizedIndexId,
  });
  let actorUserId = "";
  let actorRole: IndexAdminRole;
  let via: "session" | "bridge" = "session";

  if (bridgeToken?.trim()) {
    const payload = parseIndexAdminBridgeToken(bridgeToken.trim());
    if (payload.indexId !== normalizedIndexId) {
      throw new Error("Admin bridge token does not match this index.");
    }
    actorUserId = payload.userId;
    via = "bridge";
    if (
      isSolidaryRootArchive(archive) && isRootPasswordAdminUserId(actorUserId)
    ) {
      const credentials = await readCredentials({
        supabase,
        archiveId: normalizedIndexId,
        archive,
      });
      return {
        supabase,
        archive,
        credentials,
        actorUserId,
        actorRole: payload.role,
        via,
      };
    }
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
    archiveId: normalizedIndexId,
    userId: actorUserId,
  });
  actorRole = membership.role;
  const credentials = await readCredentials({
    supabase,
    archiveId: normalizedIndexId,
    archive,
  });

  return {
    supabase,
    archive,
    credentials,
    actorUserId,
    actorRole,
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

const buildGitHubWorkflowUrl = ({
  owner,
  repo,
  workflowFile,
}: {
  owner: string;
  repo: string;
  workflowFile: string;
}) => `https://github.com/${owner}/${repo}/actions/workflows/${workflowFile}`;

const githubErrorMessage = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  return toTrimmedString(payload.message) || fallback;
};

const readGitHubRepoSecretPublicKey = async ({
  githubToken,
  owner,
  repo,
}: {
  githubToken: string;
  owner: string;
  repo: string;
}) => {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/public-key`,
    {
      headers: githubHeaders(githubToken),
    },
  );
  const payload = (await response.json().catch(
    () => ({}),
  )) as GitHubActionsSecretPublicKeyPayload & { message?: string };
  if (!response.ok) {
    throw new Error(
      toTrimmedString(payload.message) ||
        "Failed to read the GitHub repo secret public key.",
    );
  }

  const key = toTrimmedString(payload.key);
  const keyId = toTrimmedString(payload.key_id);
  if (!key || !keyId) {
    throw new Error("GitHub repo secret public key payload is incomplete.");
  }

  return {
    key,
    keyId,
  };
};

const encryptGitHubRepoSecretValue = async ({
  value,
  publicKey,
}: {
  value: string;
  publicKey: string;
}) => {
  await sodium.ready;
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error("GitHub repo secret value is required.");
  }

  const publicKeyBytes = sodium.from_base64(
    publicKey,
    sodium.base64_variants.ORIGINAL,
  );
  const messageBytes = sodium.from_string(normalizedValue);
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, publicKeyBytes);
  return sodium.to_base64(
    encryptedBytes,
    sodium.base64_variants.ORIGINAL,
  );
};

const upsertGitHubRepoSecret = async ({
  githubToken,
  owner,
  repo,
  secretName,
  secretValue,
}: {
  githubToken: string;
  owner: string;
  repo: string;
  secretName: string;
  secretValue: string;
}) => {
  const { key, keyId } = await readGitHubRepoSecretPublicKey({
    githubToken,
    owner,
    repo,
  });
  const encryptedValue = await encryptGitHubRepoSecretValue({
    value: secretValue,
    publicKey: key,
  });

  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/${
      encodeURIComponent(secretName)
    }`,
    {
      method: "PUT",
      headers: githubHeaders(githubToken),
      body: JSON.stringify({
        encrypted_value: encryptedValue,
        key_id: keyId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await githubErrorMessage(
        response,
        `Failed to configure GitHub repo secret ${secretName}.`,
      ),
    );
  }
};

const readGitHubRepoSecretNames = async ({
  githubToken,
  owner,
  repo,
}: {
  githubToken: string;
  owner: string;
  repo: string;
}) => {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets?per_page=100`,
    {
      headers: githubHeaders(githubToken),
    },
  );
  if (response.status === 404) {
    return null;
  }
  const payload = (await response.json().catch(
    () => ({}),
  )) as GitHubActionsSecretsListPayload;
  if (!response.ok) {
    throw new Error(
      toTrimmedString((payload as Record<string, unknown>).message) ||
        "Failed to read GitHub repo secrets.",
    );
  }

  const names = new Set<string>();
  const secrets = Array.isArray(payload.secrets) ? payload.secrets : [];
  for (const entry of secrets) {
    const secret = asRecord(entry) as GitHubActionsSecretPayload | null;
    const name = toTrimmedString(secret?.name);
    if (name) {
      names.add(name);
    }
  }

  return names;
};

const readLatestGitHubWorkflowRun = async ({
  githubToken,
  owner,
  repo,
  workflowFile,
}: {
  githubToken: string;
  owner: string;
  repo: string;
  workflowFile: string;
}) => {
  const workflowRunsUrl = new URL(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${
      encodeURIComponent(workflowFile)
    }/runs`,
  );
  workflowRunsUrl.searchParams.set("branch", INDEX_FUNCTIONS_WORKFLOW_BRANCH);
  workflowRunsUrl.searchParams.set("per_page", "10");

  const response = await fetch(workflowRunsUrl.toString(), {
    headers: githubHeaders(githubToken),
  });
  if (response.status === 404) {
    return null;
  }
  const payload = (await response.json().catch(
    () => ({}),
  )) as GitHubActionsWorkflowRunsPayload;
  if (!response.ok) {
    throw new Error(
      toTrimmedString((payload as Record<string, unknown>).message) ||
        "Failed to read GitHub Actions workflow runs.",
    );
  }

  const runs = Array.isArray(payload.workflow_runs)
    ? payload.workflow_runs
    : [];
  const latest = runs.find((entry) => Boolean(asRecord(entry))) ?? null;
  if (!latest) {
    return null;
  }

  const record = asRecord(latest) as GitHubActionsWorkflowRun | null;
  if (!record) {
    return null;
  }

  return {
    id: toTrimmedString(record.id) || null,
    htmlUrl: toTrimmedString(record.html_url) || null,
    status: toTrimmedString(record.status).toLowerCase() || null,
    conclusion: toTrimmedString(record.conclusion).toLowerCase() || null,
    path: toTrimmedString(record.path).toLowerCase() || null,
    startedAt: toTrimmedString(record.run_started_at) || null,
    updatedAt: toTrimmedString(record.updated_at || record.created_at) || null,
  };
};

const readGitHubWorkflowRunJobs = async ({
  githubToken,
  owner,
  repo,
  runId,
}: {
  githubToken: string;
  owner: string;
  repo: string;
  runId: string;
}) => {
  const jobsUrl = new URL(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${
      encodeURIComponent(runId)
    }/jobs`,
  );
  jobsUrl.searchParams.set("per_page", "100");

  const response = await fetch(jobsUrl.toString(), {
    headers: githubHeaders(githubToken),
  });
  if (response.status === 404) {
    return [];
  }

  const payload = (await response.json().catch(
    () => ({}),
  )) as GitHubActionsWorkflowRunJobsPayload;
  if (!response.ok) {
    throw new Error(
      toTrimmedString((payload as Record<string, unknown>).message) ||
        "Failed to read GitHub Actions workflow jobs.",
    );
  }

  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  return jobs
    .map((entry) => asRecord(entry) as GitHubActionsWorkflowRunJob | null)
    .filter((entry): entry is GitHubActionsWorkflowRunJob => Boolean(entry))
    .map((entry) => ({
      name: toTrimmedString(entry.name) || "Unnamed job",
      status: toTrimmedString(entry.status).toLowerCase() || null,
      conclusion: toTrimmedString(entry.conclusion).toLowerCase() || null,
      steps: Array.isArray(entry.steps)
        ? entry.steps
          .map((step) => asRecord(step) as GitHubActionsWorkflowRunStep | null)
          .filter((step): step is GitHubActionsWorkflowRunStep => Boolean(step))
          .map((step) => ({
            name: toTrimmedString(step.name) || "Unnamed step",
            status: toTrimmedString(step.status).toLowerCase() || null,
            conclusion: toTrimmedString(step.conclusion).toLowerCase() || null,
          }))
        : [],
    }));
};

const dispatchGitHubWorkflowRun = async ({
  githubToken,
  owner,
  repo,
  workflowFile,
  ref,
}: {
  githubToken: string;
  owner: string;
  repo: string;
  workflowFile: string;
  ref: string;
}) => {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${
      encodeURIComponent(workflowFile)
    }/dispatches`,
    {
      method: "POST",
      headers: githubHeaders(githubToken),
      body: JSON.stringify({
        ref,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await githubErrorMessage(
        response,
        `Failed to dispatch ${workflowFile}.`,
      ),
    );
  }
};

const buildRepoSecretRequirements = (
  configuredSecretNames: Set<string> | null,
  projectRef: string,
): IndexRepoSecretRequirement[] => [
  {
    name: "SUPABASE_ACCESS_TOKEN",
    isConfigured: configuredSecretNames?.has("SUPABASE_ACCESS_TOKEN") ?? false,
    value: null,
    description:
      "Add a Supabase account personal access token from Dashboard -> Account -> Access Tokens. Do not use a project API key like sb_secret_... here. The CLI token still starts with sbp_ and lets the child repo's GitHub Actions deploy workflow run supabase functions deploy.",
  },
  {
    name: "SUPABASE_PROJECT_REF_PROD",
    isConfigured: configuredSecretNames?.has("SUPABASE_PROJECT_REF_PROD") ??
      false,
    value: projectRef,
    description:
      "Set this to the child Supabase project ref so the deploy workflow targets the right project.",
  },
  {
    name: "ADMIN_PASSWORD",
    isConfigured: configuredSecretNames?.has("ADMIN_PASSWORD") ?? false,
    value: null,
    description:
      "Used to unlock the child /admin after the standalone index is fully self-hosted. This is deployed into the child project's ADMIN_PASSWORD secret.",
  },
];

const buildFunctionsDeployStatusMessage = ({
  status,
  missingSecretNames,
  latestRunConclusion,
}: {
  status: IndexFunctionsDeploymentStatus;
  missingSecretNames: string[];
  latestRunConclusion: string | null;
}) => {
  switch (status) {
    case "not_ready":
      return "Finalize the repo before checking the child deploy workflow.";
    case "needs_secrets":
      return `Add the missing GitHub repo secrets (${
        missingSecretNames.join(", ")
      }) and then rerun the child deploy workflow.`;
    case "ready_to_run":
      return "The required GitHub repo secrets are configured. Run the child deploy workflow to publish the copied app and Edge Functions.";
    case "running":
      return "The child deploy workflow is running. This page updates automatically while GitHub Actions works through the deploy steps.";
    case "failed":
      return latestRunConclusion
        ? `The child deploy workflow last finished with ${latestRunConclusion}. Open the run details, fix the issue, and rerun it. If GitHub Actions says the access token format is invalid, use a Supabase account personal access token (sbp_...) for SUPABASE_ACCESS_TOKEN, not a project API key like sb_secret_....`
        : "The child deploy workflow failed. Open the run details, fix the issue, and rerun it. If GitHub Actions says the access token format is invalid, use a Supabase account personal access token (sbp_...) for SUPABASE_ACCESS_TOKEN, not a project API key like sb_secret_....";
    case "deployed":
      return "The child deploy workflow completed successfully.";
    default:
      return "Could not verify the child deploy workflow state from GitHub Actions.";
  }
};

const buildStandaloneAdminBaseUrl = (siteUrl: string) => {
  const normalizedSiteUrl = toTrimmedString(siteUrl);
  if (!normalizedSiteUrl) {
    return "";
  }

  try {
    const base = normalizedSiteUrl.endsWith("/")
      ? normalizedSiteUrl
      : `${normalizedSiteUrl}/`;
    return new URL("admin/", base).toString();
  } catch {
    return "";
  }
};

const buildIndexAuthSetupMessage = ({
  verificationError,
  githubProviderEnabled,
  githubClientIdConfigured,
  siteUrlMatches,
  uriAllowListMatches,
  localAuthReady,
}: {
  verificationError: string | null;
  githubProviderEnabled: boolean;
  githubClientIdConfigured: boolean;
  siteUrlMatches: boolean;
  uriAllowListMatches: boolean;
  localAuthReady: boolean;
}) => {
  if (verificationError) {
    return verificationError;
  }
  if (localAuthReady) {
    return "GitHub sign-in is configured for this child project.";
  }
  if (!githubProviderEnabled) {
    return "GitHub sign-in is not enabled for this child project yet.";
  }
  if (!githubClientIdConfigured) {
    return "GitHub sign-in is enabled, but the GitHub client id is still missing.";
  }
  if (!siteUrlMatches || !uriAllowListMatches) {
    return "The child project's auth URLs still need to match the standalone index URL.";
  }
  return "Complete the GitHub sign-in setup for this child project.";
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
    connectionUuid?: string;
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
          "@id": `urn:uuid:${entry.connectionUuid || entry.connectedSiteId}`,
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
    .select("index_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }

  const indexIds = (data ?? [])
    .map((row) => toTrimmedString(row.index_id))
    .filter(Boolean);
  if (!indexIds.length) return [];

  const { data: indexes, error: indexesError } = await supabase
    .from("indexes")
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
    .in("id", indexIds)
    .eq("type", "index")
    .order("updated_at", { ascending: false });
  if (indexesError) {
    throw new Error(indexesError.message);
  }

  const roleByIndexId = new Map(
    (data ?? []).map((
      row,
    ) => [toTrimmedString(row.index_id), toTrimmedString(row.role)]),
  );

  return ((indexes ?? []) as unknown as IndexArchiveRow[]).map((indexRow) => ({
    id: indexRow.id,
    slug: indexRow.slug ?? "",
    title: indexRow.title ?? "Untitled index",
    description: indexRow.description ?? "",
    imageUrl: indexRow.image_url ?? "",
    canonicalUrl: indexRow.canonical_url ?? "",
    repoFullName: indexRow.repo_full_name ?? null,
    repoUrl: indexRow.repo_url ?? null,
    supabaseProjectRef: indexRow.supabase_project_ref ?? null,
    supabaseDashboardUrl: indexRow.supabase_dashboard_url ?? null,
    indexLevel: indexRow.index_level ?? null,
    parentIndexId: indexRow.parent_index_id ?? null,
    parentIndexUrl: indexRow.parent_index_url ?? null,
    parentIndexLevel: indexRow.parent_index_level ?? null,
    accessRole:
      (roleByIndexId.get(indexRow.id) as IndexAdminRole | undefined) ??
        "owner",
  }));
};

const listCollaborators = async (
  context: IndexAdminContext,
): Promise<IndexCollaboratorRecord[]> => {
  const { data, error } = await context.supabase
    .from("index_admin_memberships")
    .select("index_id, user_id, role")
    .eq("index_id", context.archive.id)
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

const compareIndexConnections = (
  left: IndexConnectionRecord,
  right: IndexConnectionRecord,
) => {
  if (left.status === "pending" && right.status !== "pending") return -1;
  if (left.status !== "pending" && right.status === "pending") return 1;

  const leftAt = Date.parse(left.respondedAt ?? left.createdAt ?? "");
  const rightAt = Date.parse(right.respondedAt ?? right.createdAt ?? "");
  if (
    Number.isFinite(leftAt) && Number.isFinite(rightAt) && leftAt !== rightAt
  ) {
    return rightAt - leftAt;
  }
  if (Number.isFinite(leftAt) && !Number.isFinite(rightAt)) return -1;
  if (!Number.isFinite(leftAt) && Number.isFinite(rightAt)) return 1;
  return left.sourceSiteTitle.localeCompare(right.sourceSiteTitle);
};

const buildStandaloneIndexConnectionEntries = (
  connections: IndexConnectionRecord[],
) =>
  connections
    .filter((entry) => entry.status === "approved" && entry.sourceSiteUrl)
    .map((entry) => ({
      connectionUuid: entry.connectionUuid,
      connectedSiteId: entry.sourceSiteId,
      connectedSiteUrl: entry.sourceSiteUrl,
      connectedSiteType: "site" as const,
    }));

const buildStandaloneParentIndexConnectionEntry = ({
  indexId,
  parentIndexId,
  parentIndexUrl,
}: {
  indexId: string;
  parentIndexId: string | null;
  parentIndexUrl: string | null;
}) => {
  const normalizedParentIndexId = toTrimmedString(parentIndexId);
  const normalizedParentIndexUrl = toTrimmedString(parentIndexUrl);
  if (!normalizedParentIndexId || !normalizedParentIndexUrl) {
    return [];
  }

  const connectionUuid = buildIndexParentConnectionUuid({
    sourceIndexId: indexId,
    targetIndexId: normalizedParentIndexId,
  });
  if (!connectionUuid) {
    return [];
  }

  return [
    {
      connectionUuid,
      connectedSiteId: normalizedParentIndexId,
      connectedSiteUrl: normalizedParentIndexUrl,
      connectedSiteType: "index" as const,
    },
  ];
};

const readIndexConnectionRecords = async ({
  context,
  child,
}: {
  context: IndexAdminContext;
  child: ReturnType<typeof createChildProjectClient>;
}): Promise<IndexConnectionRecord[]> => {
  const { data: connectionRows, error: connectionsError } = await child
    .from("connections")
    .select(
      [
        "id",
        "connection_uuid",
        "source_site_id",
        "status",
        "created_at",
        "responded_at",
      ].join(", "),
    )
    .eq("target_index_id", context.archive.id)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false });
  if (connectionsError) {
    throw new Error(connectionsError.message);
  }

  const rawConnections =
    (connectionRows ?? []) as unknown as ChildConnectionRow[];
  if (!rawConnections.length) {
    return [];
  }

  const siteIds = Array.from(
    new Set(
      rawConnections.map((row) => toTrimmedString(row.source_site_id)).filter(
        Boolean,
      ),
    ),
  );
  const [
    { data: childSites, error: childSitesError },
    { data: ownerDraftRows, error: ownerDraftsError },
  ] = await Promise.all([
    child
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
      .in("id", siteIds),
    child
      .from("site_drafts")
      .select("site_id, owner_user_id, repo_full_name")
      .eq("draft_type", "owner")
      .in("site_id", siteIds),
  ]);
  if (childSitesError) {
    throw new Error(childSitesError.message);
  }
  if (ownerDraftsError) {
    throw new Error(ownerDraftsError.message);
  }

  const connectedSites = (childSites ?? []) as unknown as ChildSiteRow[];
  const ownerDrafts = (ownerDraftRows ?? []) as unknown as ChildOwnerDraftRow[];
  const connectedSiteById = new Map(
    connectedSites.map((entry) => [entry.id, entry] as const),
  );
  const ownerDraftBySiteId = new Map(
    ownerDrafts.map((entry) =>
      [toTrimmedString(entry.site_id), entry] as const
    ),
  );
  const ownerUserIds = Array.from(
    new Set(
      ownerDrafts.map((entry) => toTrimmedString(entry.owner_user_id)).filter(
        Boolean,
      ),
    ),
  );
  const ownerSummaryEntries = await Promise.all(
    ownerUserIds.map(async (userId) =>
      [userId, await readAuthUserSummaryById(child, userId)] as const
    ),
  );
  const ownerSummaryByUserId = new Map(ownerSummaryEntries);

  return rawConnections.map((row) => {
    const sourceSiteId = toTrimmedString(row.source_site_id);
    const childSite = connectedSiteById.get(sourceSiteId);
    const ownerDraft = ownerDraftBySiteId.get(sourceSiteId);
    const ownerSummary = ownerDraft
      ? ownerSummaryByUserId.get(toTrimmedString(ownerDraft.owner_user_id))
      : null;
    const fallbackRepoName = normalizeRepoFullName(ownerDraft?.repo_full_name);
    const fallbackTitle = fallbackRepoName
      ? fallbackRepoName.split("/")[1] ?? sourceSiteId
      : sourceSiteId;

    return {
      requestId: toTrimmedString(row.id),
      connectionUuid: toTrimmedString(row.connection_uuid),
      status: row.status === "approved" ? "approved" : "pending",
      createdAt: row.created_at,
      respondedAt: row.responded_at,
      sourceSiteId,
      sourceSiteTitle: childSite?.title ?? fallbackTitle,
      sourceSiteUrl: childSite?.canonical_url ?? "",
      sourceSiteImageUrl: childSite?.image_url ?? "",
      sourceOwnerDisplayName: ownerSummary?.displayName ||
        ownerSummary?.email || "Unknown",
    } satisfies IndexConnectionRecord;
  }).sort(compareIndexConnections);
};

export const readIndexAdminState = async (context: IndexAdminContext) => {
  const child = createChildProjectClient(context.credentials);
  const rootPasswordAdmin = isRootPasswordAdminContext(context);
  const { data: archiveData, error: archiveError } = await child
    .from("indexes")
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
    throw new Error("The child index is missing its index metadata row.");
  }

  const connections = await readIndexConnectionRecords({ context, child });

  const collaborators = rootPasswordAdmin
    ? []
    : await listCollaborators(context);
  const bridgeToken = createIndexAdminBridgeToken({
    indexId: context.archive.id,
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
      canEditGeneral: rootPasswordAdmin
        ? false
        : roleRank[context.actorRole] >= roleRank.editor,
      canManageConnections: roleRank[context.actorRole] >= roleRank.admin,
      canManageCollaborators: rootPasswordAdmin
        ? false
        : roleRank[context.actorRole] >= roleRank.admin,
      canManageAdvanced: rootPasswordAdmin
        ? false
        : context.actorRole === "owner",
    },
    index: {
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
        `${getSolidaryAppUrl()}/admin?indexId=${context.archive.id}`,
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
    .from("indexes")
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

const resolveOwnerGitHubActionsToken = async (context: IndexAdminContext) => {
  const ownerUserId = toTrimmedString(context.archive.owner_user_id);
  if (!ownerUserId) {
    throw new Error("Index owner GitHub identity is not available.");
  }

  const resolved = await resolveGitHubTokenForUserByMode({
    supabase: context.supabase,
    userId: ownerUserId,
    authMode: "solidary",
  });
  const token = toTrimmedString(resolved?.token);
  if (!token) {
    throw new Error(
      "Sign in with GitHub from Profile before configuring the child deploy workflow.",
    );
  }

  return token;
};

const resolveSupabaseManagementAuthConfigAccessToken = async (
  context: IndexAdminContext,
) => {
  let resolvedAccess: { accessToken: string; scope: string };
  try {
    resolvedAccess = await resolveSupabaseManagementAccessForUser({
      supabase: context.supabase,
      userId: context.actorUserId,
    });
  } catch (error) {
    if (error instanceof SupabaseManagementReauthError) {
      throw new Error(
        "Reconnect your Supabase account from Profile before updating standalone auth URLs.",
      );
    }
    throw error;
  }

  const grantedScopes = splitSupabaseManagementScopes(resolvedAccess.scope);
  if (
    grantedScopes.length &&
    !INDEX_AUTH_CONFIG_REQUIRED_SCOPES.every((scope) =>
      grantedScopes.includes(scope)
    )
  ) {
    throw new Error(
      "Reconnect your Supabase account with Auth write access before updating standalone auth URLs.",
    );
  }

  return resolvedAccess.accessToken;
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
  if (isRootPasswordAdminContext(context)) {
    throw new Error(
      "Root /admin currently supports connection management only.",
    );
  }
  assertIndexAdminRole(context.actorRole, "editor");

  const currentState = await readIndexAdminState(context);
  let nextImageUrl = currentState.index.imageUrl || "";

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
      siteUrl: currentState.index.canonicalUrl,
      assetPath: DEFAULT_INDEX_IMAGE_PATH,
    });
  }

  const manifest = buildSolidaryManifest({
    rootId: currentState.index.id,
    siteUrl: currentState.index.canonicalUrl,
    title,
    description,
    imageUrl: nextImageUrl,
    indexLevel: currentState.index.indexLevel ?? 1,
    parentIndexId: currentState.index.parentIndexId ?? "",
    parentIndexUrl: currentState.index.parentIndexUrl ?? "",
    parentIndexLevel: currentState.index.parentIndexLevel ?? 0,
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
    siteUrl: currentState.index.canonicalUrl,
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
  if (isRootPasswordAdminContext(context)) {
    throw new Error("Root /admin does not manage collaborators.");
  }
  assertIndexAdminRole(context.actorRole, "admin");
  const { data, error } = await context.supabase.rpc(
    "index_search_collaborator_candidates",
    {
      p_index_id: context.archive.id,
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
  if (isRootPasswordAdminContext(context)) {
    throw new Error("Root /admin does not manage collaborators.");
  }
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
      index_id: context.archive.id,
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
  if (isRootPasswordAdminContext(context)) {
    throw new Error("Root /admin does not manage collaborators.");
  }
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
    .eq("index_id", context.archive.id)
    .eq("user_id", targetUserId);
  if (error) {
    throw new Error(error.message);
  }
};

const syncStandaloneIndexConnectionsMetadata = async ({
  context,
  message,
}: {
  context: IndexAdminContext;
  message: string;
}) => {
  if (isRootPasswordAdminContext(context)) {
    return;
  }

  const updatedState = await readIndexAdminState(context);
  const linksManifest = buildSolidaryLinksManifest({
    rootId: updatedState.index.id,
    siteUrl: updatedState.index.canonicalUrl,
    connections: [
      ...buildStandaloneParentIndexConnectionEntry({
        indexId: updatedState.index.id,
        parentIndexId: updatedState.index.parentIndexId,
        parentIndexUrl: updatedState.index.parentIndexUrl,
      }),
      ...buildStandaloneIndexConnectionEntries(updatedState.connections),
    ],
  });
  const githubToken = await resolveOwnerGitHubToken(context);
  await writeRepoFile({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    path: "site/.well-known/solidary-links.json",
    contentB64: Buffer.from(linksManifest, "utf8").toString("base64"),
    message,
  });
};

export const updateIndexConnectionRequest = async ({
  context,
  requestId,
  action,
}: {
  context: IndexAdminContext;
  requestId: string;
  action: "approve" | "reject" | "disconnect";
}) => {
  assertIndexAdminRole(context.actorRole, "admin");
  const normalizedRequestId = requestId.trim();
  if (!normalizedRequestId) {
    throw new Error("Missing request id.");
  }

  const child = createChildProjectClient(context.credentials);
  const manifestActorUserId =
    isRootPasswordAdminContext(context) && context.archive.owner_user_id
      ? context.archive.owner_user_id
      : context.actorUserId;
  const { data: requestRowData, error: requestRowError } = await child
    .from("connections")
    .select(
      "id, connection_uuid, source_site_id, status, created_at, responded_at, target_index_id",
    )
    .eq("id", normalizedRequestId)
    .eq("target_index_id", context.archive.id)
    .maybeSingle();
  if (requestRowError) {
    throw new Error(requestRowError.message);
  }
  const requestRow = requestRowData as {
    id: string;
    connection_uuid: string;
    source_site_id: string;
    status: string | null;
    created_at: string | null;
    responded_at: string | null;
    target_index_id: string;
  } | null;
  if (!requestRow) {
    throw new Error("Connection request not found.");
  }

  const normalizedSourceSiteId = toTrimmedString(requestRow.source_site_id);
  if (!normalizedSourceSiteId) {
    throw new Error("Connection request is missing a source site.");
  }

  if (action === "approve") {
    if (requestRow.status !== "pending") {
      return;
    }

    const { data: duplicateApproved, error: duplicateApprovedError } =
      await child
        .from("connections")
        .select("id")
        .eq("source_site_id", normalizedSourceSiteId)
        .eq("target_index_id", context.archive.id)
        .eq("status", "approved")
        .neq("id", normalizedRequestId)
        .limit(1);
    if (duplicateApprovedError) {
      throw new Error(duplicateApprovedError.message);
    }
    if ((duplicateApproved ?? []).length > 0) {
      throw new Error("This site is already connected to the index.");
    }

    const { error: approveError } = await child
      .from("connections")
      .update({
        status: "approved",
        responded_at: new Date().toISOString(),
        responded_by_user_id: context.actorUserId,
      })
      .eq("id", normalizedRequestId);
    if (approveError) {
      throw new Error(approveError.message);
    }

    const { error: trackError } = await child.from("index_sites").upsert({
      index_id: context.archive.id,
      site_id: normalizedSourceSiteId,
      status: "tracked",
      delist_reason_code: null,
      delist_note: null,
    });
    if (trackError) {
      throw new Error(trackError.message);
    }

    if (manifestActorUserId) {
      const { error: syncSourceError } = await child.rpc(
        "connection_sync_site_links_internal",
        {
          p_site_id: normalizedSourceSiteId,
          p_actor_user_id: manifestActorUserId,
        },
      );
      if (syncSourceError) {
        throw new Error(syncSourceError.message);
      }
    }

    await syncStandaloneIndexConnectionsMetadata({
      context,
      message: "Update standalone index connections metadata",
    });
    return;
  }

  if (action === "reject") {
    if (requestRow.status !== "pending") {
      return;
    }

    const { error: rejectError } = await child
      .from("connections")
      .update({
        status: "rejected",
        responded_at: new Date().toISOString(),
        responded_by_user_id: context.actorUserId,
      })
      .eq("id", normalizedRequestId);
    if (rejectError) {
      throw new Error(rejectError.message);
    }
    return;
  }

  if (requestRow.status !== "pending" && requestRow.status !== "approved") {
    return;
  }

  const { error: disconnectError } = await child
    .from("connections")
    .update({
      status: "cancelled",
      responded_at: new Date().toISOString(),
      responded_by_user_id: context.actorUserId,
    })
    .eq("id", normalizedRequestId);
  if (disconnectError) {
    throw new Error(disconnectError.message);
  }

  if (requestRow.status === "approved") {
    const { data: sourceSiteData, error: sourceSiteError } = await child
      .from("sites")
      .select("parent_index_id")
      .eq("id", normalizedSourceSiteId)
      .maybeSingle();
    if (sourceSiteError) {
      throw new Error(sourceSiteError.message);
    }

    const sourceSiteParentIndexId = toTrimmedString(
      (sourceSiteData as { parent_index_id?: string | null } | null)
        ?.parent_index_id,
    );
    if (sourceSiteParentIndexId === context.archive.id) {
      const { error: preserveMembershipError } = await child.from(
        "index_sites",
      ).upsert({
        index_id: context.archive.id,
        site_id: normalizedSourceSiteId,
        status: "tracked",
        delist_reason_code: null,
        delist_note: null,
      });
      if (preserveMembershipError) {
        throw new Error(preserveMembershipError.message);
      }
    } else {
      const { error: delistError } = await child
        .from("index_sites")
        .update({
          status: "delisted",
          delist_reason_code: "connection_removed",
          delist_note: null,
        })
        .eq("index_id", context.archive.id)
        .eq("site_id", normalizedSourceSiteId);
      if (delistError) {
        throw new Error(delistError.message);
      }
    }

    if (manifestActorUserId) {
      const { error: syncSourceError } = await child.rpc(
        "connection_sync_site_links_internal",
        {
          p_site_id: normalizedSourceSiteId,
          p_actor_user_id: manifestActorUserId,
        },
      );
      if (syncSourceError) {
        throw new Error(syncSourceError.message);
      }
    }

    await syncStandaloneIndexConnectionsMetadata({
      context,
      message: "Update standalone index connections metadata",
    });
  }
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
  if (isRootPasswordAdminContext(context)) {
    throw new Error("Root /admin does not manage standalone domain settings.");
  }
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
  const managementAccessToken =
    await resolveSupabaseManagementAuthConfigAccessToken(context);
  await updateSupabaseProjectAuthConfig({
    accessToken: managementAccessToken,
    projectRef: context.credentials.supabase_project_ref,
    siteUrl: nextSiteUrl,
  });
  const currentState = await readIndexAdminState(context);
  const imageUrl = currentState.index.imageUrl
    ? buildAbsoluteAssetUrl({
      siteUrl: nextSiteUrl,
      assetPath: DEFAULT_INDEX_IMAGE_PATH,
    })
    : "";

  const manifest = buildSolidaryManifest({
    rootId: currentState.index.id,
    siteUrl: nextSiteUrl,
    title: currentState.index.title,
    description: currentState.index.description,
    imageUrl,
    indexLevel: currentState.index.indexLevel ?? 1,
    parentIndexId: currentState.index.parentIndexId ?? "",
    parentIndexUrl: currentState.index.parentIndexUrl ?? "",
    parentIndexLevel: currentState.index.parentIndexLevel ?? 0,
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
    rootId: currentState.index.id,
    siteUrl: nextSiteUrl,
    connections: [
      ...buildStandaloneParentIndexConnectionEntry({
        indexId: currentState.index.id,
        parentIndexId: currentState.index.parentIndexId,
        parentIndexUrl: currentState.index.parentIndexUrl,
      }),
      ...buildStandaloneIndexConnectionEntries(currentState.connections),
    ],
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
    title: currentState.index.title,
    description: currentState.index.description,
    imageUrl,
    siteUrl: nextSiteUrl,
  });

  return nextSiteUrl;
};

export const configureIndexStandaloneAuth = async ({
  context,
  githubClientId,
  githubClientSecret,
  supabasePersonalAccessToken,
}: {
  context: IndexAdminContext;
  githubClientId: string;
  githubClientSecret: string;
  supabasePersonalAccessToken?: string;
}) => {
  if (isRootPasswordAdminContext(context)) {
    throw new Error("Root /admin does not manage child standalone auth.");
  }
  assertIndexAdminRole(context.actorRole, "owner");
  const normalizedGithubClientId = toTrimmedString(githubClientId);
  const normalizedGithubClientSecret = toTrimmedString(githubClientSecret);
  const normalizedSupabasePersonalAccessToken = toTrimmedString(
    supabasePersonalAccessToken,
  );
  if (!normalizedGithubClientId || !normalizedGithubClientSecret) {
    throw new Error("GitHub client id and client secret are required.");
  }

  const currentState = await readIndexAdminState(context);
  const siteUrl = currentState.index.canonicalUrl ||
    resolveRepoDefaultSiteUrl(
      context.credentials.repo_owner,
      context.credentials.repo_name,
    );
  const managementAccessToken = normalizedSupabasePersonalAccessToken ||
    await resolveSupabaseManagementAuthConfigAccessToken(context);

  try {
    await updateSupabaseProjectGitHubAuthConfig({
      accessToken: managementAccessToken,
      projectRef: context.credentials.supabase_project_ref,
      siteUrl,
      githubClientId: normalizedGithubClientId,
      githubClientSecret: normalizedGithubClientSecret,
    });
    await updateSupabaseProjectFunctionSecrets({
      accessToken: managementAccessToken,
      projectRef: context.credentials.supabase_project_ref,
      secrets: [
        {
          name: "GITHUB_OAUTH_CLIENT_ID",
          value: normalizedGithubClientId,
        },
        {
          name: "GITHUB_OAUTH_CLIENT_SECRET",
          value: normalizedGithubClientSecret,
        },
      ],
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /forbidden resource/i.test(error.message)
    ) {
      throw new Error(
        normalizedSupabasePersonalAccessToken
          ? "Supabase rejected this Personal Access Token for the child project's Auth settings. Generate a new token from Dashboard -> Account -> Access Tokens and confirm you have Owner or Admin access to the selected organization."
          : "Supabase blocked the automatic Auth update for this project. Paste a Supabase Personal Access Token from Dashboard -> Account -> Access Tokens and try again.",
      );
    }
    throw error;
  }
};

const isGitHubWorkflowRunActive = (status: string | null) =>
  status === "queued" ||
  status === "in_progress" ||
  status === "waiting" ||
  status === "requested" ||
  status === "pending";

export const deployIndexChildFunctions = async ({
  context,
  supabasePersonalAccessToken,
  adminPassword,
  dispatchWorkflow = true,
}: {
  context: IndexAdminContext;
  supabasePersonalAccessToken: string;
  adminPassword?: string;
  dispatchWorkflow?: boolean;
}) => {
  if (isRootPasswordAdminContext(context)) {
    throw new Error("Root /admin does not run the child deploy workflow.");
  }
  assertIndexAdminRole(context.actorRole, "owner");
  const normalizedSupabasePersonalAccessToken = toTrimmedString(
    supabasePersonalAccessToken,
  );
  const normalizedAdminPassword = toTrimmedString(adminPassword);
  if (dispatchWorkflow && context.archive.runtime_mode !== "finalized") {
    throw new Error("Finalize the index before running the child deploy workflow.");
  }

  const githubToken = await resolveOwnerGitHubActionsToken(context);
  const configuredSecretNames = await readGitHubRepoSecretNames({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
  });
  const missingSecretNames = buildRepoSecretRequirements(
    configuredSecretNames,
    context.credentials.supabase_project_ref,
  )
    .filter((entry) => !entry.isConfigured)
    .map((entry) => entry.name);

  if (normalizedSupabasePersonalAccessToken) {
    await Promise.all([
      upsertGitHubRepoSecret({
        githubToken,
        owner: context.credentials.repo_owner,
        repo: context.credentials.repo_name,
        secretName: "SUPABASE_ACCESS_TOKEN",
        secretValue: normalizedSupabasePersonalAccessToken,
      }),
      upsertGitHubRepoSecret({
        githubToken,
        owner: context.credentials.repo_owner,
        repo: context.credentials.repo_name,
        secretName: "SUPABASE_PROJECT_REF_PROD",
        secretValue: context.credentials.supabase_project_ref,
      }),
      ...(normalizedAdminPassword
        ? [
          upsertGitHubRepoSecret({
            githubToken,
            owner: context.credentials.repo_owner,
            repo: context.credentials.repo_name,
            secretName: "ADMIN_PASSWORD",
            secretValue: normalizedAdminPassword,
          }),
        ]
        : []),
    ]);
  } else if (missingSecretNames.length) {
    throw new Error(
      missingSecretNames.includes("ADMIN_PASSWORD")
        ? "Admin password is required to configure the child repo deployment secrets."
        : "Supabase personal access token is required to configure the child repo deployment secrets.",
    );
  } else if (normalizedAdminPassword) {
    await upsertGitHubRepoSecret({
      githubToken,
      owner: context.credentials.repo_owner,
      repo: context.credentials.repo_name,
      secretName: "ADMIN_PASSWORD",
      secretValue: normalizedAdminPassword,
    });
  }

  if (!dispatchWorkflow) {
    return;
  }

  const latestRun = await readLatestGitHubWorkflowRun({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    workflowFile: INDEX_LIVE_DEPLOY_WORKFLOW_FILE,
  });
  if (isGitHubWorkflowRunActive(latestRun?.status ?? null)) {
    throw new Error("The child deploy workflow is already running.");
  }

  await dispatchGitHubWorkflowRun({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    workflowFile: INDEX_LIVE_DEPLOY_WORKFLOW_FILE,
    ref: INDEX_FUNCTIONS_WORKFLOW_BRANCH,
  });
};

const buildAuthSetup = async ({
  context,
  state,
  managementAccessTokenOverride,
}: {
  context: IndexAdminContext;
  state: Awaited<ReturnType<typeof readIndexAdminState>>;
  managementAccessTokenOverride?: string | null;
}): Promise<IndexAuthSetup> => {
  const siteUrl = state.index.canonicalUrl ||
    resolveRepoDefaultSiteUrl(
      context.credentials.repo_owner,
      context.credentials.repo_name,
    );
  const callbackUrl = state.index.authCallbackUrl ||
    `${context.credentials.supabase_project_url}/auth/v1/callback`;
  const expectedUriAllowList = buildSupabaseManagementUriAllowList(siteUrl);
  const githubOauthAppName = state.index.title
    ? `Solidary ${state.index.title}`
    : `Solidary ${state.index.slug || "Index"}`;

  let authConfig:
    | Awaited<ReturnType<typeof readSupabaseProjectAuthConfig>>
    | null = null;
  let verificationError: string | null = null;

  try {
    const managementAccessToken =
      toTrimmedString(managementAccessTokenOverride) ||
      await resolveSupabaseManagementAuthConfigAccessToken(context);
    authConfig = await readSupabaseProjectAuthConfig({
      accessToken: managementAccessToken,
      projectRef: context.credentials.supabase_project_ref,
    });
  } catch (error) {
    verificationError = error instanceof Error
      ? error.message
      : "Could not verify child auth configuration.";
  }

  const actualSiteUrl = normalizeComparableUrl(authConfig?.siteUrl ?? "");
  const expectedSiteUrl = normalizeComparableUrl(siteUrl);
  const configuredUriAllowList = new Set(
    (authConfig?.uriAllowList ?? []).map(normalizeComparableUrl),
  );
  const siteUrlMatches = Boolean(authConfig?.siteUrl) &&
    actualSiteUrl === expectedSiteUrl;
  const uriAllowListMatches = expectedUriAllowList.every((entry) =>
    configuredUriAllowList.has(normalizeComparableUrl(entry))
  );
  const githubProviderEnabled = Boolean(authConfig?.githubProviderEnabled);
  const githubClientIdConfigured = Boolean(authConfig?.githubClientId);
  const githubClientIdMatches = githubClientIdConfigured;
  const localAuthReady = siteUrlMatches && uriAllowListMatches &&
    githubProviderEnabled && githubClientIdMatches;

  return {
    siteUrl,
    callbackUrl,
    providerSettingsUrl: state.index.authProvidersDashboardUrl,
    githubOauthAppUrl: GITHUB_OAUTH_APP_CREATE_URL,
    githubOauthAppName,
    githubProviderEnabled,
    githubClientIdConfigured,
    githubClientIdMatches,
    siteUrlMatches,
    uriAllowListMatches,
    localAuthReady,
    message: buildIndexAuthSetupMessage({
      verificationError,
      githubProviderEnabled,
      githubClientIdConfigured,
      siteUrlMatches,
      uriAllowListMatches,
      localAuthReady,
    }),
  };
};

const buildNotReadyFunctionsDeploymentSetup = ({
  configuredSecretNames,
  projectRef,
  workflowUrl,
}: {
  configuredSecretNames: Set<string> | null;
  projectRef: string;
  workflowUrl: string;
}): IndexFunctionsDeploymentSetup => ({
  status: "not_ready",
  message: buildFunctionsDeployStatusMessage({
    status: "not_ready",
    missingSecretNames: [],
    latestRunConclusion: null,
  }),
  workflowUrl,
  runUrl: null,
  latestRun: null,
  requiredSecrets: buildRepoSecretRequirements(
    configuredSecretNames,
    projectRef,
  ),
  canDispatch: false,
});

const readConfiguredFunctionsDeploymentSecretNames = async ({
  context,
}: {
  context: IndexAdminContext;
}) => {
  const githubToken = await resolveOwnerGitHubActionsToken(context);
  return await readGitHubRepoSecretNames({
    githubToken,
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
  });
};

const buildFinalizedFunctionsDeploymentSetup = async ({
  context,
}: {
  context: IndexAdminContext;
}): Promise<IndexFunctionsDeploymentSetup> => {
  const workflowUrl = buildGitHubWorkflowUrl({
    owner: context.credentials.repo_owner,
    repo: context.credentials.repo_name,
    workflowFile: INDEX_LIVE_DEPLOY_WORKFLOW_FILE,
  });

  try {
    const githubToken = await resolveOwnerGitHubActionsToken(context);
    const [configuredSecretNames, latestRun] = await Promise.all([
      readGitHubRepoSecretNames({
        githubToken,
        owner: context.credentials.repo_owner,
        repo: context.credentials.repo_name,
      }),
      readLatestGitHubWorkflowRun({
        githubToken,
        owner: context.credentials.repo_owner,
        repo: context.credentials.repo_name,
        workflowFile: INDEX_LIVE_DEPLOY_WORKFLOW_FILE,
      }),
    ]);

    const requiredSecrets = buildRepoSecretRequirements(
      configuredSecretNames,
      context.credentials.supabase_project_ref,
    );
    const missingSecretNames = requiredSecrets
      .filter((entry) => !entry.isConfigured)
      .map((entry) => entry.name);
    const latestRunStatus = latestRun?.status ?? null;
    const latestRunConclusion = latestRun?.conclusion ?? null;
    const latestRunJobs = latestRun?.id
      ? await readGitHubWorkflowRunJobs({
        githubToken,
        owner: context.credentials.repo_owner,
        repo: context.credentials.repo_name,
        runId: latestRun.id,
      })
      : [];

    let status: IndexFunctionsDeploymentStatus;
    if (missingSecretNames.length) {
      status = "needs_secrets";
    } else if (isGitHubWorkflowRunActive(latestRunStatus)) {
      status = "running";
    } else if (latestRunConclusion === "success") {
      status = "deployed";
    } else if (latestRunConclusion) {
      status = "failed";
    } else {
      status = "ready_to_run";
    }

    return {
      status,
      message: buildFunctionsDeployStatusMessage({
        status,
        missingSecretNames,
        latestRunConclusion,
      }),
      workflowUrl,
      runUrl: latestRun?.htmlUrl ?? null,
      latestRun: latestRun
        ? {
          status: latestRun.status,
          conclusion: latestRun.conclusion,
          startedAt: latestRun.startedAt,
          updatedAt: latestRun.updatedAt,
          jobs: latestRunJobs,
        }
        : null,
      requiredSecrets,
      canDispatch: status === "ready_to_run" || status === "failed",
    };
  } catch (error) {
    return {
      status: "unknown" as const,
      message: error instanceof Error
        ? error.message
        : "Could not verify the child deploy workflow state from GitHub Actions.",
      workflowUrl,
      runUrl: null,
      latestRun: null,
      requiredSecrets: buildRepoSecretRequirements(
        null,
        context.credentials.supabase_project_ref,
      ),
      canDispatch: false,
    };
  }
};

const buildFinalizationSetup = async ({
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
      parent_index_id: state.index.parentIndexId,
      parent_index_url: state.index.parentIndexUrl,
      parent_repo_full_name: state.index.parentRepoFullName,
      parent_repo_url: state.index.parentRepoUrl,
    },
  });
  const effectiveJob = getEffectiveIndexFinalizationJob(latestJob);
  const jobPayload = parseIndexFinalizationPayload(effectiveJob?.payload);
  const jobStatus = effectiveJob?.status ?? null;
  const isFinalized = context.archive.runtime_mode === "finalized";
  const normalizedStatus: IndexFinalizationStatus = isFinalized
    ? "finalized"
    : jobStatus === "queued" || jobStatus === "running"
    ? jobStatus
    : jobStatus === "failed"
    ? "failed"
    : jobStatus === "succeeded"
    ? "running"
    : "idle";
  const isRunning = normalizedStatus === "queued" ||
    normalizedStatus === "running";
  const progressTotal = jobPayload.totalFiles > 0
    ? jobPayload.totalFiles
    : null;
  const progressCurrent = progressTotal !== null
    ? Math.min(jobPayload.processedFiles, progressTotal)
    : null;
  const configuredFunctionSecretNames =
    await readConfiguredFunctionsDeploymentSecretNames({
      context,
    }).catch(() => null);
  const functionsDeployment = isFinalized
    ? await buildFinalizedFunctionsDeploymentSetup({ context })
    : buildNotReadyFunctionsDeploymentSetup({
      configuredSecretNames: configuredFunctionSecretNames,
      projectRef: context.credentials.supabase_project_ref,
      workflowUrl: buildGitHubWorkflowUrl({
        owner: context.credentials.repo_owner,
        repo: context.credentials.repo_name,
        workflowFile: INDEX_LIVE_DEPLOY_WORKFLOW_FILE,
      }),
    });

  return {
    finalization: {
      available: context.actorRole === "owner" &&
        !isFinalized &&
        parentSource.sourceKind !== "missing",
      isFinalized,
      isRunning,
      status: normalizedStatus,
      phase: isFinalized ? "commit_finalize" : jobPayload.phase,
      progressCurrent,
      progressTotal,
      canRetry: normalizedStatus === "failed" &&
        context.actorRole === "owner" &&
        !isFinalized &&
        parentSource.sourceKind !== "missing",
      step: isFinalized
        ? functionsDeployment.status === "deployed"
          ? "Standalone app finalized and child deploy workflow completed."
          : "Repo finalized. Finish the child deploy workflow setup below."
        : jobStatus === "succeeded"
        ? "Finishing child setup..."
        : toTrimmedString(effectiveJob?.step) || null,
      error: normalizedStatus === "failed"
        ? toTrimmedString(effectiveJob?.error)
        : null,
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
      functionsDeployStatus: functionsDeployment.status,
      functionsDeployMessage: functionsDeployment.message,
      functionsDeployWorkflowUrl: functionsDeployment.workflowUrl,
      functionsDeployRunUrl: functionsDeployment.runUrl,
      requiredRepoSecrets: functionsDeployment.requiredSecrets,
    },
    functionsDeployment,
  };
};

export const buildStandaloneAdminSetup = async ({
  context,
  state,
  latestJob,
  managementAccessTokenOverride,
}: {
  context: IndexAdminContext;
  state: Awaited<ReturnType<typeof readIndexAdminState>>;
  latestJob: IndexFinalizationJobRow | null;
  managementAccessTokenOverride?: string | null;
}) => {
  const authSetup = await buildAuthSetup({
    context,
    state,
    managementAccessTokenOverride,
  });
  const { finalization, functionsDeployment } = await buildFinalizationSetup({
    context,
    state,
    latestJob,
  });
  const standaloneAdminUrl = context.archive.runtime_mode === "finalized"
    ? functionsDeployment.status === "deployed"
      ? buildStandaloneAdminBaseUrl(state.index.canonicalUrl)
      : ""
    : state.index.standaloneAdminUrl;

  const nextSteps = context.archive.runtime_mode === "finalized"
    ? functionsDeployment.status === "deployed"
      ? [
        "Open the child /admin, Search, Explorer, and Studio from the links below to verify the copied app is live.",
        "Use the child /admin for ongoing index management.",
        "If you want the finalized repo to spawn sites or indexes, make sure the child project's GitHub App and Supabase OAuth secrets are configured too.",
      ]
      : [
        "Add the required GitHub repo secrets shown below to the child repository.",
        "Set SUPABASE_PROJECT_REF_PROD to the child project ref and set SUPABASE_ACCESS_TOKEN to a Supabase account personal access token from Dashboard -> Account -> Access Tokens. Do not use a project API key like sb_secret_....",
        "Open the child repo's Deploy workflow and rerun it after the secrets are saved.",
        "Until the child deploy workflow succeeds, keep using Solidary /admin.",
      ]
    : [
      "Create a GitHub OAuth application for the standalone index.",
      "Enable GitHub in the new Supabase project's Auth providers.",
      "Use the standalone index URL as the site URL and the Supabase auth callback URL in the GitHub app.",
      "When the standalone setup is ready, click Finalise Index to copy over Search, Explorer, Studio, functions, and repo files from the parent index.",
      "Until that is configured, keep using Solidary /admin for management.",
    ];

  return {
    authSetup,
    finalization,
    functionsDeployment,
    liveUrl: state.index.canonicalUrl,
    repoUrl: state.index.repoUrl,
    supabaseDashboardUrl: state.index.supabaseDashboardUrl,
    standaloneAdminUrl,
    authCallbackUrl: state.index.authCallbackUrl,
    authProvidersDashboardUrl: state.index.authProvidersDashboardUrl,
    nextSteps,
    solidaryAdminUrl:
      `${getSolidaryAppUrl()}/admin?indexId=${context.archive.id}`,
  };
};
