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
  IndexAdminConnectionStatusPayload,
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

type RawIndexAdminArchive = {
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
  siteId?: string;
  status?: "tracked" | "delisted";
  createdAt?: string | null;
  delistReasonCode?: string | null;
  delistNote?: string | null;
  title?: string;
  description?: string;
  canonicalUrl?: string;
  imageUrl?: string | null;
  type?: "site" | "index" | null;
  parentIndexId?: string | null;
  parentIndexUrl?: string | null;
  parentIndexLevel?: number | null;
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
  archive?: RawIndexAdminArchive;
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
  const archive = rawState?.archive;
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
    archive: {
      id: typeof archive?.id === "string" ? archive.id : "",
      slug: typeof archive?.slug === "string" ? archive.slug : "",
      title: typeof archive?.title === "string" ? archive.title : "",
      description: typeof archive?.description === "string" ? archive.description : "",
      imageUrl: typeof archive?.imageUrl === "string" ? archive.imageUrl : "",
      canonicalUrl: typeof archive?.canonicalUrl === "string" ? archive.canonicalUrl : "",
      repoFullName: typeof archive?.repoFullName === "string" ? archive.repoFullName : null,
      repoUrl: typeof archive?.repoUrl === "string" ? archive.repoUrl : null,
      supabaseProjectRef:
        typeof archive?.supabaseProjectRef === "string" ? archive.supabaseProjectRef : null,
      supabaseDashboardUrl:
        typeof archive?.supabaseDashboardUrl === "string" ? archive.supabaseDashboardUrl : null,
      supabaseProjectUrl:
        typeof archive?.supabaseProjectUrl === "string" ? archive.supabaseProjectUrl : "",
      supabasePublishableKey:
        typeof archive?.supabasePublishableKey === "string" ? archive.supabasePublishableKey : "",
      indexLevel: typeof archive?.indexLevel === "number" ? archive.indexLevel : null,
      parentIndexId:
        typeof archive?.parentIndexId === "string" ? archive.parentIndexId : null,
      parentIndexUrl:
        typeof archive?.parentIndexUrl === "string" ? archive.parentIndexUrl : null,
      parentIndexLevel:
        typeof archive?.parentIndexLevel === "number" ? archive.parentIndexLevel : null,
      parentRepoFullName:
        typeof archive?.parentRepoFullName === "string" ? archive.parentRepoFullName : null,
      parentRepoUrl: typeof archive?.parentRepoUrl === "string" ? archive.parentRepoUrl : null,
      type: archive?.type === "site" || archive?.type === "index" ? archive.type : "index",
      standaloneAdminUrl:
        typeof archive?.standaloneAdminUrl === "string" ? archive.standaloneAdminUrl : "",
      solidaryAdminUrl:
        typeof archive?.solidaryAdminUrl === "string" ? archive.solidaryAdminUrl : "",
      authCallbackUrl:
        typeof archive?.authCallbackUrl === "string" ? archive.authCallbackUrl : "",
      authProvidersDashboardUrl:
        typeof archive?.authProvidersDashboardUrl === "string"
          ? archive.authProvidersDashboardUrl
          : ""
    },
    connections: (rawState?.connections ?? []).map(
      (connection) =>
        ({
          siteId: typeof connection.siteId === "string" ? connection.siteId : "",
          status: connection.status === "delisted" ? "delisted" : "tracked",
          createdAt: typeof connection.createdAt === "string" ? connection.createdAt : null,
          delistReasonCode:
            typeof connection.delistReasonCode === "string" ? connection.delistReasonCode : null,
          delistNote: typeof connection.delistNote === "string" ? connection.delistNote : null,
          title: typeof connection.title === "string" ? connection.title : "Untitled site",
          description: typeof connection.description === "string" ? connection.description : "",
          canonicalUrl:
            typeof connection.canonicalUrl === "string" ? connection.canonicalUrl : "",
          imageUrl: typeof connection.imageUrl === "string" ? connection.imageUrl : null,
          type: connection.type === "site" || connection.type === "index" ? connection.type : null,
          parentIndexId:
            typeof connection.parentIndexId === "string" ? connection.parentIndexId : null,
          parentIndexUrl:
            typeof connection.parentIndexUrl === "string" ? connection.parentIndexUrl : null,
          parentIndexLevel:
            typeof connection.parentIndexLevel === "number" ? connection.parentIndexLevel : null
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

export const listAccessibleIndexAdmins = async (): Promise<IndexAdminListItem[]> => {
  const payload = await githubRequest<{ items?: IndexAdminListItem[] }>("index-admin-list", {});
  return Array.isArray(payload.items) ? payload.items : [];
};

export const readIndexAdmin = async (
  archiveId: string,
  options: IndexAdminRequestOptions = {}
): Promise<IndexAdminReadResponse> => {
  const payload = await githubRequest<{ state?: RawIndexAdminState; setup?: RawIndexAdminSetup }>(
    "index-admin-read",
    {
      archive_id: archiveId.trim() || undefined,
      bridge_token: options.bridgeToken?.trim() || undefined,
      supabase_personal_access_token: options.supabasePersonalAccessToken?.trim() || undefined
    }
  );
  return mapReadResponse(payload);
};

export const searchIndexAdminCollaborators = async ({
  archiveId,
  query,
  bridgeToken
}: {
  archiveId: string;
  query: string;
  bridgeToken?: string;
}): Promise<IndexAdminSearchResponse> => {
  const payload = await githubRequest<{ results?: CollaboratorSearchRpcRow[] }>(
    "index-admin-search-collaborators",
    {
      archive_id: archiveId,
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
  archiveId,
  title,
  description,
  imageContentB64
}: IndexAdminGeneralPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    archive_id: archiveId,
    action: "update_general",
    title,
    description,
    image_content_b64: imageContentB64
  }, options);

export const saveIndexAdminConnectionStatus = async ({
  archiveId,
  siteId,
  status
}: IndexAdminConnectionStatusPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    archive_id: archiveId,
    action: "set_connection_status",
    site_id: siteId,
    status
  }, options);

export const saveIndexAdminCollaborator = async ({
  archiveId,
  collaboratorUserId,
  role
}: {
  archiveId: string;
  collaboratorUserId: string;
  role: CollaboratorRole;
}, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    archive_id: archiveId,
    action: "upsert_collaborator",
    collaborator_user_id: collaboratorUserId,
    role
  }, options);

export const removeIndexAdminCollaborator = async ({
  archiveId,
  collaboratorUserId
}: {
  archiveId: string;
  collaboratorUserId: string;
}, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    archive_id: archiveId,
    action: "remove_collaborator",
    collaborator_user_id: collaboratorUserId
  }, options);

export const saveIndexAdminAdvanced = async ({
  archiveId,
  domain
}: IndexAdminAdvancedPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    archive_id: archiveId,
    action: "update_advanced",
    domain
  }, options);

export const finalizeIndexAdmin = async (
  { archiveId }: IndexAdminFinalizePayload,
  options: IndexAdminWriteOptions = {}
) =>
  writeIndexAdmin({
    archive_id: archiveId,
    action: "finalize_index"
  }, options);

export const configureIndexAdminStandaloneAuth = async ({
  archiveId,
  githubClientId,
  githubClientSecret,
  supabasePersonalAccessToken
}: IndexAdminConfigureStandaloneAuthPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    archive_id: archiveId,
    action: "configure_standalone_auth",
    github_client_id: githubClientId,
    github_client_secret: githubClientSecret,
    supabase_personal_access_token: supabasePersonalAccessToken?.trim() || undefined
  }, options);

export const deployIndexAdminChildFunctions = async ({
  archiveId,
  supabasePersonalAccessToken,
  adminPassword,
  dispatchWorkflow = true
}: IndexAdminDeployFunctionsPayload, options: IndexAdminWriteOptions = {}) =>
  writeIndexAdmin({
    archive_id: archiveId,
    action: "deploy_child_functions",
    supabase_personal_access_token: supabasePersonalAccessToken,
    admin_password: adminPassword?.trim() || undefined,
    dispatch_workflow: dispatchWorkflow
  }, options);

export const fileToBase64 = async (file: File) => toBase64(await file.arrayBuffer());

export const collaboratorRoleLabel = (role: ManagedCollaborator["role"]) =>
  role.slice(0, 1).toUpperCase() + role.slice(1);
