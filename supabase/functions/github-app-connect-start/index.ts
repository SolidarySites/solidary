import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { createGitHubAppState } from "../_shared/github-app-state.ts";
import { getGitHubAppConnectionStatusForUser } from "../_shared/github-auth-broker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ?? Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const GITHUB_APP_SLUG = Deno.env.get("GITHUB_APP_SLUG") ?? "";
const GITHUB_APP_STATE_SECRET = Deno.env.get("GITHUB_APP_STATE_SECRET") ?? SUPABASE_SERVICE_KEY;

type ConnectStartBody = {
  return_to?: string;
  force?: boolean;
};

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

const parseOriginFromHeaderValue = (value: string | undefined): string | null => {
  const candidate = value?.trim() ?? "";
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

const resolveRequestOrigin = (event: Parameters<Handler>[0]): string | null => {
  return (
    parseOriginFromHeaderValue(event.headers.origin) ||
    parseOriginFromHeaderValue(event.headers.Origin) ||
    parseOriginFromHeaderValue(event.headers.referer) ||
    parseOriginFromHeaderValue(event.headers.Referer)
  );
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
    returnOrigin: resolveRequestOrigin(event),
    secret: GITHUB_APP_STATE_SECRET
  });

  const forceConnect = Boolean(body.force);
  if (!forceConnect) {
    const status = await getGitHubAppConnectionStatusForUser({
      supabase,
      userId: user.id
    });
    if (status.connected) {
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


Deno.serve((request) => runHandler(request, handler));
