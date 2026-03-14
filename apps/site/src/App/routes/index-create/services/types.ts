import type { SupabaseManagementOrganizationSummary } from "../../../features/supabase-management/services/supabase-management";

export type IndexCreateOrganizationOption = SupabaseManagementOrganizationSummary;

export type IndexCreatePrerequisites = {
  githubReady: boolean;
  supabaseReady: boolean;
  supabaseScopesReady: boolean;
  ready: boolean;
  blockingMessage: string | null;
};

export type IndexProvisionJobRepoPayload = {
  full_name?: string;
  name?: string;
  owner?: { login?: string };
  html_url?: string;
  default_branch?: string;
};

export type IndexProvisionJobProjectPayload = {
  id?: string;
  ref?: string;
  name?: string;
  organization_id?: string;
  organization_slug?: string;
  region?: string | null;
  status?: string | null;
  dashboard_url?: string | null;
  project_url?: string | null;
};

export type IndexProvisionJobArchivePayload = {
  id?: string;
  title?: string;
  slug?: string;
  canonical_url?: string | null;
  repo_full_name?: string | null;
  repo_url?: string | null;
};

export type IndexProvisionStartResponse = {
  job?: {
    id?: string;
    status?: string;
    step?: string;
  };
};

export type IndexProvisionStatusResponse = {
  job?: {
    id?: string;
    status?: string;
    step?: string;
    error?: string | null;
    repo?: IndexProvisionJobRepoPayload | null;
    project?: IndexProvisionJobProjectPayload | null;
    archive?: IndexProvisionJobArchivePayload | null;
  };
};
