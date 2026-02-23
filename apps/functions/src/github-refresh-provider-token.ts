import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import {
  refreshGitHubAppUserToken,
  upsertGitHubAppUserCredentials
} from "./github-auth-broker";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
const GITHUB_TOKEN_DEBUG = /^(1|true|yes|on)$/i.test(process.env.GITHUB_TOKEN_DEBUG ?? "");

type RefreshProviderTokenBody = {
  provider_refresh_token?: string;
};

const debugLog = (message: string, details: Record<string, unknown>) => {
  if (!GITHUB_TOKEN_DEBUG) return;
  console.log("[github-refresh-provider-token]", message, details);
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const parseBody = (rawBody: string | null): RefreshProviderTokenBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as RefreshProviderTokenBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const getBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader) return "";
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or service-role API key."
    });
  }

  let body: RefreshProviderTokenBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload."
    });
  }

  const providerRefreshToken = body.provider_refresh_token?.trim() ?? "";
  if (!providerRefreshToken) {
    return safeJson(400, { error: "Missing provider_refresh_token." });
  }

  const supabaseAccessToken = getBearerToken(event.headers.authorization);
  if (!supabaseAccessToken) {
    return safeJson(401, { error: "Missing Authorization bearer token." });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(supabaseAccessToken);

  if (userError || !user) {
    return safeJson(401, { error: "Invalid Supabase session." });
  }

  debugLog("refresh requested", {
    userId: user.id,
    providerRefreshTokenLength: providerRefreshToken.length
  });

  try {
    const refreshed = await refreshGitHubAppUserToken(providerRefreshToken, "legacy_oauth");

    debugLog("refresh succeeded", {
      userId: user.id,
      hasNextProviderToken: Boolean(refreshed.accessToken),
      hasNextProviderRefreshToken: Boolean(refreshed.refreshToken),
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt
    });

    await upsertGitHubAppUserCredentials({
      supabase,
      input: {
        userId: user.id,
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
        refreshToken: refreshed.refreshToken || providerRefreshToken,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
        tokenType: refreshed.tokenType,
        scope: refreshed.scope,
        source: "refresh_provider_token_function"
      }
    });

    return safeJson(200, {
      provider_token: refreshed.accessToken,
      provider_refresh_token: refreshed.refreshToken || providerRefreshToken,
      access_token_expires_at: refreshed.accessTokenExpiresAt,
      refresh_token_expires_at: refreshed.refreshTokenExpiresAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub token refresh failed.";
    return safeJson(502, { error: message });
  }
};
