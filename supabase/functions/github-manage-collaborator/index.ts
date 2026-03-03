import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  HttpError,
  authorizeGitHubRepoAction
} from "../_shared/github-repo-guardrails.ts";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const DELETE_REPO_SUPABASE_SECRET_KEY = Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ?? "";

type CollaboratorRole = "admin" | "editor" | "contributor";
type ParsedCollaboratorRole = CollaboratorRole | "viewer";
type ManageAction = "update_role" | "remove";

type AuthUserRow = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  app_metadata: Record<string, unknown> | null;
  identities: Array<Record<string, unknown>>;
};

const roleToGithubPermission: Record<Exclude<CollaboratorRole, "contributor">, "admin" | "push"> = {
  admin: "admin",
  editor: "push"
};

const requireEnv = () => {
  if (!SUPABASE_URL || !DELETE_REPO_SUPABASE_SECRET_KEY) {
    return "Missing SUPABASE_URL or DELETE_REPO_SUPABASE_SECRET_KEY.";
  }
  return null;
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const isCollaboratorRole = (value: unknown): value is ParsedCollaboratorRole =>
  value === "admin" || value === "editor" || value === "contributor" || value === "viewer";

const isManageAction = (value: unknown): value is ManageAction =>
  value === "update_role" || value === "remove";

const normalizeGithubIdentifier = (value: string) =>
  value.startsWith("@") ? value.slice(1).trim() : value.trim();

const asRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const getGithubLoginFromMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  const candidates = [
    metadata?.user_name,
    metadata?.preferred_username,
    metadata?.login,
    metadata?.userName,
    metadata?.username
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
};

const getGithubLoginFromAuthUser = (authUser: AuthUserRow | null) => {
  if (!authUser) return null;

  const metadataLogin =
    getGithubLoginFromMetadata(authUser.user_metadata) ??
    getGithubLoginFromMetadata(authUser.raw_user_meta_data) ??
    getGithubLoginFromMetadata(authUser.app_metadata);
  if (metadataLogin) return normalizeGithubIdentifier(metadataLogin);

  for (const identity of authUser.identities) {
    const provider = typeof identity.provider === "string" ? identity.provider : "";
    if (provider !== "github") continue;
    const identityData = asRecord(identity.identity_data);
    const login = getGithubLoginFromMetadata(identityData);
    if (login) return normalizeGithubIdentifier(login);
  }

  return null;
};

const readAuthUserById = async (supabase: any, userId: string): Promise<AuthUserRow | null> => {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.user) return null;

  const userRecord = data.user as unknown as Record<string, unknown>;

  return {
    id: typeof data.user.id === "string" ? data.user.id : "",
    email: typeof data.user.email === "string" ? data.user.email : null,
    user_metadata: asRecord(userRecord.user_metadata),
    raw_user_meta_data: asRecord(userRecord.raw_user_meta_data),
    app_metadata: asRecord(userRecord.app_metadata),
    identities: Array.isArray(userRecord.identities)
      ? (userRecord.identities as Array<Record<string, unknown>>)
      : []
  };
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
});

const githubErrorMessage = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return fallback;
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

  const supabaseAccessToken = parseBearerToken(
    event.headers.authorization ?? event.headers.Authorization
  );
  if (!supabaseAccessToken) {
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
  const githubToken = typeof payload.githubToken === "string" ? payload.githubToken.trim() : "";
  const collaboratorUserId =
    typeof payload.collaboratorUserId === "string" ? payload.collaboratorUserId.trim() : "";
  const action = isManageAction(payload.action) ? payload.action : null;
  const parsedRole = isCollaboratorRole(payload.role) ? payload.role : null;
  const role = parsedRole === "viewer" ? "contributor" : parsedRole;

  if (!draftId || !collaboratorUserId || !action) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Missing draftId, collaboratorUserId, or action."
      })
    };
  }
  if (action === "update_role" && !role) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing role for update_role action." })
    };
  }

  if (action === "update_role" && role === "contributor") {
    return {
      statusCode: 422,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error:
          "Contributor role updates are not available yet. Use Editor or Admin for now."
      })
    };
  }

  const supabase = createClient(SUPABASE_URL, DELETE_REPO_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(supabaseAccessToken);

  if (userError || !user) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized." })
    };
  }

  const { data: draft, error: draftError } = await supabase
    .from("site_drafts")
    .select("id, site_id, owner_user_id, repo_full_name, draft_type")
    .eq("id", draftId)
    .maybeSingle();

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
  if (draft.owner_user_id !== user.id || draft.draft_type !== "owner") {
    return {
      statusCode: 403,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Only owners can manage collaborators." })
    };
  }

  if (collaboratorUserId === user.id) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "You cannot modify your own owner access." })
    };
  }

  const siteId = typeof draft.site_id === "string" && draft.site_id.trim() ? draft.site_id : draft.id;
  const [owner, repo] =
    typeof draft.repo_full_name === "string" ? draft.repo_full_name.split("/") : [];
  if (!owner || !repo) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Draft is missing a valid GitHub repository." })
    };
  }

  let authorizedGitHubToken = githubToken;
  try {
    const authorized = await authorizeGitHubRepoAction({
      functionName: "github-manage-collaborator",
      action,
      owner,
      repo,
      directToken: githubToken,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });
    authorizedGitHubToken = authorized.githubToken;
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

  const { data: membership, error: membershipError } = await supabase
    .from("site_admins")
    .select("role")
    .eq("site_id", siteId)
    .eq("user_id", collaboratorUserId)
    .maybeSingle();

  if (membershipError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: membershipError.message })
    };
  }
  if (!membership) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Collaborator record not found." })
    };
  }

  const authUser = await readAuthUserById(supabase, collaboratorUserId);
  const githubLogin = getGithubLoginFromAuthUser(authUser);
  if (!githubLogin) {
    return {
      statusCode: 422,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error:
          "Collaborator is missing a GitHub username. Ask them to sign in with GitHub again."
      })
    };
  }

  if (action === "update_role") {
    const githubPermission = roleToGithubPermission[role];
    const githubResponse = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(githubLogin)}`,
      {
        method: "PUT",
        headers: githubHeaders(authorizedGitHubToken),
        body: JSON.stringify({ permission: githubPermission })
      }
    );
    if (!githubResponse.ok) {
      const message = await githubErrorMessage(
        githubResponse,
        "Failed to update collaborator permission on GitHub."
      );
      return {
        statusCode: githubResponse.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: message })
      };
    }

    const { error: upsertError } = await supabase.from("site_admins").upsert(
      {
        site_id: siteId,
        user_id: collaboratorUserId,
        role
      },
      { onConflict: "site_id,user_id" }
    );
    if (upsertError) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: upsertError.message })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        action,
        role
      })
    };
  }

  const githubResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(githubLogin)}`,
    {
      method: "DELETE",
      headers: githubHeaders(authorizedGitHubToken)
    }
  );

  if (!githubResponse.ok) {
    const message = await githubErrorMessage(
      githubResponse,
      "Failed to remove collaborator from GitHub."
    );
    return {
      statusCode: githubResponse.status,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: message })
    };
  }

  const { error: deleteError } = await supabase
    .from("site_admins")
    .delete()
    .eq("site_id", siteId)
    .eq("user_id", collaboratorUserId);

  if (deleteError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: deleteError.message })
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      action
    })
  };
};


Deno.serve((request) => runHandler(request, handler));
