import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import {
  exchangeCodeForGitHubAppUserToken,
  upsertGitHubAppUserCredentials
} from "./github-auth-broker";
import { parseGitHubAppState } from "./github-app-state";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
const GITHUB_APP_STATE_SECRET = process.env.GITHUB_APP_STATE_SECRET ?? SUPABASE_SERVICE_KEY;
const GITHUB_API = "https://api.github.com";

type GitHubUserPayload = {
  id?: number;
  login?: string;
};

type GitHubInstallationPayload = {
  id?: number;
  account?: {
    login?: string;
    type?: string;
  };
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
  origin,
  returnTo,
  status,
  message
}: {
  origin: string;
  returnTo: string;
  status: "connected" | "error";
  message?: string;
}) => {
  const redirectUrl = new URL(returnTo, origin);
  redirectUrl.searchParams.set("github_app", status);
  if (message) {
    redirectUrl.searchParams.set("github_app_message", message);
  }
  return redirectUrl.toString();
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
});

const fetchGitHubUser = async (accessToken: string) => {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: githubHeaders(accessToken)
  });
  const payload = (await response.json().catch(() => ({}))) as GitHubUserPayload & {
    message?: string;
  };
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

  const response = await fetch(`${GITHUB_API}/user/installations/${installationId}`, {
    headers: githubHeaders(accessToken)
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json().catch(() => null)) as GitHubInstallationPayload | null;
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeRedirect(
      buildRedirectPath({
        origin,
        returnTo: "/studio",
        status: "error",
        message: "Supabase service configuration missing."
      })
    );
  }

  if (!stateParam || !GITHUB_APP_STATE_SECRET) {
    return safeRedirect(
      buildRedirectPath({
        origin,
        returnTo: "/studio",
        status: "error",
        message: "GitHub connect state is missing."
      })
    );
  }

  let parsedState: { userId: string; returnTo: string };
  try {
    parsedState = parseGitHubAppState({
      encodedState: stateParam,
      secret: GITHUB_APP_STATE_SECRET
    });
  } catch (error) {
    return safeRedirect(
      buildRedirectPath({
        origin,
        returnTo: "/studio",
        status: "error",
        message: error instanceof Error ? error.message : "Invalid GitHub connect state."
      })
    );
  }

  const redirectError = oauthErrorDescription || oauthError;
  if (redirectError) {
    return safeRedirect(
      buildRedirectPath({
        origin,
        returnTo: parsedState.returnTo,
        status: "error",
        message: redirectError
      })
    );
  }

  if (!code) {
    return safeRedirect(
      buildRedirectPath({
        origin,
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
    const githubUser = await fetchGitHubUser(exchanged.accessToken);
    const installationId = parsePositiveInt(params.get("installation_id"));
    const installation = await fetchInstallationMetadata({
      accessToken: exchanged.accessToken,
      installationId
    });

    await upsertGitHubAppUserCredentials({
      supabase,
      input: {
        userId: parsedState.userId,
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
        origin,
        returnTo: parsedState.returnTo,
        status: "connected"
      })
    );
  } catch (error) {
    return safeRedirect(
      buildRedirectPath({
        origin,
        returnTo: parsedState.returnTo,
        status: "error",
        message: error instanceof Error ? error.message : "GitHub connect failed."
      })
    );
  }
};
