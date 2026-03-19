import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  getGitHubCredentialPresenceForUser,
  resolveGitHubTokenForUser,
} from "../_shared/github-auth-broker.ts";
import { getSupabaseManagementConnectionStatusForUser } from "../_shared/supabase-management-auth/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ??
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const WORKER_PATH = "/functions/v1/index-create-worker-background";

const REQUIRED_SUPABASE_MANAGEMENT_SCOPES = [
  "organizations:read",
  "projects:read",
  "projects:write",
  "database:write",
  "secrets:read",
  "secrets:write",
] as const;

type IndexCreateBody = {
  name?: string;
  title?: string;
  description?: string;
  organization_id?: string;
  image_content_b64?: string;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (rawBody: string | null): IndexCreateBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as IndexCreateBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const normalizeScope = (value: string) => value.trim().toLowerCase();

const hasRequiredScopes = (grantedScopes: string[]) => {
  // Supabase may omit the `scope` field from OAuth token responses even when
  // the token can use the required Management API endpoints.
  if (!grantedScopes.length) {
    return true;
  }

  const granted = new Set(grantedScopes.map(normalizeScope).filter(Boolean));
  return REQUIRED_SUPABASE_MANAGEMENT_SCOPES.every((scope) =>
    granted.has(scope)
  );
};

const resolveWorkerUrl = () => {
  try {
    return new URL(WORKER_PATH, SUPABASE_URL).toString();
  } catch {
    throw new Error("Invalid SUPABASE_URL while constructing worker URL.");
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or Supabase service key.",
    });
  }

  let body: IndexCreateBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload.",
    });
  }

  const repoName = body.name?.trim() ?? "";
  const title = body.title?.trim() ?? "";
  const description = body.description?.trim() ?? "";
  const organizationId = body.organization_id?.trim() ?? "";
  const imageContentB64 = body.image_content_b64?.trim() ?? "";

  if (!repoName || !title || !description || !organizationId) {
    return safeJson(400, {
      error: "Missing name, title, description, or organization_id.",
    });
  }

  const supabaseAccessToken = parseBearerToken(
    event.headers.authorization ?? event.headers.Authorization,
  );
  if (!supabaseAccessToken) {
    return safeJson(401, { error: "Missing bearer token." });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(supabaseAccessToken);
  if (userError || !user) {
    return safeJson(401, { error: "Invalid Supabase session." });
  }

  const resolvedGitHubAuth = await resolveGitHubTokenForUser({
    supabase,
    userId: user.id,
  });
  if (!resolvedGitHubAuth?.token) {
    const credentialPresence = await getGitHubCredentialPresenceForUser({
      supabase,
      userId: user.id,
    }).catch(() => null);
    return safeJson(412, {
      error: credentialPresence?.hasGitHubRow
        ? "GitHub App authorization is required for index provisioning. Reconnect GitHub App from Profile and retry."
        : "GitHub authorization missing. Sign in with GitHub again from Profile settings and retry.",
    });
  }

  const supabaseStatus = await getSupabaseManagementConnectionStatusForUser({
    supabase,
    userId: user.id,
  });
  if (!supabaseStatus.connected) {
    return safeJson(412, {
      error:
        "Supabase account connection is required before creating an index.",
    });
  }
  if (!hasRequiredScopes(supabaseStatus.grantedScopes)) {
    return safeJson(412, {
      error:
        "Reconnect your Supabase account from Profile so Solidary can create projects and bootstrap the database.",
    });
  }

  const selectedOrganization =
    supabaseStatus.organizations.find((organization) =>
      organization.id === organizationId
    ) ?? null;
  if (!selectedOrganization) {
    return safeJson(403, {
      error:
        "Selected Supabase organization is not available for the connected account.",
    });
  }
  if (!selectedOrganization.slug) {
    return safeJson(412, {
      error:
        "Selected Supabase organization is missing a slug and cannot be used for project creation.",
    });
  }

  const { data: job, error: insertError } = await supabase
    .from("index_provision_jobs")
    .insert({
      owner_user_id: user.id,
      status: "queued",
      step: "Queued for index creation...",
    })
    .select("id,status,step")
    .single();

  if (insertError || !job?.id) {
    return safeJson(500, {
      error: insertError?.message ?? "Failed to create index provisioning job.",
    });
  }

  let dispatchResponse: Response;
  try {
    dispatchResponse = await fetch(resolveWorkerUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "x-provision-internal-key": SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        jobId: job.id,
        ownerUserId: user.id,
        name: repoName,
        title,
        description,
        organizationId: selectedOrganization.id,
        organizationSlug: selectedOrganization.slug,
        organizationName: selectedOrganization.name,
        imageContentB64,
      }),
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Failed to dispatch index provisioning worker.";
    await supabase
      .from("index_provision_jobs")
      .update({
        status: "failed",
        step: "Failed to start background provisioning worker.",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("owner_user_id", user.id);
    return safeJson(500, { error: message });
  }

  if (![200, 202].includes(dispatchResponse.status)) {
    const rawBody = await dispatchResponse.text().catch(() => "");
    let message =
      `Background worker dispatch failed with status ${dispatchResponse.status}.`;
    if (rawBody.trim()) {
      try {
        const payload = JSON.parse(rawBody) as { error?: string };
        if (payload.error?.trim()) {
          message = payload.error.trim();
        }
      } catch {
        message = `${message} ${rawBody.trim().slice(0, 300)}`;
      }
    }

    await supabase
      .from("index_provision_jobs")
      .update({
        status: "failed",
        step: "Failed to start background provisioning worker.",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("owner_user_id", user.id);
    return safeJson(500, { error: message });
  }

  return safeJson(200, {
    job: {
      id: job.id,
      status: job.status,
      step: job.step,
    },
  });
};

Deno.serve((request) => runHandler(request, handler));
