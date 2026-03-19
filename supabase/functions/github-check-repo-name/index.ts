import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  getGitHubCredentialPresenceForUser,
  resolveGitHubTokenForUser
} from "../_shared/github-auth-broker.ts";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";

type CheckRepoNameBody = {
  name?: string;
};

type GitHubUserPayload = {
  login?: string;
};

type GitHubRepoPayload = {
  html_url?: string;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const parseBody = (rawBody: string | null): CheckRepoNameBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as CheckRepoNameBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
});

const isHeaderSafeToken = (value: string) => /^[\x21-\x7E]+$/.test(value);

const normalizeRepoName = (value: string) => value.trim();

const isValidRepoName = (value: string) =>
  value.length > 0 && value.length <= 100 && /^[A-Za-z0-9._-]+$/.test(value);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, { error: "Missing SUPABASE_URL or Supabase service key." });
  }

  let body: CheckRepoNameBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, { error: error instanceof Error ? error.message : "Invalid payload." });
  }

  const repoName = normalizeRepoName(body.name ?? "");
  if (!isValidRepoName(repoName)) {
    return safeJson(400, { error: "Invalid repository name." });
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

  const resolvedGitHubAuth = await resolveGitHubTokenForUser({
    supabase,
    userId: user.id
  });
  const githubToken = resolvedGitHubAuth?.token?.trim() ?? "";
  if (!githubToken) {
    const credentialPresence = await getGitHubCredentialPresenceForUser({
      supabase,
      userId: user.id
    }).catch(() => null);
    return safeJson(412, {
      error: credentialPresence?.hasGitHubRow
        ? "GitHub App authorization is required for owner repository actions. Solidary OAuth fallback is disabled for owner repositories. Reconnect GitHub App from Profile and retry."
        : "GitHub authorization missing. Reconnect GitHub from Profile settings and retry."
    });
  }
  if (!isHeaderSafeToken(githubToken)) {
    return safeJson(412, {
      error: "Stored GitHub token is invalid. Reconnect GitHub from Profile settings and retry."
    });
  }

  let githubUserResponse: Response;
  try {
    githubUserResponse = await fetch(`${GITHUB_API}/user`, {
      method: "GET",
      headers: githubHeaders(githubToken)
    });
  } catch (error) {
    return safeJson(412, {
      error:
        error instanceof Error &&
          /headers.+ByteString/i.test(error.message)
          ? "Stored GitHub token is invalid. Reconnect GitHub from Profile settings and retry."
          : "Could not verify your GitHub account."
    });
  }
  const githubUserPayload = (await githubUserResponse
    .json()
    .catch(() => ({}))) as GitHubUserPayload & { message?: string };

  if (!githubUserResponse.ok) {
    const errorMessage =
      githubUserPayload.message?.trim() || "Could not verify your GitHub account.";
    return safeJson(githubUserResponse.status === 401 || githubUserResponse.status === 403 ? 412 : 502, {
      error: errorMessage
    });
  }

  const ownerLogin = githubUserPayload.login?.trim() ?? "";
  if (!ownerLogin) {
    return safeJson(502, { error: "GitHub user profile is missing login." });
  }

  let repoResponse: Response;
  try {
    repoResponse = await fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(ownerLogin)}/${encodeURIComponent(repoName)}`,
      {
        method: "GET",
        headers: githubHeaders(githubToken)
      }
    );
  } catch (error) {
    return safeJson(412, {
      error:
        error instanceof Error &&
          /headers.+ByteString/i.test(error.message)
          ? "Stored GitHub token is invalid. Reconnect GitHub from Profile settings and retry."
          : "Could not check repository availability."
    });
  }

  if (repoResponse.status === 404) {
    return safeJson(200, {
      exists: false,
      owner_login: ownerLogin,
      repo_name: repoName,
      repositories_url: `https://github.com/${ownerLogin}?tab=repositories`
    });
  }

  const repoPayload = (await repoResponse.json().catch(() => ({}))) as GitHubRepoPayload & {
    message?: string;
  };
  if (!repoResponse.ok) {
    const errorMessage = repoPayload.message?.trim() || "Could not check repository availability.";
    return safeJson(repoResponse.status === 401 || repoResponse.status === 403 ? 412 : 502, {
      error: errorMessage
    });
  }

  return safeJson(200, {
    exists: true,
    owner_login: ownerLogin,
    repo_name: repoName,
    repo_url: repoPayload.html_url?.trim() || `https://github.com/${ownerLogin}/${repoName}`,
    repositories_url: `https://github.com/${ownerLogin}?tab=repositories`
  });
};


Deno.serve((request) => runHandler(request, handler));
