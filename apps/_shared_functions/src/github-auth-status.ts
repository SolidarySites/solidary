import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
const TOKEN_EXPIRY_SKEW_MS = 90 * 1000;

type StoredCredentialRow = {
  auth_mode?: string | null;
  access_token_encrypted?: string | null;
  access_token_expires_at?: string | null;
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

const hasUsableAccessToken = (
  accessToken: string,
  accessTokenExpiresAt: string | null | undefined
) => {
  if (!accessToken) return false;
  if (!accessTokenExpiresAt) return true;
  const expiresAtMs = Date.parse(accessTokenExpiresAt);
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs - Date.now() > TOKEN_EXPIRY_SKEW_MS;
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
    .select("auth_mode, access_token_encrypted, access_token_expires_at, refresh_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return safeJson(500, { error: error.message });
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return safeJson(200, {
      auth_mode: "solidary",
      github_app_connected: false,
      has_stored_credentials: false
    });
  }

  const credential = data as StoredCredentialRow;
  const authMode = normalizeGitHubAuthMode(credential.auth_mode);
  const accessToken = credential.access_token_encrypted?.trim() ?? "";
  const refreshToken = credential.refresh_token_encrypted?.trim() ?? "";
  const hasStoredCredentials = Boolean(accessToken || refreshToken);
  const githubAppConnected =
    authMode === "github" &&
    (hasUsableAccessToken(accessToken, credential.access_token_expires_at) || Boolean(refreshToken));

  return safeJson(200, {
    auth_mode: authMode,
    github_app_connected: githubAppConnected,
    has_stored_credentials: hasStoredCredentials
  });
};
