import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  getGitHubAppConnectionStatusForUser,
  type GitHubAppConnectionState
} from "../_shared/github-auth-broker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ?? Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";

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
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return safeJson(500, { error: error.message });
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return safeJson(200, {
      auth_mode: "solidary",
      github_app_connected: false,
      has_stored_credentials: false,
      github_app_connection_state: "not_connected",
      github_app_connection_message: null
    });
  }

  const credential = data as StoredCredentialRow;
  const authMode = normalizeGitHubAuthMode(credential.auth_mode);
  const hasStoredCredentials = Boolean(
    credential.access_token_encrypted?.trim() || credential.refresh_token_encrypted?.trim()
  );

  let githubAppConnected = false;
  let githubAppConnectionState: GitHubAppConnectionState = "not_connected";
  let githubAppConnectionMessage: string | null = null;

  if (authMode === "github") {
    try {
      const connectionStatus = await getGitHubAppConnectionStatusForUser({
        supabase,
        userId: user.id
      });
      githubAppConnected = connectionStatus.connected;
      githubAppConnectionState = connectionStatus.state;
      githubAppConnectionMessage = connectionStatus.message;
    } catch {
      githubAppConnected = false;
      githubAppConnectionState = "unknown";
      githubAppConnectionMessage = "Could not verify GitHub App installation right now.";
    }
  }

  return safeJson(200, {
    auth_mode: authMode,
    github_app_connected: githubAppConnected,
    has_stored_credentials: hasStoredCredentials,
    github_app_connection_state: githubAppConnectionState,
    github_app_connection_message: githubAppConnectionMessage
  });
};


Deno.serve((request) => runHandler(request, handler));
