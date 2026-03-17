import type {
  CollaboratorRole,
  CollaboratorSearchResult,
  ManagedCollaborator
} from "../../studio/routes/site-builder/services/types";

export type IndexAdminListItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  repoFullName: string | null;
  repoUrl: string | null;
  supabaseProjectRef: string | null;
  supabaseDashboardUrl: string | null;
  indexLevel: number | null;
  parentIndexId: string | null;
  parentIndexUrl: string | null;
  parentIndexLevel: number | null;
  accessRole: "owner" | "admin" | "editor" | "contributor";
};

export type IndexAdminActorState = {
  userId: string;
  role: "owner" | "admin" | "editor" | "contributor";
  via: "session" | "bridge";
  canEditGeneral: boolean;
  canManageConnections: boolean;
  canManageCollaborators: boolean;
  canManageAdvanced: boolean;
};

export type IndexAdminArchiveState = {
  id: string;
  slug: string;
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  repoFullName: string | null;
  repoUrl: string | null;
  supabaseProjectRef: string | null;
  supabaseDashboardUrl: string | null;
  supabaseProjectUrl: string;
  supabasePublishableKey: string;
  indexLevel: number | null;
  parentIndexId: string | null;
  parentIndexUrl: string | null;
  parentIndexLevel: number | null;
  parentRepoFullName: string | null;
  parentRepoUrl: string | null;
  type: "site" | "index";
  standaloneAdminUrl: string;
  solidaryAdminUrl: string;
  authCallbackUrl: string;
  authProvidersDashboardUrl: string;
};

export type IndexAdminConnection = {
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

export type IndexAdminSetup = {
  authSetup: IndexAdminAuthSetup;
  finalization: IndexAdminFinalizationState;
  functionsDeployment: IndexAdminFunctionsDeploymentSetup;
  liveUrl: string;
  repoUrl: string | null;
  supabaseDashboardUrl: string | null;
  standaloneAdminUrl: string;
  authCallbackUrl: string;
  authProvidersDashboardUrl: string;
  nextSteps: string[];
  solidaryAdminUrl: string;
};

export type IndexAdminRepoSecretRequirement = {
  name: "SUPABASE_ACCESS_TOKEN" | "SUPABASE_PROJECT_REF_PROD" | "ADMIN_PASSWORD";
  isConfigured: boolean;
  value: string | null;
  description: string;
};

export type IndexAdminAuthSetup = {
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

export type IndexAdminFunctionsDeploymentSetup = {
  status:
    | "not_ready"
    | "needs_secrets"
    | "ready_to_run"
    | "running"
    | "failed"
    | "deployed"
    | "unknown";
  message: string | null;
  workflowUrl: string | null;
  runUrl: string | null;
  latestRun: IndexAdminFunctionsDeploymentRun | null;
  requiredSecrets: IndexAdminRepoSecretRequirement[];
  canDispatch: boolean;
};

export type IndexAdminFunctionsDeploymentRunStep = {
  name: string;
  status: string | null;
  conclusion: string | null;
};

export type IndexAdminFunctionsDeploymentRunJob = {
  name: string;
  status: string | null;
  conclusion: string | null;
  steps: IndexAdminFunctionsDeploymentRunStep[];
};

export type IndexAdminFunctionsDeploymentRun = {
  status: string | null;
  conclusion: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  jobs: IndexAdminFunctionsDeploymentRunJob[];
};

export type IndexFinalizationPhase = "prepare_manifest" | "materialize_blobs" | "commit_finalize";

export type IndexAdminFinalizationState = {
  available: boolean;
  isFinalized: boolean;
  isRunning: boolean;
  status: "idle" | "queued" | "running" | "failed" | "finalized";
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
  sourceRepoStatus: "child_lineage" | "solidary_lineage" | "root_fallback" | "missing";
  sourceRepoMessage: string | null;
  targetStudioUrl: string;
  targetExplorerUrl: string;
  targetSearchUrl: string;
  functionsDeployStatus:
    | "not_ready"
    | "needs_secrets"
    | "ready_to_run"
    | "running"
    | "failed"
    | "deployed"
    | "unknown";
  functionsDeployMessage: string | null;
  functionsDeployWorkflowUrl: string | null;
  functionsDeployRunUrl: string | null;
  requiredRepoSecrets: IndexAdminRepoSecretRequirement[];
};

export type IndexAdminState = {
  actor: IndexAdminActorState;
  archive: IndexAdminArchiveState;
  connections: IndexAdminConnection[];
  collaborators: ManagedCollaborator[];
  owner: CollaboratorSearchResult | null;
};

export type IndexAdminReadResponse = {
  state: IndexAdminState;
  setup: IndexAdminSetup;
};

export type IndexAdminSearchResponse = {
  results: CollaboratorSearchResult[];
};

export type IndexAdminWriteResponse = IndexAdminReadResponse;

export type IndexAdminGeneralPayload = {
  archiveId: string;
  title: string;
  description: string;
  imageContentB64?: string;
};

export type IndexAdminConnectionStatusPayload = {
  archiveId: string;
  siteId: string;
  status: "tracked" | "delisted";
};

export type IndexAdminCollaboratorPayload = {
  archiveId: string;
  collaboratorUserId: string;
  role: CollaboratorRole;
};

export type IndexAdminAdvancedPayload = {
  archiveId: string;
  domain: string | null;
};

export type IndexAdminFinalizePayload = {
  archiveId: string;
};

export type IndexAdminConfigureStandaloneAuthPayload = {
  archiveId: string;
  githubClientId: string;
  githubClientSecret: string;
  supabasePersonalAccessToken?: string;
};

export type IndexAdminDeployFunctionsPayload = {
  archiveId: string;
  supabasePersonalAccessToken: string;
  adminPassword?: string;
  dispatchWorkflow?: boolean;
};
