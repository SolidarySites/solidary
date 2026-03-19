import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  getGitHubAppConnectionStatusForUser,
  getGitHubCredentialPresenceForUser,
  resolveGitHubTokenForUserByMode,
  type GitHubTokenSource
} from "./github-auth-broker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY =
  Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";

type AuditDecision = "allowed" | "denied" | "error";
type TokenSourceWithNone = GitHubTokenSource | "none";
type RepoAccessScope = "owner" | "collaborator" | "none";

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

export const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const normalizeRepoFullName = (owner: string, repo: string) =>
  `${owner.trim()}/${repo.trim()}`.toLowerCase();

const buildSupabaseAdmin = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new HttpError(500, "Missing SUPABASE_URL or Supabase service key.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

const buildOwnerGitHubAppRequiredMessage = ({
  owner,
  repo
}: {
  owner: string;
  repo: string;
}) =>
  `GitHub App authorization is required for owner repository ${owner}/${repo}. Solidary OAuth fallback is disabled for owner repositories. Reconnect GitHub App from Profile and retry.`;

const buildGitHubAppTokenInvalidMessage = () =>
  "GitHub App authorization is invalid or expired. Solidary OAuth fallback is disabled for owner repositories. Reconnect GitHub App from Profile and retry.";

const buildCollaboratorSolidaryRequiredMessage = ({ owner, repo }: { owner: string; repo: string }) =>
  `Solidary OAuth authorization is required for collaboration repository ${owner}/${repo}. Sign in with GitHub again from Profile to refresh your Solidary OAuth token.`;

export const mapGitHubApiFailureToActionableAuthMessage = ({
  tokenSource,
  owner,
  repo,
  repoScope,
  statusCode,
  message
}: {
  tokenSource: TokenSourceWithNone;
  owner: string;
  repo: string;
  repoScope?: RepoAccessScope;
  statusCode: number;
  message: string;
}) => {
  const normalizedMessage = message.trim();
  const isRepoAuth404 =
    statusCode === 404 && /not found|resource not accessible|repository/i.test(normalizedMessage);

  if (
    repoScope === "collaborator" &&
    tokenSource === "solidary" &&
    (statusCode === 401 || statusCode === 403 || isRepoAuth404)
  ) {
    return buildCollaboratorSolidaryRequiredMessage({ owner, repo });
  }

  if (tokenSource !== "github") {
    return normalizedMessage || message;
  }

  if (statusCode === 401 || statusCode === 403) {
    return buildOwnerGitHubAppRequiredMessage({ owner, repo });
  }

  if (isRepoAuth404) {
    return buildOwnerGitHubAppRequiredMessage({ owner, repo });
  }

  if (repoScope === "owner") {
    return normalizedMessage || buildGitHubAppTokenInvalidMessage();
  }
  return normalizedMessage || buildGitHubAppTokenInvalidMessage();
};

const getRepoAccessScopeForUser = async ({
  supabase,
  userId,
  owner,
  repo
}: {
  supabase: SupabaseClient;
  userId: string;
  owner: string;
  repo: string;
}) => {
  const repoFullName = normalizeRepoFullName(owner, repo);

  const { data: ownedDrafts, error: ownedDraftsError } = await supabase
    .from("site_drafts")
    .select("repo_full_name")
    .eq("owner_user_id", userId);

  if (ownedDraftsError) {
    throw new HttpError(500, ownedDraftsError.message);
  }

  if (
    (ownedDrafts ?? []).some(
      (row) =>
        typeof row.repo_full_name === "string" &&
        row.repo_full_name.trim().toLowerCase() === repoFullName
    )
  ) {
    return "owner" satisfies RepoAccessScope;
  }

  const { data: provisionJobs, error: provisionJobsError } = await supabase
    .from("repo_provision_jobs")
    .select("repo_full_name")
    .eq("owner_user_id", userId)
    .in("status", ["queued", "running", "succeeded"])
    .not("repo_full_name", "is", null);

  if (provisionJobsError) {
    throw new HttpError(500, provisionJobsError.message);
  }

  if (
    (provisionJobs ?? []).some(
      (row) =>
        typeof row.repo_full_name === "string" &&
        row.repo_full_name.trim().toLowerCase() === repoFullName
    )
  ) {
    return "owner" satisfies RepoAccessScope;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("site_admins")
    .select("site_id")
    .eq("user_id", userId)
    .in("role", ["admin", "editor", "contributor", "viewer"]);

  if (membershipError) {
    throw new HttpError(500, membershipError.message);
  }

  const siteIds = (memberships ?? [])
    .map((row) => (typeof row.site_id === "string" ? row.site_id : ""))
    .filter(Boolean);
  if (!siteIds.length) return "none";

  const { data: ownerDrafts, error: ownerDraftsError } = await supabase
    .from("site_drafts")
    .select("repo_full_name")
    .eq("draft_type", "owner")
    .in("site_id", siteIds);

  if (ownerDraftsError) {
    throw new HttpError(500, ownerDraftsError.message);
  }

  const hasCollaboratorRepo = (ownerDrafts ?? []).some(
    (row) =>
      typeof row.repo_full_name === "string" &&
      row.repo_full_name.trim().toLowerCase() === repoFullName
  );
  return hasCollaboratorRepo ? "collaborator" : "none";
};

export const auditGitHubRepoAction = async ({
  supabase,
  userId,
  functionName,
  action,
  owner,
  repo,
  decision,
  tokenSource,
  httpStatus,
  message,
  metadata
}: {
  supabase: SupabaseClient;
  userId?: string | null;
  functionName: string;
  action: string;
  owner: string;
  repo: string;
  decision: AuditDecision;
  tokenSource?: GitHubTokenSource | "none";
  httpStatus?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}) => {
  const repoFullName = owner && repo ? `${owner}/${repo}` : null;

  const { error } = await supabase.from("github_repo_action_audit_logs").insert({
    user_id: userId ?? null,
    function_name: functionName,
    action,
    owner: owner || null,
    repo: repo || null,
    repo_full_name: repoFullName,
    decision,
    token_source: tokenSource ?? null,
    http_status: Number.isFinite(httpStatus) ? httpStatus : null,
    message: message?.trim() || null,
    metadata: metadata ?? {}
  });

  if (error) {
    console.log("[github-repo-guardrails] failed to insert audit record", {
      functionName,
      action,
      message: error.message
    });
  }
};

export const authorizeGitHubRepoAction = async ({
  functionName,
  action,
  owner,
  repo,
  directToken,
  supabaseAccessToken,
  authorizationHeader,
  requireGitHubToken = true
}: {
  functionName: string;
  action: string;
  owner: string;
  repo: string;
  directToken?: string;
  supabaseAccessToken?: string;
  authorizationHeader?: string;
  requireGitHubToken?: boolean;
}): Promise<{
  supabase: SupabaseClient;
  userId: string;
  githubToken: string;
  tokenSource: TokenSourceWithNone;
  repoScope: RepoAccessScope;
}> => {
  const normalizedOwner = owner.trim();
  const normalizedRepo = repo.trim();
  if (!normalizedOwner || !normalizedRepo) {
    throw new HttpError(400, "Missing owner or repo.");
  }

  const supabase = buildSupabaseAdmin();
  const sessionToken =
    supabaseAccessToken?.trim() || parseBearerToken(authorizationHeader) || "";
  if (!sessionToken) {
    await auditGitHubRepoAction({
      supabase,
      functionName,
      action,
      owner: normalizedOwner,
      repo: normalizedRepo,
      decision: "denied",
      tokenSource: "none",
      httpStatus: 401,
      message: "Missing Supabase session token."
    });
    throw new HttpError(401, "Missing Supabase session token.");
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(sessionToken);
  if (userError || !user) {
    await auditGitHubRepoAction({
      supabase,
      functionName,
      action,
      owner: normalizedOwner,
      repo: normalizedRepo,
      decision: "denied",
      tokenSource: "none",
      httpStatus: 401,
      message: "Invalid Supabase session."
    });
    throw new HttpError(401, "Invalid Supabase session.");
  }

  const repoScope = await getRepoAccessScopeForUser({
    supabase,
    userId: user.id,
    owner: normalizedOwner,
    repo: normalizedRepo
  });
  if (repoScope === "none") {
    await auditGitHubRepoAction({
      supabase,
      userId: user.id,
      functionName,
      action,
      owner: normalizedOwner,
      repo: normalizedRepo,
      decision: "denied",
      tokenSource: "none",
      httpStatus: 403,
      message: "Repo is not allowlisted for this user.",
      metadata: {
        repo_scope: "none"
      }
    });
    throw new HttpError(403, "Repo is not linked to your Solidary account.");
  }

  let githubToken = "";
  let tokenSource: TokenSourceWithNone = "none";
  const credentialPresence = await getGitHubCredentialPresenceForUser({
    supabase,
    userId: user.id
  });

  if (requireGitHubToken) {
    if (repoScope === "owner") {
      if (credentialPresence.hasGitHubRow) {
        const resolvedGithub = await resolveGitHubTokenForUserByMode({
          supabase,
          userId: user.id,
          authMode: "github"
        });
        githubToken = resolvedGithub?.token?.trim() ?? "";
        tokenSource = "github";
      } else {
        const resolvedSolidary = await resolveGitHubTokenForUserByMode({
          supabase,
          userId: user.id,
          authMode: "solidary"
        });
        githubToken = resolvedSolidary?.token?.trim() ?? "";
        tokenSource = resolvedSolidary?.source ?? "none";
      }
    } else {
      const resolvedSolidary = await resolveGitHubTokenForUserByMode({
        supabase,
        userId: user.id,
        authMode: "solidary"
      });
      githubToken = resolvedSolidary?.token?.trim() ?? "";
      tokenSource = resolvedSolidary?.source ?? "none";
    }

    if (!githubToken) {
      let authMessage =
        "GitHub authorization missing. Reconnect GitHub from Profile settings and retry.";
      if (repoScope === "owner" && credentialPresence.hasGitHubRow) {
        authMessage = buildOwnerGitHubAppRequiredMessage({
          owner: normalizedOwner,
          repo: normalizedRepo
        });
        try {
          const connectionStatus = await getGitHubAppConnectionStatusForUser({
            supabase,
            userId: user.id
          });
          if (connectionStatus.state === "token_invalid") {
            authMessage = connectionStatus.message?.trim() || buildGitHubAppTokenInvalidMessage();
          } else if (connectionStatus.state === "unknown") {
            authMessage =
              connectionStatus.message?.trim() ||
              "Could not verify GitHub App authorization. Reconnect GitHub App from Profile and retry.";
          } else if (connectionStatus.state === "installation_missing") {
            authMessage = buildOwnerGitHubAppRequiredMessage({
              owner: normalizedOwner,
              repo: normalizedRepo
            });
          } else if (connectionStatus.state === "not_connected") {
            authMessage = buildOwnerGitHubAppRequiredMessage({
              owner: normalizedOwner,
              repo: normalizedRepo
            });
          }
        } catch {
          // Use fallback auth message from above.
        }
      } else if (repoScope === "collaborator") {
        authMessage = buildCollaboratorSolidaryRequiredMessage({
          owner: normalizedOwner,
          repo: normalizedRepo
        });
      } else if (repoScope === "owner" && !credentialPresence.hasGitHubRow) {
        authMessage =
          "Solidary OAuth authorization is missing for owner repository access. Sign in with GitHub again from Profile and retry.";
      } else {
        try {
          const connectionStatus = await getGitHubAppConnectionStatusForUser({
            supabase,
            userId: user.id
          });
          if (connectionStatus.state === "token_invalid") {
            authMessage = connectionStatus.message?.trim() || buildGitHubAppTokenInvalidMessage();
          } else if (connectionStatus.state === "unknown") {
            authMessage =
              connectionStatus.message?.trim() ||
              "Could not verify GitHub App authorization. Reconnect the app and retry.";
          } else if (connectionStatus.state === "not_connected") {
            authMessage =
              "GitHub authorization missing. Reconnect GitHub from Profile settings and retry.";
          }
        } catch {
          // Use fallback auth message from above.
        }
      }

      await auditGitHubRepoAction({
        supabase,
        userId: user.id,
        functionName,
        action,
        owner: normalizedOwner,
        repo: normalizedRepo,
        decision: "denied",
        tokenSource,
        httpStatus: 412,
        message: authMessage,
        metadata: {
          repo_scope: repoScope,
          selected_auth_mode:
            repoScope === "owner"
              ? credentialPresence.hasGitHubRow
                ? "github"
                : "solidary"
              : "solidary",
          has_github_row: credentialPresence.hasGitHubRow,
          has_solidary_row: credentialPresence.hasSolidaryRow
        }
      });
      throw new HttpError(412, authMessage);
    }
  }

  await auditGitHubRepoAction({
    supabase,
    userId: user.id,
    functionName,
    action,
    owner: normalizedOwner,
    repo: normalizedRepo,
    decision: "allowed",
    tokenSource,
    httpStatus: 200,
    metadata: {
      repo_scope: repoScope,
      selected_auth_mode:
        repoScope === "owner"
          ? credentialPresence.hasGitHubRow
            ? "github"
            : "solidary"
          : "solidary",
      has_github_row: credentialPresence.hasGitHubRow,
      has_solidary_row: credentialPresence.hasSolidaryRow
    }
  });

  return {
    supabase,
    userId: user.id,
    githubToken,
    tokenSource,
    repoScope
  };
};
