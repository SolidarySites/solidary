import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  exchangeSupabaseManagementAuthorizationCode,
  upsertSupabaseManagementConnection,
} from "../_shared/supabase-management-auth/index.ts";
import { resolveSupabaseManagementRedirectUri } from "../_shared/supabase-management-auth/redirect-uri.ts";
import { parseSupabaseManagementState } from "../_shared/supabase-management-auth/state.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ??
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const SUPA_MANAGEMENT_OAUTH_STATE_SECRET =
  Deno.env.get("SUPA_MANAGEMENT_OAUTH_STATE_SECRET") ?? SUPABASE_SERVICE_KEY;
const SUPA_MANAGEMENT_OAUTH_REDIRECT_URI =
  Deno.env.get("SUPA_MANAGEMENT_OAUTH_REDIRECT_URI") ?? "";

const safeRedirect = (location: string) => ({
  statusCode: 302,
  headers: {
    location,
  },
  body: "",
});

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
  message,
}: {
  baseOrigin: string;
  returnTo: string;
  status: "connected" | "error";
  message?: string;
}) => {
  const redirectUrl = new URL(returnTo, baseOrigin);
  redirectUrl.searchParams.set("supabase_management", status);
  if (message) {
    redirectUrl.searchParams.set("supabase_management_message", message);
  }
  return redirectUrl.toString();
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
        baseOrigin: origin,
        returnTo: "/profile",
        status: "error",
        message: "Supabase service configuration missing.",
      }),
    );
  }

  if (!stateParam || !SUPA_MANAGEMENT_OAUTH_STATE_SECRET) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: origin,
        returnTo: "/profile",
        status: "error",
        message: "Supabase connection state is missing.",
      }),
    );
  }

  let parsedState: {
    userId: string;
    returnTo: string;
    returnOrigin: string | null;
    codeVerifier: string;
  };
  try {
    parsedState = parseSupabaseManagementState({
      encodedState: stateParam,
      secret: SUPA_MANAGEMENT_OAUTH_STATE_SECRET,
    });
  } catch (error) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: origin,
        returnTo: "/profile",
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Invalid Supabase connection state.",
      }),
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
        message: redirectError,
      }),
    );
  }

  if (!code) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: redirectBaseOrigin,
        returnTo: parsedState.returnTo,
        status: "error",
        message: "Supabase did not return an authorization code.",
      }),
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const callbackUrl = resolveSupabaseManagementRedirectUri({
      explicitRedirectUri: SUPA_MANAGEMENT_OAUTH_REDIRECT_URI,
      supabaseUrl: SUPABASE_URL,
    });
    const exchanged = await exchangeSupabaseManagementAuthorizationCode({
      code,
      redirectUri: callbackUrl,
      codeVerifier: parsedState.codeVerifier,
    });
    await upsertSupabaseManagementConnection({
      supabase,
      input: {
        userId: parsedState.userId,
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        tokenType: exchanged.tokenType,
        scope: exchanged.scope,
        accessTokenExpiresAt: exchanged.accessTokenExpiresAt,
        refreshTokenExpiresAt: exchanged.refreshTokenExpiresAt,
      },
    });
  } catch (error) {
    return safeRedirect(
      buildRedirectPath({
        baseOrigin: redirectBaseOrigin,
        returnTo: parsedState.returnTo,
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Could not connect your Supabase account.",
      }),
    );
  }

  return safeRedirect(
    buildRedirectPath({
      baseOrigin: redirectBaseOrigin,
      returnTo: parsedState.returnTo,
      status: "connected",
      message: "Supabase account connected.",
    }),
  );
};

Deno.serve((request) => runHandler(request, handler));
