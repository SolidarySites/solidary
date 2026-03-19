export type CreateRepoResponse = {
  repo?: {
    full_name?: string;
    name?: string;
    owner?: { login?: string };
    html_url?: string;
    default_branch?: string;
  };
};

export type CreateRepoStartResponse = {
  job?: {
    id?: string;
    status?: string;
    step?: string;
  };
};

export type CreateRepoStatusResponse = {
  job?: {
    id?: string;
    status?: string;
    step?: string;
    error?: string | null;
    repo?: CreateRepoResponse["repo"];
  };
};

export type GitHubPublishStatusResponse = {
  phase: "pending" | "queued" | "in_progress" | "deployed" | "failed";
  message?: string;
  runUrl?: string;
  pagesUrl?: string;
};

export type ProvisioningDiagnostics = {
  capturedSessionUserId: string;
  liveAuthUserId: string;
  sessionExpiresAt: number | null;
  nowUnixSeconds: number;
  siteId: string;
  repoFullName: string;
};

export type DbWriteStage =
  | "sites_insert"
  | "connections_insert"
  | "index_sites_insert"
  | "site_drafts_insert"
  | "site_draft_settings_upsert"
  | "site_draft_pages_insert";

export type ProvisionedRepository = {
  ownerLogin: string;
  repoName: string;
  defaultBranch: string;
  repoFullName: string;
  siteUrlResolved: string;
};
