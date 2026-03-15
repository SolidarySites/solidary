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
  liveUrl: string;
  repoUrl: string | null;
  supabaseDashboardUrl: string | null;
  standaloneAdminUrl: string;
  authCallbackUrl: string;
  authProvidersDashboardUrl: string;
  nextSteps: string[];
  solidaryAdminUrl: string;
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
