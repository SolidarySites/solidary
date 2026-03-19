import { runHandler } from "../_shared/request-adapter.ts";
import { Buffer } from "node:buffer";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  upsertGitHubAppUserCredentials,
  type GitHubAuthMode
} from "../_shared/github-auth-broker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const GITHUB_API = "https://api.github.com";
const GITHUB_OAUTH_CLIENT_ID = Deno.env.get("GITHUB_OAUTH_CLIENT_ID") ?? "";
const GITHUB_OAUTH_CLIENT_SECRET = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET") ?? "";
const GITHUB_TOKEN_DEBUG = /^(1|true|yes|on)$/i.test(Deno.env.get("GITHUB_TOKEN_DEBUG") ?? "");

type StoreProviderTokenBody = {
  provider_token?: string;
  provider_refresh_token?: string;
  force_auth_mode?: string;
  debug_trigger?: string;
  session_has_provider_token?: boolean;
  session_has_provider_refresh_token?: boolean;
};

type GitHubUserPayload = {
  id?: number;
  login?: string;
};

type GitHubOAuthTokenCheckPayload = {
  token?: string;
  expires_at?: string | null;
  app?: {
    name?: string;
    client_id?: string;
  };
  message?: string;
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

const normalizeGitHubAuthMode = (value: unknown): GitHubAuthMode => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "github" ? "github" : "solidary";
};

const normalizeStoredProviderToken = (value: string) =>
  value
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/[\s\r\n\t]+/g, "");

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

const checkGitHubOAuthToken = async (providerToken: string) => {
  if (!GITHUB_OAUTH_CLIENT_ID || !GITHUB_OAUTH_CLIENT_SECRET) {
    return {
      configured: false,
      checked: false
    } as const;
  }

  const basicAuth = Buffer.from(
    `${GITHUB_OAUTH_CLIENT_ID}:${GITHUB_OAUTH_CLIENT_SECRET}`,
    "utf8"
  ).toString("base64");

  try {
    const response = await fetch(
      `${GITHUB_API}/applications/${encodeURIComponent(GITHUB_OAUTH_CLIENT_ID)}/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          access_token: providerToken
        })
      }
    );

    const payload = (await response
      .json()
      .catch(() => ({}))) as GitHubOAuthTokenCheckPayload;

    return {
      configured: true,
      checked: true,
      status: response.status,
      ok: response.ok,
      appClientId: payload.app?.client_id ?? null,
      appName: payload.app?.name ?? null,
      expiresAt: payload.expires_at ?? null,
      hasTokenInResponse: Boolean(payload.token?.trim()),
      message: payload.message?.trim() ?? null
    } as const;
  } catch (error) {
    return {
      configured: true,
      checked: false,
      error: error instanceof Error ? error.message : "unknown error"
    } as const;
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

  const forceAuthMode = body.force_auth_mode === "solidary" ? "solidary" : null;
  if (body.force_auth_mode && !forceAuthMode) {
    return safeJson(400, {
      error: "Invalid force_auth_mode. Only \"solidary\" is supported."
    });
  }

  const providerToken = normalizeStoredProviderToken(body.provider_token ?? "");
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
    forceAuthMode,
    providerTokenPrefix: providerToken.slice(0, 4),
    providerTokenLength: providerToken.length,
    hasProviderRefreshToken: Boolean(providerRefreshToken)
  });

  const tokenCheck = await checkGitHubOAuthToken(providerToken);
  if (GITHUB_TOKEN_DEBUG) {
    debugLog("oauth token check", tokenCheck as Record<string, unknown>);
  }

  let accessTokenExpiresAt: string | null | undefined;
  if (tokenCheck.configured && tokenCheck.checked) {
    accessTokenExpiresAt = tokenCheck.expiresAt ?? null;
  }

  const githubUser = await fetchGitHubUser(providerToken);

  try {
    await upsertGitHubAppUserCredentials({
      supabase,
      input: {
        userId: user.id,
        authMode: "solidary",
        githubUserId: githubUser?.id ?? null,
        githubLogin: githubUser?.login ?? null,
        accessToken: providerToken,
        accessTokenExpiresAt,
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
      [
        "auth_mode",
        "access_token_encrypted",
        "refresh_token_encrypted",
        "access_token_expires_at",
        "refresh_token_expires_at",
        "updated_at"
      ].join(", ")
    )
    .eq("user_id", user.id)
    .eq("auth_mode", "solidary")
    .maybeSingle();

  const storedRowObject =
    storedRow && typeof storedRow === "object" && !Array.isArray(storedRow)
      ? (storedRow as {
          auth_mode?: GitHubAuthMode | null;
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
      authMode: normalizeGitHubAuthMode(storedRowObject.auth_mode),
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
    auth_mode: normalizeGitHubAuthMode(storedRowObject?.auth_mode ?? null),
    mode_switched: false,
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


Deno.serve((request) => runHandler(request, handler));
