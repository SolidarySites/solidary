import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { getSupabaseManagementConnectionStatusForUser } from "../_shared/supabase-management-auth/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

export const handler: Handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or Supabase service key."
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

  try {
    const status = await getSupabaseManagementConnectionStatusForUser({
      supabase,
      userId: user.id
    });
    return safeJson(200, {
      connected: status.connected,
      state: status.state,
      message: status.message,
      granted_scopes: status.grantedScopes,
      organizations: status.organizations,
      projects: status.projects,
      projects_truncated: status.projectsTruncated
    });
  } catch (error) {
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Could not read Supabase connection status."
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
