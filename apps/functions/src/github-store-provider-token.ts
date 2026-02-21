import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { upsertGitHubAppUserCredentials } from "./github-auth-broker";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
const GITHUB_API = "https://api.github.com";
const GITHUB_TOKEN_DEBUG = /^(1|true|yes|on)$/i.test(process.env.GITHUB_TOKEN_DEBUG ?? "");

type StoreProviderTokenBody = {
  provider_token?: string;
  provider_refresh_token?: string;
  debug_trigger?: string;
  session_has_provider_token?: boolean;
  session_has_provider_refresh_token?: boolean;
};

type GitHubUserPayload = {
  id?: number;
  login?: string;
};

const debugLog = (message: string, details: Record<string, unknown>) => {
  if (!GITHUB_TOKEN_DEBUG) return;
  console.log("[github-store-provider-token]", message, details);
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const parseBody = (rawBody: string | null): StoreProviderTokenBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as StoreProviderTokenBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const fetchGitHubUser = async (providerToken: string): Promise<GitHubUserPayload | null> => {
  try {
    const response = await fetch(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${providerToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!response.ok) return null;
    return (await response.json().catch(() => null)) as GitHubUserPayload | null;
  } catch {
    return null;
  }
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

  let body: StoreProviderTokenBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload."
    });
  }

  const providerToken = body.provider_token?.trim() ?? "";
  const providerRefreshToken = body.provider_refresh_token?.trim() ?? "";
  if (!providerToken) {
    return safeJson(400, { error: "Missing provider_token." });
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

  debugLog("received sync request", {
    userId: user.id,
    trigger: body.debug_trigger ?? "unknown",
    sessionHasProviderToken: body.session_has_provider_token ?? null,
    sessionHasProviderRefreshToken: body.session_has_provider_refresh_token ?? null,
    providerTokenLength: providerToken.length,
    hasProviderRefreshToken: Boolean(providerRefreshToken)
  });

  const githubUser = await fetchGitHubUser(providerToken);

  try {
    await upsertGitHubAppUserCredentials({
      supabase,
      input: {
        userId: user.id,
        githubUserId: githubUser?.id ?? null,
        githubLogin: githubUser?.login ?? null,
        accessToken: providerToken,
        refreshToken: providerRefreshToken || undefined,
        tokenType: "bearer",
        source: "provider_sync"
      }
    });
  } catch (error) {
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Failed to store provider token."
    });
  }

  const { data: storedRow, error: storedRowError } = await supabase
    .from("github_app_user_tokens")
    .select(
      "access_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at, updated_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const storedRowObject =
    storedRow && typeof storedRow === "object" && !Array.isArray(storedRow)
      ? (storedRow as {
          access_token_encrypted?: string | null;
          refresh_token_encrypted?: string | null;
          access_token_expires_at?: string | null;
          refresh_token_expires_at?: string | null;
          updated_at?: string | null;
        })
      : null;

  if (!storedRowError && storedRowObject) {
    debugLog("stored row after sync", {
      userId: user.id,
      hasAccessTokenEncrypted: Boolean(storedRowObject.access_token_encrypted?.trim()),
      hasRefreshTokenEncrypted: Boolean(storedRowObject.refresh_token_encrypted?.trim()),
      accessTokenExpiresAt: storedRowObject.access_token_expires_at ?? null,
      refreshTokenExpiresAt: storedRowObject.refresh_token_expires_at ?? null,
      updatedAt: storedRowObject.updated_at ?? null
    });
  } else if (storedRowError) {
    debugLog("failed to read stored row", {
      userId: user.id,
      message: storedRowError.message
    });
  }

  return safeJson(200, {
    ok: true,
    debug: GITHUB_TOKEN_DEBUG
      ? {
          trigger: body.debug_trigger ?? "unknown",
          has_provider_refresh_token: Boolean(providerRefreshToken),
          stored_refresh_token_encrypted: Boolean(storedRowObject?.refresh_token_encrypted?.trim()),
          access_token_expires_at: storedRowObject?.access_token_expires_at ?? null,
          refresh_token_expires_at: storedRowObject?.refresh_token_expires_at ?? null
        }
      : undefined
  });
};
