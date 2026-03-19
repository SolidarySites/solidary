import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  HttpError,
  authorizeGitHubRepoAction
} from "../_shared/github-repo-guardrails.ts";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SOLIDARY_SECRET_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

const requireEnv = () => {
  if (!SUPABASE_URL || !SOLIDARY_SECRET_KEY) {
    return "Missing SUPABASE_URL or Supabase service key.";
  }
  return null;
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
});

const hasWriteAccessPermission = (permission: string | null | undefined) => {
  const value = (permission ?? "").toLowerCase().trim();
  return value === "admin" || value === "maintain" || value === "write" || value === "push";
};

const getGithubLoginFromMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  const candidates = [
    metadata?.user_name,
    metadata?.preferred_username,
    metadata?.login
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const envError = requireEnv();
  if (envError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: envError })
    };
  }

  const accessToken = parseBearerToken(
    event.headers.authorization ?? event.headers.Authorization
  );
  if (!accessToken) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing bearer token." })
    };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON payload." })
    };
  }

  const draftId = typeof payload.draftId === "string" ? payload.draftId.trim() : "";
  const siteIdFromPayload = typeof payload.siteId === "string" ? payload.siteId.trim() : "";
  if (!draftId && !siteIdFromPayload) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing draftId or siteId." })
    };
  }

  const supabase = createClient(SUPABASE_URL, SOLIDARY_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized." })
    };
  }

  const loadDraftById = async () =>
    supabase
      .from("site_drafts")
      .select("id, site_id, repo_full_name, draft_type")
      .eq("id", draftId)
      .maybeSingle();
  const loadOwnerDraftBySite = async () =>
    supabase
      .from("site_drafts")
      .select("id, site_id, repo_full_name, draft_type")
      .eq("site_id", siteIdFromPayload)
      .eq("draft_type", "owner")
      .limit(1)
      .maybeSingle();

  const { data: draft, error: draftError } =
    draftId && !siteIdFromPayload ? await loadDraftById() : await loadOwnerDraftBySite();

  if (draftError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: draftError.message })
    };
  }
  if (!draft) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Draft not found." })
    };
  }

  const siteId = typeof draft.site_id === "string" && draft.site_id.trim() ? draft.site_id : draft.id;

  const { data: membership, error: membershipError } = await supabase
    .from("site_admins")
    .select("role")
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: membershipError.message })
    };
  }
  if (!membership || membership.role !== "admin") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: membership?.role ?? null,
        demoted: false,
        githubPermission: null
      })
    };
  }

  const githubLogin = getGithubLoginFromMetadata(
    (user.user_metadata ?? {}) as Record<string, unknown>
  );
  if (!githubLogin) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "editor",
        demoted: true,
        githubPermission: null,
        reason: "Missing GitHub username in profile metadata."
      })
    };
  }

  const [owner, repo] =
    typeof draft.repo_full_name === "string" ? draft.repo_full_name.split("/") : [];
  if (!owner || !repo) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Draft has an invalid repo_full_name." })
    };
  }

  let resolvedGitHubToken = "";
  try {
    const authorized = await authorizeGitHubRepoAction({
      functionName: "sync-admin-role-from-github",
      action: "sync_admin_role_from_github",
      owner,
      repo,
      supabaseAccessToken: accessToken,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });
    resolvedGitHubToken = authorized.githubToken;
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        statusCode: error.statusCode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: error.message })
      };
    }
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Could not authorize GitHub access."
      })
    };
  }

  const permissionResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(githubLogin)}/permission`,
    {
      method: "GET",
      headers: githubHeaders(resolvedGitHubToken)
    }
  );

  let githubPermission: string | null = null;
  if (permissionResponse.ok) {
    const permissionPayload = (await permissionResponse.json().catch(() => ({}))) as {
      permission?: string;
    };
    githubPermission =
      typeof permissionPayload.permission === "string" ? permissionPayload.permission : null;
  }

  // Treat any write-level collaborator permission as sufficient to keep Solidary admin.
  // This prevents false demotions on personal repositories where GitHub may not expose
  // collaborator "admin" as a distinct permission.
  const shouldDemote = !hasWriteAccessPermission(githubPermission);

  if (!shouldDemote) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "admin",
        demoted: false,
        githubPermission
      })
    };
  }

  const { error: demoteError } = await supabase
    .from("site_admins")
    .update({ role: "editor" })
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (demoteError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: demoteError.message })
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      role: "editor",
      demoted: true,
      githubPermission
    })
  };
};


Deno.serve((request) => runHandler(request, handler));
