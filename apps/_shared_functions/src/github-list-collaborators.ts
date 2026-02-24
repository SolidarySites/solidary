import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import {
  HttpError,
  authorizeGitHubRepoAction
} from "./github-repo-guardrails";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_DELETE_REPO_SECRET_KEY = process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? "";

type CollaboratorRole = "admin" | "editor" | "viewer";

type SiteAdminRow = {
  user_id: string;
  role: CollaboratorRole;
};

type AuthUserRow = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  app_metadata: Record<string, unknown> | null;
  identities: Array<Record<string, unknown>>;
};

type CollaboratorSyncState = "synced" | "pending_invite" | "unknown";

type CollaboratorResponseRow = {
  userId: string;
  role: CollaboratorRole;
  email: string;
  displayName: string;
  githubLogin: string | null;
  syncState: CollaboratorSyncState;
};

const requireEnv = () => {
  if (!SUPABASE_URL || !SUPABASE_DELETE_REPO_SECRET_KEY) {
    return "Missing SUPABASE_URL or SUPABASE_DELETE_REPO_SECRET_KEY.";
  }
  return null;
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const asRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const normalizeGithubIdentifier = (value: string) =>
  value.startsWith("@") ? value.slice(1).trim() : value.trim();

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

const getDisplayNameFromAuthUser = (authUser: AuthUserRow | null) => {
  if (!authUser) return "Unknown user";
  const metadataDisplayName =
    (authUser.raw_user_meta_data?.name as string | undefined) ??
    (authUser.user_metadata?.name as string | undefined) ??
    (authUser.raw_user_meta_data?.full_name as string | undefined) ??
    (authUser.user_metadata?.full_name as string | undefined) ??
    (authUser.raw_user_meta_data?.user_name as string | undefined) ??
    (authUser.user_metadata?.user_name as string | undefined);
  if (typeof metadataDisplayName === "string" && metadataDisplayName.trim()) {
    return metadataDisplayName.trim();
  }
  if (authUser.email?.trim()) return authUser.email.trim();
  return "Unknown user";
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

const toCollaboratorRoleFromPermission = (permission: string | null): CollaboratorRole => {
  const value = (permission ?? "").toLowerCase().trim();
  if (value === "admin") return "admin";
  if (value === "maintain" || value === "write" || value === "push") return "editor";
  return "viewer";
};

const hasWriteAccessPermission = (permission: string | null) => {
  const value = (permission ?? "").toLowerCase().trim();
  return value === "admin" || value === "maintain" || value === "write" || value === "push";
};

const listPendingInviteLogins = async ({
  githubToken,
  owner,
  repo
}: {
  githubToken: string;
  owner: string;
  repo: string;
}) => {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/invitations?per_page=100`,
    {
      method: "GET",
      headers: githubHeaders(githubToken)
    }
  );
  if (!response.ok) {
    return new Set<string>();
  }

  const payload = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
  const result = new Set<string>();
  payload.forEach((entry) => {
    const invitee = asRecord(entry.invitee);
    const login =
      typeof invitee?.login === "string" && invitee.login.trim()
        ? invitee.login.trim().toLowerCase()
        : "";
    if (login) result.add(login);
  });
  return result;
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
  const syncRoles = payload.syncRoles !== false;
  if (!draftId) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing draftId." })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_DELETE_REPO_SECRET_KEY, {
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
      functionName: "github-list-collaborators",
      action: "list_collaborators",
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

  const pendingInviteLogins = await listPendingInviteLogins({
    githubToken: authorizedGitHubToken,
    owner,
    repo
  });

  const { data: memberships, error: membershipsError } = await supabase
    .from("site_admins")
    .select("user_id, role")
    .eq("site_id", siteId)
    .order("role", { ascending: true });

  if (membershipsError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: membershipsError.message })
    };
  }

  let updatedCount = 0;
  let removedCount = 0;
  const collaborators: CollaboratorResponseRow[] = [];

  for (const membership of (memberships ?? []) as SiteAdminRow[]) {
    const authUser = await readAuthUserById(supabase, membership.user_id).catch(() => null);
    const githubLogin = getGithubLoginFromAuthUser(authUser);
    const email = authUser?.email?.trim() ?? "";
    const displayName = getDisplayNameFromAuthUser(authUser);

    if (!githubLogin) {
      collaborators.push({
        userId: membership.user_id,
        role: membership.role,
        email,
        displayName,
        githubLogin: null,
        syncState: "unknown"
      });
      continue;
    }

    const permissionResponse = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(githubLogin)}/permission`,
      {
        method: "GET",
        headers: githubHeaders(authorizedGitHubToken)
      }
    );

    if (permissionResponse.ok) {
      const permissionPayload = (await permissionResponse.json().catch(() => ({}))) as {
        permission?: string;
      };
      const githubRole = toCollaboratorRoleFromPermission(permissionPayload.permission ?? null);

      // Preserve Solidary admin/editor roles when GitHub still reports write-level access.
      // This avoids downgrading admin -> editor on personal repos where admin permission
      // may not be represented by the GitHub collaborator permission endpoint.
      if (
        syncRoles &&
        githubRole === "viewer" &&
        !hasWriteAccessPermission(permissionPayload.permission ?? null) &&
        membership.role !== "viewer"
      ) {
        const { error: updateError } = await supabase
          .from("site_admins")
          .update({ role: "viewer" })
          .eq("site_id", siteId)
          .eq("user_id", membership.user_id);
        if (!updateError) {
          membership.role = "viewer";
          updatedCount += 1;
        }
      }

      collaborators.push({
        userId: membership.user_id,
        role: membership.role,
        email,
        displayName,
        githubLogin,
        syncState: "synced"
      });
      continue;
    }

    if (permissionResponse.status === 404) {
      const hasPendingInvite = pendingInviteLogins.has(githubLogin.toLowerCase());
      if (hasPendingInvite) {
        collaborators.push({
          userId: membership.user_id,
          role: membership.role,
          email,
          displayName,
          githubLogin,
          syncState: "pending_invite"
        });
        continue;
      }

      if (syncRoles) {
        const { error: deleteError } = await supabase
          .from("site_admins")
          .delete()
          .eq("site_id", siteId)
          .eq("user_id", membership.user_id);

        if (!deleteError) {
          removedCount += 1;
          continue;
        }
      }
    }

    collaborators.push({
      userId: membership.user_id,
      role: membership.role,
      email,
      displayName,
      githubLogin,
      syncState: "unknown"
    });
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      collaborators,
      updatedCount,
      removedCount
    })
  };
};
