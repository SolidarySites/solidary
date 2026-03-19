import { githubRequest } from "../../../services/github";
import { toBase64 } from "../../../lib/base64";
import type {
  CollaboratorRole,
  CollaboratorSearchResult,
  ManagedCollaborator
} from "../../studio/routes/site-builder/services/types";
import {
  mapCollaboratorSearchRows,
  mapManagedCollaboratorRows,
  type CollaboratorSearchRpcRow,
  type ManagedCollaboratorApiRow
} from "../../studio/routes/site-builder/services/collaborators";
import type {
  IndexAdminAdvancedPayload,
  IndexAdminAuthSetup,
  IndexAdminConnection,
  IndexAdminConnectionRequestPayload,
  IndexAdminConfigureStandaloneAuthPayload,
  IndexAdminDeployFunctionsPayload,
  IndexAdminFunctionsDeploymentRun,
  IndexAdminFinalizePayload,
  IndexAdminGeneralPayload,
  IndexAdminFinalizationState,
  IndexAdminFunctionsDeploymentSetup,
  IndexAdminListItem,
  IndexAdminRepoSecretRequirement,
  IndexAdminReadResponse,
  IndexAdminSearchResponse,
  IndexAdminSetup,
  IndexAdminState,
  IndexAdminWriteResponse
} from "./types";

type RawIndexAdminActor = {
  userId?: string;
  role?: "owner" | "admin" | "editor" | "contributor";
  via?: "session" | "bridge";
  canEditGeneral?: boolean;
  canManageConnections?: boolean;
  canManageCollaborators?: boolean;
  canManageAdvanced?: boolean;
};

type RawIndexAdminIndex = {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  canonicalUrl?: string;
  repoFullName?: string | null;
  repoUrl?: string | null;
  supabaseProjectRef?: string | null;
  supabaseDashboardUrl?: string | null;
  supabaseProjectUrl?: string;
  supabasePublishableKey?: string;
  indexLevel?: number | null;
  parentIndexId?: string | null;
  parentIndexUrl?: string | null;
  parentIndexLevel?: number | null;
  parentRepoFullName?: string | null;
  parentRepoUrl?: string | null;
  type?: "site" | "index";
  standaloneAdminUrl?: string;
  solidaryAdminUrl?: string;
  authCallbackUrl?: string;
  authProvidersDashboardUrl?: string;
};

type RawIndexAdminConnection = {
  requestId?: string;
  connectionUuid?: string;
  status?: "pending" | "approved" | "rejected" | "cancelled";
  createdAt?: string | null;
  respondedAt?: string | null;
  sourceSiteId?: string;
  sourceSiteTitle?: string;
  sourceSiteUrl?: string;
  sourceSiteImageUrl?: string | null;
  sourceOwnerDisplayName?: string;
};

type RawIndexAdminCollaborator = {
  role?: CollaboratorRole | "owner" | "viewer" | null;
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
  githubLogin?: string | null;
  syncState?: "synced" | "pending_invite" | "unknown" | null;
};

type RawIndexAdminState = {
  actor?: RawIndexAdminActor;
  index?: RawIndexAdminIndex;
  connections?: RawIndexAdminConnection[];
  collaborators?: RawIndexAdminCollaborator[];
};

type RawIndexAdminFinalizationState = Partial<IndexAdminFinalizationState>;

type RawIndexAdminRepoSecretRequirement = Partial<IndexAdminRepoSecretRequirement>;

type RawIndexAdminAuthSetup = Partial<IndexAdminAuthSetup>;

type RawIndexAdminFunctionsDeploymentSetup =
  Partial<IndexAdminFunctionsDeploymentSetup>;

type RawIndexAdminFunctionsDeploymentRun = Partial<IndexAdminFunctionsDeploymentRun>;

type RawIndexAdminSetup = Partial<IndexAdminSetup> & {
  authSetup?: RawIndexAdminAuthSetup | null;
  finalization?: RawIndexAdminFinalizationState | null;
  functionsDeployment?: (RawIndexAdminFunctionsDeploymentSetup & {
    latestRun?: RawIndexAdminFunctionsDeploymentRun | null;
  }) | null;
};

const mapIndexAdminState = (rawState: RawIndexAdminState | null | undefined): IndexAdminState => {
  const actor = rawState?.actor;
  const index = rawState?.index;
  const collaboratorRows = rawState?.collaborators ?? [];
  const ownerRow = collaboratorRows.find((entry) => entry.role === "owner") ?? null;
  const managedCollaboratorRows: ManagedCollaboratorApiRow[] = collaboratorRows
    .filter(
      (entry) =>
        entry.role === "admin" || entry.role === "editor" || entry.role === "contributor"
    )
    .map((entry) => ({
      userId: typeof entry.userId === "string" ? entry.userId : null,
      role:
        entry.role === "admin" || entry.role === "editor" || entry.role === "contributor"
          ? entry.role
          : null,
      email: typeof entry.email === "string" ? entry.email : null,
      displayName: typeof entry.displayName === "string" ? entry.displayName : null,
      githubLogin: typeof entry.githubLogin === "string" ? entry.githubLogin : null,
      syncState:
        entry.syncState === "synced" ||
        entry.syncState === "pending_invite" ||
        entry.syncState === "unknown"
          ? entry.syncState
          : null
    }));

  return {
    actor: {
      userId: typeof actor?.userId === "string" ? actor.userId : "",
      role:
        actor?.role === "admin" ||
        actor?.role === "editor" ||
        actor?.role === "contributor" ||
        actor?.role === "owner"
          ? actor.role
          : "owner",
      via: actor?.via === "bridge" ? "bridge" : "session",
      canEditGeneral: actor?.canEditGeneral !== false,
      canManageConnections: actor?.canManageConnections !== false,
      canManageCollaborators: actor?.canManageCollaborators !== false,
      canManageAdvanced: actor?.canManageAdvanced !== false
    },
    index: {
      id: typeof index?.id === "string" ? index.id : "",
      slug: typeof index?.slug === "string" ? index.slug : "",
      title: typeof index?.title === "string" ? index.title : "",
      description: typeof index?.description === "string" ? index.description : "",
      imageUrl: typeof index?.imageUrl === "string" ? index.imageUrl : "",
      canonicalUrl: typeof index?.canonicalUrl === "string" ? index.canonicalUrl : "",
      repoFullName: typeof index?.repoFullName === "string" ? index.repoFullName : null,
      repoUrl: typeof index?.repoUrl === "string" ? index.repoUrl : null,
      supabaseProjectRef:
        typeof index?.supabaseProjectRef === "string" ? index.supabaseProjectRef : null,
      supabaseDashboardUrl:
        typeof index?.supabaseDashboardUrl === "string" ? index.supabaseDashboardUrl : null,
      supabaseProjectUrl:
        typeof index?.supabaseProjectUrl === "string" ? index.supabaseProjectUrl : "",
      supabasePublishableKey:
        typeof index?.supabasePublishableKey === "string" ? index.supabasePublishableKey : "",
      indexLevel: typeof index?.indexLevel === "number" ? index.indexLevel : null,
      parentIndexId:
        typeof index?.parentIndexId === "string" ? index.parentIndexId : null,
      parentIndexUrl:
        typeof index?.parentIndexUrl === "string" ? index.parentIndexUrl : null,
      parentIndexLevel:
        typeof index?.parentIndexLevel === "number" ? index.parentIndexLevel : null,
      parentRepoFullName:
        typeof index?.parentRepoFullName === "string" ? index.parentRepoFullName : null,
      parentRepoUrl: typeof index?.parentRepoUrl === "string" ? index.parentRepoUrl : null,
      type: index?.type === "site" || index?.type === "index" ? index.type : "index",
      standaloneAdminUrl:
        typeof index?.standaloneAdminUrl === "string" ? index.standaloneAdminUrl : "",
      solidaryAdminUrl:
        typeof index?.solidaryAdminUrl === "string" ? index.solidaryAdminUrl : "",
      authCallbackUrl:
        typeof index?.authCallbackUrl === "string" ? index.authCallbackUrl : "",
      authProvidersDashboardUrl:
        typeof index?.authProvidersDashboardUrl === "string"
          ? index.authProvidersDashboardUrl
          : ""
    },
    connections: (rawState?.connections ?? []).map(
      (connection) =>
        ({
          requestId: typeof connection.requestId === "string" ? connection.requestId : "",
          connectionUuid: typeof connection.connectionUuid === "string" ? connection.connectionUuid : "",
          status:
            connection.status === "approved" ||
            connection.status === "rejected" ||
            connection.status === "cancelled"
              ? connection.status
              : "pending",
          createdAt: typeof connection.createdAt === "string" ? connection.createdAt : null,
          respondedAt: typeof connection.respondedAt === "string" ? connection.respondedAt : null,
          sourceSiteId: typeof connection.sourceSiteId === "string" ? connection.sourceSiteId : "",
          sourceSiteTitle:
            typeof connection.sourceSiteTitle === "string" && connection.sourceSiteTitle.trim()
              ? connection.sourceSiteTitle
              : "Untitled site",
          sourceSiteUrl:
            typeof connection.sourceSiteUrl === "string" ? connection.sourceSiteUrl : "",
          sourceSiteImageUrl:
            typeof connection.sourceSiteImageUrl === "string" ? connection.sourceSiteImageUrl : "",
          sourceOwnerDisplayName:
            typeof connection.sourceOwnerDisplayName === "string" &&
              connection.sourceOwnerDisplayName.trim()
              ? connection.sourceOwnerDisplayName
              : "Unknown"
        }) satisfies IndexAdminConnection
    ),
    collaborators: mapManagedCollaboratorRows(managedCollaboratorRows),
    owner: ownerRow
      ? ({
          userId: typeof ownerRow.userId === "string" ? ownerRow.userId : "",
          email: typeof ownerRow.email === "string" ? ownerRow.email : "",
          displayName:
            typeof ownerRow.displayName === "string" && ownerRow.displayName.trim()
              ? ownerRow.displayName
              : typeof ownerRow.email === "string"
                ? ownerRow.email
                : "",
          githubLogin: typeof ownerRow.githubLogin === "string" ? ownerRow.githubLogin : null
        } satisfies CollaboratorSearchResult)
      : null
  };
};

const mapFinalization = (
  rawFinalization: RawIndexAdminFinalizationState | null | undefined
): IndexAdminFinalizationState => ({
  available: rawFinalization?.available === true,
  isFinalized: rawFinalization?.isFinalized === true,
  isRunning: rawFinalization?.isRunning === true,
  status:
    rawFinalization?.status === "queued" ||
    rawFinalization?.status === "running" ||
    rawFinalization?.status === "failed" ||
    rawFinalization?.status === "finalized"
      ? rawFinalization.status
      : "idle",
  phase:
    rawFinalization?.phase === "prepare_manifest" ||
    rawFinalization?.phase === "materialize_blobs" ||
    rawFinalization?.phase === "commit_finalize"
      ? rawFinalization.phase
      : null,
  progressCurrent:
    typeof rawFinalization?.progressCurrent === "number" &&
      Number.isFinite(rawFinalization.progressCurrent)
      ? rawFinalization.progressCurrent
      : null,
  progressTotal:
    typeof rawFinalization?.progressTotal === "number" &&
      Number.isFinite(rawFinalization.progressTotal)
      ? rawFinalization.progressTotal
      : null,
  canRetry: rawFinalization?.canRetry === true,
  step: typeof rawFinalization?.step === "string" ? rawFinalization.step : null,
  error: typeof rawFinalization?.error === "string" ? rawFinalization.error : null,
  startedAt: typeof rawFinalization?.startedAt === "string" ? rawFinalization.startedAt : null,
  completedAt:
    typeof rawFinalization?.completedAt === "string" ? rawFinalization.completedAt : null,
  sourceRepoFullName:
    typeof rawFinalization?.sourceRepoFullName === "string"
      ? rawFinalization.sourceRepoFullName
      : null,
  sourceRepoUrl:
    typeof rawFinalization?.sourceRepoUrl === "string" ? rawFinalization.sourceRepoUrl : null,
  sourceRepoStatus:
    rawFinalization?.sourceRepoStatus === "child_lineage" ||
    rawFinalization?.sourceRepoStatus === "solidary_lineage" ||
    rawFinalization?.sourceRepoStatus === "root_fallback" ||
    rawFinalization?.sourceRepoStatus === "missing"
      ? rawFinalization.sourceRepoStatus
      : "missing",
  sourceRepoMessage:
    typeof rawFinalization?.sourceRepoMessage === "string"
      ? rawFinalization.sourceRepoMessage
      : null,
  targetStudioUrl:
    typeof rawFinalization?.targetStudioUrl === "string" ? rawFinalization.targetStudioUrl : "",
  targetExplorerUrl:
    typeof rawFinalization?.targetExplorerUrl === "string"
      ? rawFinalization.targetExplorerUrl
      : "",
  targetSearchUrl:
    typeof rawFinalization?.targetSearchUrl === "string" ? rawFinalization.targetSearchUrl : "",
  functionsDeployStatus:
    rawFinalization?.functionsDeployStatus === "needs_secrets" ||
    rawFinalization?.functionsDeployStatus === "ready_to_run" ||
    rawFinalization?.functionsDeployStatus === "running" ||
    rawFinalization?.functionsDeployStatus === "failed" ||
    rawFinalization?.functionsDeployStatus === "deployed" ||
    rawFinalization?.functionsDeployStatus === "unknown"
      ? rawFinalization.functionsDeployStatus
      : "not_ready",
  functionsDeployMessage:
    typeof rawFinalization?.functionsDeployMessage === "string"
      ? rawFinalization.functionsDeployMessage
      : null,
  functionsDeployWorkflowUrl:
    typeof rawFinalization?.functionsDeployWorkflowUrl === "string"
      ? rawFinalization.functionsDeployWorkflowUrl
      : null,
  functionsDeployRunUrl:
    typeof rawFinalization?.functionsDeployRunUrl === "string"
      ? rawFinalization.functionsDeployRunUrl
      : null,
  requiredRepoSecrets: Array.isArray(rawFinalization?.requiredRepoSecrets)
    ? rawFinalization.requiredRepoSecrets
        .map((entry) => entry as RawIndexAdminRepoSecretRequirement)
        .filter(
          (entry): entry is RawIndexAdminRepoSecretRequirement =>
            entry.name === "SUPABASE_ACCESS_TOKEN" ||
            entry.name === "SUPABASE_PROJECT_REF_PROD" ||
            entry.name === "ADMIN_PASSWORD"
        )
        .map(
          (entry) =>
            ({
              name: entry.name as IndexAdminRepoSecretRequirement["name"],
              isConfigured: entry.isConfigured === true,
              value: typeof entry.value === "string" ? entry.value : null,
              description: typeof entry.description === "string" ? entry.description : ""
            }) satisfies IndexAdminRepoSecretRequirement
        )
    : []
});

const mapAuthSetup = (
  rawAuthSetup: RawIndexAdminAuthSetup | null | undefined
): IndexAdminAuthSetup => ({
  siteUrl: typeof rawAuthSetup?.siteUrl === "string" ? rawAuthSetup.siteUrl : "",
  callbackUrl: typeof rawAuthSetup?.callbackUrl === "string" ? rawAuthSetup.callbackUrl : "",
  providerSettingsUrl:
    typeof rawAuthSetup?.providerSettingsUrl === "string" ? rawAuthSetup.providerSettingsUrl : "",
  githubOauthAppUrl:
    typeof rawAuthSetup?.githubOauthAppUrl === "string" ? rawAuthSetup.githubOauthAppUrl : "",
  githubOauthAppName:
    typeof rawAuthSetup?.githubOauthAppName === "string" ? rawAuthSetup.githubOauthAppName : "",
  githubProviderEnabled: rawAuthSetup?.githubProviderEnabled === true,
  githubClientIdConfigured: rawAuthSetup?.githubClientIdConfigured === true,
  githubClientIdMatches: rawAuthSetup?.githubClientIdMatches === true,
  siteUrlMatches: rawAuthSetup?.siteUrlMatches === true,
  uriAllowListMatches: rawAuthSetup?.uriAllowListMatches === true,
  localAuthReady: rawAuthSetup?.localAuthReady === true,
  message: typeof rawAuthSetup?.message === "string" ? rawAuthSetup.message : null
});

const mapFunctionsDeployment = (
  rawFunctionsDeployment: RawIndexAdminFunctionsDeploymentSetup | null | undefined
): IndexAdminFunctionsDeploymentSetup => ({
  status:
    rawFunctionsDeployment?.status === "needs_secrets" ||
    rawFunctionsDeployment?.status === "ready_to_run" ||
    rawFunctionsDeployment?.status === "running" ||
    rawFunctionsDeployment?.status === "failed" ||
    rawFunctionsDeployment?.status === "deployed" ||
    rawFunctionsDeployment?.status === "unknown"
      ? rawFunctionsDeployment.status
      : "not_ready",
  message:
    typeof rawFunctionsDeployment?.message === "string"
      ? rawFunctionsDeployment.message
      : null,
  workflowUrl:
    typeof rawFunctionsDeployment?.workflowUrl === "string"
      ? rawFunctionsDeployment.workflowUrl
      : null,
  runUrl:
    typeof rawFunctionsDeployment?.runUrl === "string" ? rawFunctionsDeployment.runUrl : null,
  latestRun:
    rawFunctionsDeployment &&
      typeof (rawFunctionsDeployment as { latestRun?: unknown }).latestRun === "object" &&
      (rawFunctionsDeployment as { latestRun?: unknown }).latestRun !== null
      ? {
        status:
          typeof ((rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
            .latestRun?.status) === "string"
            ? (rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
              .latestRun?.status ?? null
            : null,
        conclusion:
          typeof ((rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
            .latestRun?.conclusion) === "string"
            ? (rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
              .latestRun?.conclusion ?? null
            : null,
        startedAt:
          typeof ((rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
            .latestRun?.startedAt) === "string"
            ? (rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
              .latestRun?.startedAt ?? null
            : null,
        updatedAt:
          typeof ((rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
            .latestRun?.updatedAt) === "string"
            ? (rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
              .latestRun?.updatedAt ?? null
            : null,
        jobs: Array.isArray(
          (rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun }).latestRun
            ?.jobs
        )
          ? ((rawFunctionsDeployment as { latestRun?: RawIndexAdminFunctionsDeploymentRun })
              .latestRun?.jobs ?? [])
              .filter(
                (job): job is NonNullable<IndexAdminFunctionsDeploymentRun["jobs"]>[number] =>
                  Boolean(job && typeof job.name === "string")
              )
              .map((job) => ({
                name: job.name,
                status: typeof job.status === "string" ? job.status : null,
                conclusion: typeof job.conclusion === "string" ? job.conclusion : null,
                steps: Array.isArray(job.steps)
                  ? job.steps
                      .filter(
                        (step): step is NonNullable<
                          NonNullable<IndexAdminFunctionsDeploymentRun["jobs"]>[number]["steps"]
                        >[number] => Boolean(step && typeof step.name === "string")
                      )
                      .map((step) => ({
                        name: step.name,
                        status: typeof step.status === "string" ? step.status : null,
                        conclusion: typeof step.conclusion === "string" ? step.conclusion : null
                      }))
                  : []
              }))
          : []
      }
      : null,
  requiredSecrets: Array.isArray(rawFunctionsDeployment?.requiredSecrets)
    ? rawFunctionsDeployment.requiredSecrets
        .map((entry) => entry as RawIndexAdminRepoSecretRequirement)
        .filter(
          (entry): entry is RawIndexAdminRepoSecretRequirement =>
            entry.name === "SUPABASE_ACCESS_TOKEN" ||
            entry.name === "SUPABASE_PROJECT_REF_PROD" ||
            entry.name === "ADMIN_PASSWORD"
        )
        .map(
          (entry) =>
            ({
              name: entry.name as IndexAdminRepoSecretRequirement["name"],
              isConfigured: entry.isConfigured === true,
              value: typeof entry.value === "string" ? entry.value : null,
              description: typeof entry.description === "string" ? entry.description : ""
            }) satisfies IndexAdminRepoSecretRequirement
        )
    : [],
  canDispatch: rawFunctionsDeployment?.canDispatch === true
});

const mapSetup = (rawSetup: RawIndexAdminSetup | null | undefined): IndexAdminSetup => ({
  authSetup: mapAuthSetup(rawSetup?.authSetup),
  finalization: mapFinalization(rawSetup?.finalization),
  functionsDeployment: mapFunctionsDeployment(rawSetup?.functionsDeployment),
  liveUrl: typeof rawSetup?.liveUrl === "string" ? rawSetup.liveUrl : "",
  repoUrl: typeof rawSetup?.repoUrl === "string" ? rawSetup.repoUrl : null,
  supabaseDashboardUrl:
    typeof rawSetup?.supabaseDashboardUrl === "string" ? rawSetup.supabaseDashboardUrl : null,
  standaloneAdminUrl:
    typeof rawSetup?.standaloneAdminUrl === "string" ? rawSetup.standaloneAdminUrl : "",
  authCallbackUrl: typeof rawSetup?.authCallbackUrl === "string" ? rawSetup.authCallbackUrl : "",
  authProvidersDashboardUrl:
    typeof rawSetup?.authProvidersDashboardUrl === "string"
      ? rawSetup.authProvidersDashboardUrl
      : "",
  nextSteps: Array.isArray(rawSetup?.nextSteps)
    ? rawSetup.nextSteps.filter((entry): entry is string => typeof entry === "string")
    : [],
  solidaryAdminUrl:
    typeof rawSetup?.solidaryAdminUrl === "string" ? rawSetup.solidaryAdminUrl : ""
});

const mapReadResponse = (payload: {
  state?: RawIndexAdminState | null;
  setup?: RawIndexAdminSetup | null;
}): IndexAdminReadResponse => ({
  state: mapIndexAdminState(payload.state),
  setup: mapSetup(payload.setup)
});

type IndexAdminRequestOptions = {
  bridgeToken?: string;
  supabasePersonalAccessToken?: string;
};

type IndexAdminWriteOptions = {
  bridgeToken?: string;
};

const DEFAULT_SOLIDARY_ROOT_INDEX_ID = "00000000-0000-4000-8000-000000000001";

const readConfiguredRootIndexId = () => {
  const explicitRootIndexId =
    typeof import.meta.env.VITE_SOLIDARY_ROOT_INDEX_ID === "string"
      ? import.meta.env.VITE_SOLIDARY_ROOT_INDEX_ID.trim()
      : "";
  return explicitRootIndexId || DEFAULT_SOLIDARY_ROOT_INDEX_ID;
};

export const getRootIndexAdminIndexId = () => readConfiguredRootIndexId();

export const listAccessibleIndexAdmins = async (): Promise<IndexAdminListItem[]> => {
  const payload = await githubRequest<{ items?: IndexAdminListItem[] }>("index-admin-list", {});
  return Array.isArray(payload.items) ? payload.items : [];
};

export const loginIndexAdminWithPassword = async ({
  indexId,
  password
}: {
  indexId: string;
  password: string;
}) => {
  const payload = await githubRequest<{ token?: string }>("index-admin-password-login", {
    index_id: indexId.trim(),
    password
  });
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!token) {
    throw new Error("Admin login did not return a token.");
  }
  return token;
};

export const readIndexAdmin = async (
  indexId: string,
  options: IndexAdminRequestOptions = {}
): Promise<IndexAdminReadResponse> => {
  const payload = await githubRequest<{ state?: RawIndexAdminState; setup?: RawIndexAdminSetup }>(
    "index-admin-read",
    {
      index_id: indexId.trim() || undefined,
      bridge_token: options.bridgeToken?.trim() || undefined,
      supabase_personal_access_token: options.supabasePersonalAccessToken?.trim() || undefined
    }
  );
  return mapReadResponse(payload);
};

export const searchIndexAdminCollaborators = async ({
  indexId,
  query,
  bridgeToken
}: {
  indexId: string;
  query: string;
  bridgeToken?: string;
}): Promise<IndexAdminSearchResponse> => {
  const payload = await githubRequest<{ results?: CollaboratorSearchRpcRow[] }>(
    "index-admin-search-collaborators",
    {
      index_id: indexId,
      query,
      bridge_token: bridgeToken?.trim() || undefined
    }
  );

  return {
    results: mapCollaboratorSearchRows(payload.results)
  };
};

const writeIndexAdmin = async (
  body: Record<string, unknown>,
  options: IndexAdminWriteOptions = {}
): Promise<IndexAdminWriteResponse> => {
  const payload = await githubRequest<{ state?: RawIndexAdminState; setup?: RawIndexAdminSetup }>(
    "index-admin-write",
    {
      ...body,
      bridge_token: options.bridgeToken?.trim() || undefined
    }
  );
  return mapReadResponse(payload);
};

export const saveIndexAdminGeneral = async ({
  indexId,
  title,
  description,
  imageContentB64
}: IndexAdminGeneralPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    index_id: indexId,
    action: "update_general",
    title,
    description,
    image_content_b64: imageContentB64
  }, options);

export const updateIndexAdminConnectionRequest = async ({
  indexId,
  requestId,
  action
}: IndexAdminConnectionRequestPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    index_id: indexId,
    action: "update_connection_request",
    request_id: requestId,
    connection_action: action
  }, options);

export const saveIndexAdminCollaborator = async ({
  indexId,
  collaboratorUserId,
  role
}: {
  indexId: string;
  collaboratorUserId: string;
  role: CollaboratorRole;
}, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    index_id: indexId,
    action: "upsert_collaborator",
    collaborator_user_id: collaboratorUserId,
    role
  }, options);

export const removeIndexAdminCollaborator = async ({
  indexId,
  collaboratorUserId
}: {
  indexId: string;
  collaboratorUserId: string;
}, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    index_id: indexId,
    action: "remove_collaborator",
    collaborator_user_id: collaboratorUserId
  }, options);

export const saveIndexAdminAdvanced = async ({
  indexId,
  domain
}: IndexAdminAdvancedPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    index_id: indexId,
    action: "update_advanced",
    domain
  }, options);

export const finalizeIndexAdmin = async (
  { indexId }: IndexAdminFinalizePayload,
  options: IndexAdminWriteOptions = {}
) =>
  writeIndexAdmin({
    index_id: indexId,
    action: "finalize_index"
  }, options);

export const configureIndexAdminStandaloneAuth = async ({
  indexId,
  githubClientId,
  githubClientSecret,
  supabasePersonalAccessToken
}: IndexAdminConfigureStandaloneAuthPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    index_id: indexId,
    action: "configure_standalone_auth",
    github_client_id: githubClientId,
    github_client_secret: githubClientSecret,
    supabase_personal_access_token: supabasePersonalAccessToken?.trim() || undefined
  }, options);

export const deployIndexAdminChildFunctions = async ({
  indexId,
  supabasePersonalAccessToken,
  adminPassword,
  dispatchWorkflow = true
}: IndexAdminDeployFunctionsPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    index_id: indexId,
    action: "deploy_child_functions",
    supabase_personal_access_token: supabasePersonalAccessToken,
    admin_password: adminPassword?.trim() || undefined,
    dispatch_workflow: dispatchWorkflow
  }, options);

export const fileToBase64 = async (file: File) => toBase64(await file.arrayBuffer());

export const collaboratorRoleLabel = (role: ManagedCollaborator["role"]) =>
  role.slice(0, 1).toUpperCase() + role.slice(1);
