import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { upsertGitHubAppUserCredentials } from "./github-auth-broker";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
const GITHUB_API = "https://api.github.com";

type StoreProviderTokenBody = {
  provider_token?: string;
  provider_refresh_token?: string;
};

type GitHubUserPayload = {
  id?: number;
  login?: string;
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

  const githubUser = await fetchGitHubUser(providerToken);

  try {
    await upsertGitHubAppUserCredentials({
      supabase,
      input: {
        userId: user.id,
        githubUserId: githubUser?.id ?? null,
        githubLogin: githubUser?.login ?? null,
        accessToken: providerToken,
        refreshToken: providerRefreshToken || null,
        tokenType: "bearer",
        scope: null
      }
    });
  } catch (error) {
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Failed to store provider token."
    });
  }

  return safeJson(200, { ok: true });
};
