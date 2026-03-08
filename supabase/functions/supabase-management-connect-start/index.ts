import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  createSupabaseManagementCodeChallenge,
  createSupabaseManagementCodeVerifier,
  createSupabaseManagementState
} from "../_shared/supabase-management-auth/state.ts";
import { getSupabaseManagementConnectionStatusForUser } from "../_shared/supabase-management-auth/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ?? Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const SUPABASE_MANAGEMENT_OAUTH_CLIENT_ID =
  Deno.env.get("SUPABASE_MANAGEMENT_OAUTH_CLIENT_ID") ?? "";
const SUPABASE_MANAGEMENT_OAUTH_STATE_SECRET =
  Deno.env.get("SUPABASE_MANAGEMENT_OAUTH_STATE_SECRET") ?? SUPABASE_SERVICE_KEY;
const SUPABASE_MANAGEMENT_AUTHORIZE_URL = "https://api.supabase.com/v1/oauth/authorize";
const SUPABASE_MANAGEMENT_OAUTH_SCOPES = [
  "organizations:read",
  "projects:read",
  "projects:write"
].join(" ");

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

const resolveFunctionOrigin = (event: Parameters<Handler>[0]) => {
  const rawUrl = event.rawUrl?.trim() ?? "";
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
  if (host) {
    return `${forwardedProto}://${host}`;
  }

  if (SUPABASE_URL.trim()) {
    return new URL(SUPABASE_URL).origin;
  }

  throw new Error("Missing request host header.");
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

  if (!SUPABASE_MANAGEMENT_OAUTH_CLIENT_ID || !SUPABASE_MANAGEMENT_OAUTH_STATE_SECRET) {
    return safeJson(500, {
      error: "Supabase management OAuth is not configured."
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

  const forceConnect = Boolean(body.force);
  if (!forceConnect) {
    const status = await getSupabaseManagementConnectionStatusForUser({
      supabase,
      userId: user.id
    });
    if (status.connected) {
      return safeJson(200, {
        connected: true
      });
    }
  }

  const callbackUrl = new URL(
    "/functions/v1/supabase-management-callback",
    resolveFunctionOrigin(event)
  );
  const codeVerifier = createSupabaseManagementCodeVerifier();
  const state = createSupabaseManagementState({
    userId: user.id,
    returnTo: body.return_to,
    returnOrigin: resolveRequestOrigin(event),
    codeVerifier,
    secret: SUPABASE_MANAGEMENT_OAUTH_STATE_SECRET
  });
  const authorizeUrl = new URL(SUPABASE_MANAGEMENT_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", SUPABASE_MANAGEMENT_OAUTH_CLIENT_ID.trim());
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", SUPABASE_MANAGEMENT_OAUTH_SCOPES);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set(
    "code_challenge",
    createSupabaseManagementCodeChallenge(codeVerifier)
  );

  return safeJson(200, {
    connected: false,
    url: authorizeUrl.toString()
  });
};

Deno.serve((request) => runHandler(request, handler));
