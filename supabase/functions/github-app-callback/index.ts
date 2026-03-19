import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  exchangeCodeForGitHubAppUserToken,
  upsertGitHubAppUserCredentials
} from "../_shared/github-auth-broker.ts";
import { createGitHubAppState, parseGitHubAppState } from "../_shared/github-app-state.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const GITHUB_APP_STATE_SECRET = Deno.env.get("GITHUB_APP_STATE_SECRET") ?? SUPABASE_SERVICE_KEY;
const GITHUB_APP_CLIENT_ID = Deno.env.get("GITHUB_APP_CLIENT_ID") ?? "";
const GITHUB_API = "https://api.github.com";
const GITHUB_TOKEN_DEBUG = /^(1|true|yes|on)$/i.test(Deno.env.get("GITHUB_TOKEN_DEBUG") ?? "");

type GitHubUserPayload = {
  id?: number;
  login?: string;
  message?: string;
};

type GitHubInstallationPayload = {
  id?: number;
  account?: {
    login?: string;
    type?: string;
  };
};

type GitHubInstallationsListPayload = {
  total_count?: number;
  installations?: GitHubInstallationPayload[];
  message?: string;
};

const safeRedirect = (location: string) => ({
  statusCode: 302,
  headers: {
    location
  },
  body: ""
});

const parsePositiveInt = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const resolveOrigin = (event: Parameters<Handler>[0]) => {
  const rawUrl = event.rawUrl?.trim();
  if (rawUrl) {
    try {
      return new URL(rawUrl).origin;
    } catch {
      // Fall through to forwarded headers.
    }
  }

  const forwardedHost = event.headers["x-forwarded-host"] ?? event.headers.host;
  const forwardedProto = event.headers["x-forwarded-proto"] ?? "https";
  const host = forwardedHost?.trim() ?? "";
  if (!host) {
    throw new Error("Missing request host header.");
  }
  return `${forwardedProto}://${host}`;
};

const buildRedirectPath = ({
  baseOrigin,
  returnTo,
  status,
  message
}: {
  baseOrigin: string;
  returnTo: string;
  status: "connected" | "error";
  message?: string;
}) => {
  const redirectUrl = new URL(returnTo, baseOrigin);
  redirectUrl.searchParams.set("github_app", status);
  if (message) {
    redirectUrl.searchParams.set("github_app_message", message);
  }
  return redirectUrl.toString();
};

const buildGitHubAuthorizeUrl = (state: string) => {
  const clientId = GITHUB_APP_CLIENT_ID.trim();
  if (!clientId) {
    throw new Error("GitHub App connect is missing GITHUB_APP_CLIENT_ID.");
  }
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("allow_signup", "false");
  return authorizeUrl.toString();
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
});

const debugLog = (message: string, details: Record<string, unknown>) => {
  if (!GITHUB_TOKEN_DEBUG) return;
  console.log("[github-app-callback]", message, details);
};

const summarizeTokenShape = (value: string) => ({
  length: value.length,
  hasWhitespace: /[\s\r\n\t]/.test(value),
  hasControlChars: /[\u0000-\u001F\u007F]/.test(value),
  hasNonAscii: /[^\x00-\x7F]/.test(value),
  firstCodePoints: Array.from(value)
    .slice(0, 8)
    .map((char) => char.codePointAt(0) ?? 0)
});

const fetchGitHubUser = async (accessToken: string) => {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: githubHeaders(accessToken)
  });
  const payload = (await response.json().catch(() => ({}))) as GitHubUserPayload;
  debugLog("fetched GitHub user", {
    status: response.status,
    hasId: Boolean(payload.id),
    login: payload.login ?? null,
    message: payload.message ?? null
  });
  if (!response.ok || !payload.id || !payload.login) {
    const message =
      payload.message?.trim() || `Failed to read GitHub user profile (${response.status}).`;
    throw new Error(message);
  }
  return payload;
};

const fetchInstallationMetadata = async ({
  accessToken,
  installationId
}: {
  accessToken: string;
  installationId: number | null;
}): Promise<GitHubInstallationPayload | null> => {
  if (!installationId) return null;

  const response = await fetch(`${GITHUB_API}/user/installations?per_page=100`, {
    headers: githubHeaders(accessToken)
  });
  const payload = (await response
    .json()
    .catch(() => ({}))) as GitHubInstallationsListPayload;
  const installationList = Array.isArray(payload.installations) ? payload.installations : [];
  debugLog("fetched installations for callback", {
    status: response.status,
    installationId,
    totalCount:
      typeof payload.total_count === "number" && Number.isFinite(payload.total_count)
        ? payload.total_count
        : null,
    listedInstallations: installationList.length,
    message: payload.message ?? null
  });
  if (!response.ok) {
    return null;
  }

  const matched = installationList.find((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return parsePositiveInt(String(item.id ?? "")) === installationId;
  });
  return matched ?? null;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const origin = resolveOrigin(event);
  const params = new URLSearchParams(event.rawQuery ?? "");
  const stateParam = params.get("state")?.trim() ?? "";
  const code = params.get("code")?.trim() ?? "";
  const oauthError = params.get("error")?.trim() ?? "";
  const oauthErrorDescription = params.get("error_description")?.trim() ?? "";
  const setupAction = params.get("setup_action")?.trim() ?? "";
  const installationIdFromQuery = parsePositiveInt(params.get("installation_id"));

  debugLog("received callback", {
    hasState: Boolean(stateParam),
    hasCode: Boolean(code),
    setupAction: setupAction || null,
    installationId: installationIdFromQuery
  });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: origin,
        returnTo: "/studio",
        status: "error",
        message: "Supabase service configuration missing."
      })
    );
  }

  if (!stateParam || !GITHUB_APP_STATE_SECRET) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: origin,
        returnTo: "/studio",
        status: "error",
        message: "GitHub connect state is missing."
      })
    );
  }

  let parsedState: {
    userId: string;
    returnTo: string;
    returnOrigin: string | null;
    installationId: number | null;
  };
  try {
    parsedState = parseGitHubAppState({
      encodedState: stateParam,
      secret: GITHUB_APP_STATE_SECRET
    });
  } catch (error) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: origin,
        returnTo: "/studio",
        status: "error",
        message: error instanceof Error ? error.message : "Invalid GitHub connect state."
      })
    );
  }
  const redirectBaseOrigin = parsedState.returnOrigin ?? origin;

  const redirectError = oauthErrorDescription || oauthError;
  if (redirectError) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: redirectBaseOrigin,
        returnTo: parsedState.returnTo,
        status: "error",
        message: redirectError
      })
    );
  }

  if (!code) {
    if (setupAction || installationIdFromQuery) {
      try {
        const nextState = createGitHubAppState({
          userId: parsedState.userId,
          returnTo: parsedState.returnTo,
          returnOrigin: parsedState.returnOrigin,
          installationId: installationIdFromQuery ?? parsedState.installationId,
          secret: GITHUB_APP_STATE_SECRET
        });
        debugLog("redirecting installation callback to OAuth authorize", {
          setupAction: setupAction || null,
          installationIdFromQuery,
          installationIdFromState: parsedState.installationId
        });
        return safeRedirect(buildGitHubAuthorizeUrl(nextState));
      } catch (error) {
        return safeRedirect(
          buildRedirectPath({
            baseOrigin: redirectBaseOrigin,
            returnTo: parsedState.returnTo,
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not continue GitHub App authorization."
          })
        );
      }
    }

    return safeRedirect(
      buildRedirectPath({
        baseOrigin: redirectBaseOrigin,
        returnTo: parsedState.returnTo,
        status: "error",
        message: "GitHub did not return an authorization code."
      })
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const exchanged = await exchangeCodeForGitHubAppUserToken(code);
    debugLog("exchanged code for token", {
      accessTokenShape: summarizeTokenShape(exchanged.accessToken),
      hasRefreshToken: Boolean(exchanged.refreshToken),
      refreshTokenShape: exchanged.refreshToken ? summarizeTokenShape(exchanged.refreshToken) : null,
      accessTokenExpiresAt: exchanged.accessTokenExpiresAt,
      refreshTokenExpiresAt: exchanged.refreshTokenExpiresAt,
      tokenType: exchanged.tokenType,
      scope: exchanged.scope
    });
    const githubUser = await fetchGitHubUser(exchanged.accessToken);
    const installationId = installationIdFromQuery ?? parsedState.installationId;
    const installation = await fetchInstallationMetadata({
      accessToken: exchanged.accessToken,
      installationId
    });
    debugLog("resolved installation metadata", {
      installationIdFromQuery: installationId,
      matchedInstallationId: installation?.id ?? null,
      installationAccountLogin: installation?.account?.login ?? null,
      installationAccountType: installation?.account?.type ?? null
    });

    await upsertGitHubAppUserCredentials({
      supabase,
      input: {
        userId: parsedState.userId,
        authMode: "github",
        githubUserId: githubUser.id ?? null,
        githubLogin: githubUser.login ?? null,
        installationId: installation?.id ?? installationId ?? null,
        installationAccountLogin: installation?.account?.login ?? null,
        installationAccountType: installation?.account?.type ?? null,
        accessToken: exchanged.accessToken,
        accessTokenExpiresAt: exchanged.accessTokenExpiresAt,
        refreshToken: exchanged.refreshToken || undefined,
        refreshTokenExpiresAt: exchanged.refreshToken
          ? exchanged.refreshTokenExpiresAt
          : undefined,
        tokenType: exchanged.tokenType,
        scope: exchanged.scope,
        source: "github_app_callback"
      }
    });

    return safeRedirect(
      buildRedirectPath({
        baseOrigin: redirectBaseOrigin,
        returnTo: parsedState.returnTo,
        status: "connected"
      })
    );
  } catch (error) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: redirectBaseOrigin,
        returnTo: parsedState.returnTo,
        status: "error",
        message: error instanceof Error ? error.message : "GitHub connect failed."
      })
    );
  }
};


Deno.serve((request) => runHandler(request, handler));
