import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  getGitHubAppConnectionStatusForUser,
  type GitHubAppConnectionState,
  type GitHubAppRepositorySelection
} from "../_shared/github-auth-broker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

type StoredCredentialRow = {
  auth_mode?: string | null;
  access_token_encrypted?: string | null;
  refresh_token_encrypted?: string | null;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const normalizeGitHubAuthMode = (value: unknown): "solidary" | "github" => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "github" ? "github" : "solidary";
};

export const handler: Handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or Supabase service key."
    });
  }

  const supabaseAccessToken = parseBearerToken(
    event.headers.authorization ?? event.headers.Authorization
  );
  if (!supabaseAccessToken) {
    return safeJson(401, { error: "Missing bearer token." });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(supabaseAccessToken);

  if (userError || !user) {
    return safeJson(401, { error: "Invalid Supabase session." });
  }

  const { data, error } = await supabase
    .from("github_app_user_tokens")
    .select("auth_mode, access_token_encrypted, refresh_token_encrypted")
    .eq("user_id", user.id);

  if (error) {
    return safeJson(500, { error: error.message });
  }

  const rows = Array.isArray(data)
    ? data.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    : [];
  const credentials = rows as StoredCredentialRow[];
  const githubCredential =
    credentials.find((entry) => normalizeGitHubAuthMode(entry.auth_mode) === "github") ?? null;
  const solidaryCredential =
    credentials.find((entry) => normalizeGitHubAuthMode(entry.auth_mode) === "solidary") ?? null;
  const hasGitHubCredentials = Boolean(
    githubCredential?.access_token_encrypted?.trim() || githubCredential?.refresh_token_encrypted?.trim()
  );
  const hasSolidaryCredentials = Boolean(
    solidaryCredential?.access_token_encrypted?.trim() || solidaryCredential?.refresh_token_encrypted?.trim()
  );
  const hasStoredCredentials = hasGitHubCredentials || hasSolidaryCredentials;
  const authMode = hasGitHubCredentials ? "github" : "solidary";

  let githubAppConnected = false;
  let githubAppConnectionState: GitHubAppConnectionState = "not_connected";
  let githubAppConnectionMessage: string | null = null;
  let githubAppRepositorySelection: GitHubAppRepositorySelection = "unknown";
  let githubAppSelectedRepositories: string[] = [];
  let githubAppSelectedRepositoriesTruncated = false;

  if (githubCredential) {
    try {
      const connectionStatus = await getGitHubAppConnectionStatusForUser({
        supabase,
        userId: user.id,
        includeRepositoryDetails: true
      });
      githubAppConnected = connectionStatus.connected;
      githubAppConnectionState = connectionStatus.state;
      githubAppConnectionMessage = connectionStatus.message;
      githubAppRepositorySelection = connectionStatus.repositorySelection;
      githubAppSelectedRepositories = connectionStatus.selectedRepositories;
      githubAppSelectedRepositoriesTruncated = connectionStatus.selectedRepositoriesTruncated;
    } catch {
      githubAppConnected = false;
      githubAppConnectionState = "unknown";
      githubAppConnectionMessage = "Could not verify GitHub App installation right now.";
      githubAppRepositorySelection = "unknown";
      githubAppSelectedRepositories = [];
      githubAppSelectedRepositoriesTruncated = false;
    }
  }

  return safeJson(200, {
    auth_mode: authMode,
    github_app_connected: githubAppConnected,
    has_stored_credentials: hasStoredCredentials,
    has_github_credentials: hasGitHubCredentials,
    has_solidary_credentials: hasSolidaryCredentials,
    auth_routing_strategy: "role_based",
    github_app_connection_state: githubAppConnectionState,
    github_app_connection_message: githubAppConnectionMessage,
    github_app_repository_selection: githubAppRepositorySelection,
    github_app_selected_repositories: githubAppSelectedRepositories,
    github_app_selected_repositories_truncated: githubAppSelectedRepositoriesTruncated
  });
};


Deno.serve((request) => runHandler(request, handler));
