import type { Handler } from "@netlify/functions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGitHubAppState } from "./github-app-state";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG ?? "";
const GITHUB_APP_STATE_SECRET = process.env.GITHUB_APP_STATE_SECRET ?? SUPABASE_SERVICE_KEY;

type ConnectStartBody = {
  return_to?: string;
  force?: boolean;
};

type StoredGitHubAppCredential = {
  access_token?: string | null;
  access_token_expires_at?: string | null;
  refresh_token?: string | null;
};

const TOKEN_EXPIRY_SKEW_MS = 90 * 1000;

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const parseBody = (rawBody: string | null): ConnectStartBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as ConnectStartBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
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

const hasExistingGitHubAppConnection = async ({
  supabase,
  userId
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<boolean> => {
  const { data, error } = await supabase
    .from("github_app_user_tokens")
    .select("access_token, access_token_expires_at, refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object" || Array.isArray(data) || "error" in data) {
    return false;
  }

  const credential = data as StoredGitHubAppCredential;
  const accessToken = credential.access_token?.trim() ?? "";
  const refreshToken = credential.refresh_token?.trim() ?? "";

  if (hasUsableAccessToken(accessToken, credential.access_token_expires_at)) {
    return true;
  }

  return Boolean(refreshToken);
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or Supabase service key."
    });
  }
  if (!GITHUB_APP_SLUG || !GITHUB_APP_STATE_SECRET) {
    return safeJson(500, {
      error: "GitHub App connect flow is not configured."
    });
  }

  let body: ConnectStartBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload."
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

  const state = createGitHubAppState({
    userId: user.id,
    returnTo: body.return_to,
    secret: GITHUB_APP_STATE_SECRET
  });

  const forceConnect = Boolean(body.force);
  if (!forceConnect) {
    const connected = await hasExistingGitHubAppConnection({
      supabase,
      userId: user.id
    });
    if (connected) {
      return safeJson(200, {
        connected: true
      });
    }
  }

  const connectUrl = new URL(`https://github.com/apps/${encodeURIComponent(GITHUB_APP_SLUG)}/installations/new`);
  connectUrl.searchParams.set("state", state);

  return safeJson(200, {
    connected: false,
    url: connectUrl.toString()
  });
};
