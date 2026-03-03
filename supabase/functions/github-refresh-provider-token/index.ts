import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ?? Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const GITHUB_OAUTH_CLIENT_ID = Deno.env.get("GITHUB_OAUTH_CLIENT_ID") ?? "";
const GITHUB_OAUTH_CLIENT_SECRET = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET") ?? "";
const GITHUB_TOKEN_DEBUG = /^(1|true|yes|on)$/i.test(Deno.env.get("GITHUB_TOKEN_DEBUG") ?? "");

type RefreshProviderTokenBody = {
  provider_refresh_token?: string;
};

type GitHubTokenRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
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

  if (!GITHUB_OAUTH_CLIENT_ID || !GITHUB_OAUTH_CLIENT_SECRET) {
    return safeJson(500, {
      error:
        "GitHub OAuth refresh is not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET."
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

  let githubResponse: Response;
  try {
    githubResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: GITHUB_OAUTH_CLIENT_ID,
        client_secret: GITHUB_OAUTH_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: providerRefreshToken
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to contact GitHub OAuth endpoint.";
    return safeJson(502, { error: message });
  }

  const payload = (await githubResponse.json().catch(() => ({}))) as GitHubTokenRefreshResponse;
  const providerToken = payload.access_token?.trim() ?? "";
  const nextProviderRefreshToken = payload.refresh_token?.trim() ?? providerRefreshToken;

  if (!githubResponse.ok || !providerToken) {
    const errorMessage =
      payload.error_description?.trim() ||
      payload.error?.trim() ||
      "GitHub did not return a refreshed access token.";
    return safeJson(githubResponse.status === 400 || githubResponse.status === 401 ? 401 : 502, {
      error: errorMessage
    });
  }

  debugLog("refresh succeeded", {
    userId: user.id,
    hasNextProviderToken: Boolean(providerToken),
    hasNextProviderRefreshToken: Boolean(nextProviderRefreshToken),
    expiresIn: payload.expires_in ?? null,
    refreshTokenExpiresIn: payload.refresh_token_expires_in ?? null
  });

  return safeJson(200, {
    provider_token: providerToken,
    provider_refresh_token: nextProviderRefreshToken,
    expires_in: payload.expires_in,
    refresh_token_expires_in: payload.refresh_token_expires_in
  });
};


Deno.serve((request) => runHandler(request, handler));
