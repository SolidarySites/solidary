import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_DELETE_REPO_SECRET_KEY = process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? "";

type CollaboratorRole = "admin" | "editor" | "viewer";
type AuthUserRow = {
  id: string;
  email: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

const roleToGithubPermission: Record<CollaboratorRole, "admin" | "push" | "pull"> = {
  admin: "admin",
  editor: "push",
  viewer: "pull"
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

const isCollaboratorRole = (value: unknown): value is CollaboratorRole =>
  value === "admin" || value === "editor" || value === "viewer";

const looksLikeEmail = (value: string) => value.includes("@");

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
  return null;
};

const readAuthUserById = async (
  supabase: any,
  userId: string
): Promise<AuthUserRow | null> => {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.user) return null;

  return {
    id: typeof data.user.id === "string" ? data.user.id : "",
    email: typeof data.user.email === "string" ? data.user.email : null,
    raw_user_meta_data:
      data.user.raw_user_meta_data && typeof data.user.raw_user_meta_data === "object"
        ? (data.user.raw_user_meta_data as Record<string, unknown>)
        : null
  };
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
});

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
  const identifier = typeof payload.identifier === "string" ? payload.identifier.trim() : "";
  const githubToken = typeof payload.githubToken === "string" ? payload.githubToken.trim() : "";
  const solidaryUserId =
    typeof payload.solidaryUserId === "string" && payload.solidaryUserId.trim()
      ? payload.solidaryUserId.trim()
      : null;
  const role = isCollaboratorRole(payload.role) ? payload.role : null;

  if (!draftId || !identifier || !githubToken || !role) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing draftId, identifier, githubToken, or role." })
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
    .select("id, owner_user_id, repo_full_name")
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
  if (draft.owner_user_id !== user.id) {
    return {
      statusCode: 403,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Only owners can invite collaborators." })
    };
  }

  const [owner, repo] =
    typeof draft.repo_full_name === "string" ? draft.repo_full_name.split("/") : [];
  if (!owner || !repo) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Draft is missing a valid GitHub repository." })
    };
  }

  let inviteTarget = identifier.startsWith("@") ? identifier.slice(1).trim() : identifier;
  let matchedSolidaryUserId: string | null = solidaryUserId;

  if (solidaryUserId) {
    const authUser = await readAuthUserById(supabase, solidaryUserId);
    if (!authUser?.id) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Selected Solidary user was not found." })
      };
    }
    const login = getGithubLoginFromMetadata(authUser.raw_user_meta_data);
    inviteTarget = login || authUser.email?.trim() || inviteTarget;
  }

  if (!inviteTarget) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invite target is empty." })
    };
  }

  const githubPermission = roleToGithubPermission[role];
  const inviteByEmail = looksLikeEmail(inviteTarget);

  let githubResponse: Response;
  if (inviteByEmail) {
    githubResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/invitations`, {
      method: "POST",
      headers: githubHeaders(githubToken),
      body: JSON.stringify({
        email: inviteTarget,
        permissions: githubPermission
      })
    });
  } else {
    githubResponse = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(inviteTarget)}`,
      {
        method: "PUT",
        headers: githubHeaders(githubToken),
        body: JSON.stringify({
          permission: githubPermission
        })
      }
    );
  }

  if (!githubResponse.ok) {
    const errorPayload = (await githubResponse.json().catch(() => ({}))) as {
      message?: string;
    };
    const errorMessage =
      typeof errorPayload.message === "string" && errorPayload.message.trim()
        ? errorPayload.message.trim()
        : "GitHub collaborator invite failed.";
    return {
      statusCode: githubResponse.status,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: errorMessage })
    };
  }

  if (matchedSolidaryUserId && matchedSolidaryUserId !== user.id) {
    const { error: membershipError } = await supabase.from("site_admins").upsert(
      {
        site_id: draftId,
        user_id: matchedSolidaryUserId,
        role
      },
      { onConflict: "site_id,user_id" }
    );

    if (membershipError) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: `GitHub invite sent, but failed to grant Solidary access: ${membershipError.message}`
        })
      };
    }
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      target: inviteTarget,
      inviteMode: inviteByEmail ? "email" : "username"
    })
  };
};
