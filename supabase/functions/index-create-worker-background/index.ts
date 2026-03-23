import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  getGitHubCredentialPresenceForUser,
  resolveGitHubTokenForUser,
} from "../_shared/github-auth-broker.ts";
import {
  resolveSupabaseManagementAccessForUser,
  SupabaseManagementReauthError,
} from "../_shared/supabase-management-auth/index.ts";
import {
  encryptTokenValue,
  getTokenEncryptionVersion,
} from "../_shared/token-crypto.ts";
import { indexBootstrapSql } from "../_shared/index-bootstrap-sql.ts";
import { createIndexAdminBootstrapSql } from "../_shared/index-admin-bootstrap-sql.ts";
import {
  getSolidaryAppUrl,
  getSolidaryRootIndexLevel,
  getSolidaryRootIndexUrl,
  getSolidaryRootRepoFullName,
  getSolidaryRootRepoUrl,
} from "../_shared/solidary-root-index.ts";
import {
  dispatchFederationQueueNow,
  enqueueAuthoritativeFederationSnapshot,
  ensureFederationPeerPair,
} from "../_shared/index-federation.ts";
import { buildIndexParentConnectionUuid } from "../_shared/index-parent-connection.ts";
import { bundledTemplateFiles } from "./template-files.ts";

const GITHUB_API = "https://api.github.com";
const SUPABASE_MANAGEMENT_API = "https://api.supabase.com";
const TARGET_DEFAULT_BRANCH = "main";
const BRANCH_READY_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000];
const GITHUB_WRITE_RETRY_DELAYS_MS = [0, 200, 500, 1000, 2000, 4000];
const PAGES_ENABLE_RETRY_DELAYS_MS = [0, 1000, 2000, 4000];
const RETRYABLE_GITHUB_STATUS = new Set([
  404,
  409,
  422,
  429,
  500,
  502,
  503,
  504,
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";
const DEFAULT_INDEX_IMAGE_PATH = "/solidary-media/images/site-image.jpg";
const PROJECT_FUNCTION_SECRET_NAMES = {
  projectId: "SOLIDARY_PROJECT_ID",
  publishableKey: "SOLIDARY_PUBLISHABLE_KEY",
  secretKey: "SOLIDARY_SECRET_KEY",
  tokenEncryptionKey: "TOKEN_ENCRYPTION_KEY",
  githubTokenDebug: "GITHUB_TOKEN_DEBUG",
  githubOauthClientId: "GITHUB_OAUTH_CLIENT_ID",
  githubOauthClientSecret: "GITHUB_OAUTH_CLIENT_SECRET",
} as const;

type GhErrorPayload = { message?: string; documentation_url?: string };
type GhRepoPayload = {
  id?: number | string;
  default_branch?: string;
  full_name?: string;
  html_url?: string;
  name?: string;
  owner?: { login?: string };
};
type GhBranchPayload = {
  commit?: { sha?: string };
};
type GhCommitPayload = {
  sha?: string;
  tree?: { sha?: string };
};
type GhBlobPayload = {
  sha?: string;
};
type GhTreePayload = {
  sha?: string;
};
type ManagementProjectPayload = {
  id?: string;
  ref?: string;
  name?: string;
  region?: string | null;
  status?: string | null;
  organization_id?: string | null;
  organization_slug?: string | null;
};
type ManagementApiKeyPayload = {
  id?: string;
  type?: string;
  name?: string;
  api_key?: string;
  key?: string;
  value?: string;
  token?: string;
};
type TemplateFile = {
  relPath: string;
  mode: "100644" | "100755";
  contentB64: string;
};
type WorkerBody = {
  jobId?: string;
  ownerUserId?: string;
  name?: string;
  title?: string;
  description?: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  imageContentB64?: string;
  imageThumbContentB64?: string;
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const buildIndexSlugConflictMessage = (slug: string) =>
  `Another index already uses the slug "${slug}". Choose a different title.`;

const isUniqueViolationError = (
  error: { code?: string | null; message?: string | null } | null | undefined,
) => error?.code === "23505";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = (promise: Promise<unknown>) => {
  const maybeEdgeRuntime = (
    globalThis as unknown as {
      EdgeRuntime?: {
        waitUntil?: (task: Promise<unknown>) => void;
      };
    }
  ).EdgeRuntime;

  if (typeof maybeEdgeRuntime?.waitUntil === "function") {
    maybeEdgeRuntime.waitUntil(promise);
    return;
  }

  void promise.catch((error) => {
    console.error("[index-create-worker] background task failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
};

const parseBody = (rawBody: string | null): WorkerBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as WorkerBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const normalizeRepoImageContent = (value: string | undefined) => {
  const normalized = value?.trim() ?? "";
  return normalized.replace(/^data:[^;]+;base64,/, "").trim();
};

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

const toSqlText = (value: string | null) =>
  value === null ? "null" : `'${escapeSqlLiteral(value)}'`;

const isValidRepoFullName = (value: string) => /^[^/\s]+\/[^/\s]+$/.test(value);

const resolveAbsoluteAssetUrl = ({
  siteUrl,
  assetPath,
}: {
  siteUrl: string;
  assetPath: string;
}) => {
  try {
    const base = new URL(siteUrl.trim());
    const normalizedAssetPath = assetPath.trim().replace(/^\/+/, "");
    const basePath = base.pathname.replace(/\/$/, "");
    base.pathname = `${basePath}/${normalizedAssetPath}`.replace(
      /\/{2,}/g,
      "/",
    );
    base.search = "";
    base.hash = "";
    return base.toString();
  } catch {
    return assetPath.trim();
  }
};

const createProjectTokenEncryptionKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const resolveSiteUrlForRepo = (owner: string, repo: string) => {
  const pagesRootUrl = `https://${owner}.github.io`;
  const isUserSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  return isUserSite ? pagesRootUrl : `${pagesRootUrl}/${repo}`;
};

const getProjectDashboardUrl = (projectRef: string) =>
  `https://supabase.com/dashboard/project/${projectRef}`;

const getProjectUrl = (projectRef: string) =>
  `https://${projectRef}.supabase.co`;

const createSupabaseAdmin = () =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createProjectAdmin = (projectUrl: string, secretKey: string) =>
  createClient(projectUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const resolveSolidaryRootIndexContext = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
) => {
  const { data, error } = await supabase
    .from("indexes")
    .select(
      [
        "id",
        "canonical_url",
        "index_level",
        "repo_full_name",
        "repo_url",
        "supabase_project_url",
        "supabase_publishable_key",
      ].join(", "),
    )
    .eq("type", "index")
    .eq("is_root", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(
      500,
      error.message || "Failed to resolve the Solidary root index.",
    );
  }

  const row = (data ?? null) as {
    id?: unknown;
    canonical_url?: unknown;
    index_level?: unknown;
    repo_full_name?: unknown;
    repo_url?: unknown;
    supabase_project_url?: unknown;
    supabase_publishable_key?: unknown;
  } | null;

  const parentIndexId = typeof row?.id === "string" ? row.id.trim() : "";
  if (!parentIndexId) {
    throw new HttpError(500, "Solidary root index row is missing.");
  }

  const parentIndexUrl =
    typeof row?.canonical_url === "string" && row.canonical_url.trim()
      ? row.canonical_url.trim()
      : getSolidaryRootIndexUrl();
  const parentIndexLevel = typeof row?.index_level === "number"
    ? row.index_level
    : getSolidaryRootIndexLevel();
  const parentRepoFullName =
    typeof row?.repo_full_name === "string" && row.repo_full_name.trim()
      ? row.repo_full_name.trim()
      : getSolidaryRootRepoFullName();
  const parentRepoUrl =
    typeof row?.repo_url === "string" && row.repo_url.trim()
      ? row.repo_url.trim()
      : getSolidaryRootRepoUrl();
  const parentProjectUrl =
    typeof row?.supabase_project_url === "string" &&
      row.supabase_project_url.trim()
      ? row.supabase_project_url.trim()
      : SUPABASE_URL;
  const parentPublishableKey =
    typeof row?.supabase_publishable_key === "string" &&
      row.supabase_publishable_key.trim()
      ? row.supabase_publishable_key.trim()
      : (Deno.env.get("SOLIDARY_PUBLISHABLE_KEY") ??
        Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "").trim();

  return {
    parentIndexId,
    parentIndexUrl,
    parentIndexLevel,
    parentRepoFullName,
    parentRepoUrl,
    parentProjectUrl,
    parentPublishableKey,
  };
};

const createDatabasePassword = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
};

const getGhErrorMessage = (payload: unknown, fallback: string) => {
  const maybePayload = payload as GhErrorPayload;
  const message = typeof maybePayload?.message === "string"
    ? maybePayload.message.trim()
    : "";
  const docs = typeof maybePayload?.documentation_url === "string"
    ? maybePayload.documentation_url.trim()
    : "";
  if (!message && !docs) return fallback;
  if (message && docs) return `${fallback} (${message}; ${docs})`;
  return `${fallback} (${message || docs})`;
};

const assertOk = (res: Response, payload: unknown, fallbackMessage: string) => {
  if (!res.ok) {
    throw new HttpError(
      res.status,
      getGhErrorMessage(payload, fallbackMessage),
    );
  }
};

async function ghUser<T>(
  userToken: string,
  url: string,
  init: RequestInit = {},
) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${userToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as T;
  return { res, data };
}

async function ghUserWithRetry<T>({
  userToken,
  url,
  init,
  delaysMs,
  shouldRetry,
}: {
  userToken: string;
  url: string;
  init?: RequestInit;
  delaysMs: number[];
  shouldRetry: (statusCode: number, payload: T) => boolean;
}) {
  let last:
    | {
      res: Response;
      data: T;
    }
    | undefined;

  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    const delay = delaysMs[attempt];
    if (delay > 0) {
      await sleep(delay);
    }

    const current = await ghUser<T>(userToken, url, init);
    last = current;
    if (current.res.ok) {
      return current;
    }
    if (!shouldRetry(current.res.status, current.data)) {
      return current;
    }
  }

  return last as { res: Response; data: T };
}

async function getBranchHeadSha({
  userToken,
  owner,
  repo,
  branch,
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
}) {
  const branchUrl = `${GITHUB_API}/repos/${owner}/${repo}/branches/${
    encodeURIComponent(branch)
  }`;
  const { res, data } = await ghUserWithRetry<GhBranchPayload | GhErrorPayload>(
    {
      userToken,
      url: branchUrl,
      delaysMs: BRANCH_READY_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
    },
  );
  assertOk(res, data, `Failed to read ${branch} branch for ${owner}/${repo}.`);

  const sha = typeof (data as GhBranchPayload)?.commit?.sha === "string"
    ? (data as GhBranchPayload).commit?.sha
    : undefined;
  if (!sha) {
    throw new HttpError(
      500,
      `Branch ${branch} for ${owner}/${repo} does not contain a head commit SHA.`,
    );
  }
  return sha;
}

async function createBranchIfMissing({
  userToken,
  owner,
  repo,
  branch,
  fromSha,
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
  fromSha: string;
}) {
  const ref = `refs/heads/${branch}`;
  const { res, data } = await ghUserWithRetry<any>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/refs`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref,
        sha: fromSha,
      }),
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });

  if (res.ok || res.status === 422) return;
  assertOk(res, data, `Failed creating ${branch} branch for ${owner}/${repo}.`);
}

async function getCommitTreeSha({
  userToken,
  owner,
  repo,
  commitSha,
}: {
  userToken: string;
  owner: string;
  repo: string;
  commitSha: string;
}) {
  const { res, data } = await ghUserWithRetry<GhCommitPayload | GhErrorPayload>(
    {
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${commitSha}`,
      delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
    },
  );
  assertOk(
    res,
    data,
    `Failed reading commit ${commitSha} for ${owner}/${repo}.`,
  );

  const treeSha = typeof (data as GhCommitPayload)?.tree?.sha === "string"
    ? (data as GhCommitPayload).tree?.sha
    : "";
  if (!treeSha) {
    throw new HttpError(
      500,
      `Commit ${commitSha} for ${owner}/${repo} does not contain a tree SHA.`,
    );
  }
  return treeSha;
}

async function createTemplateSeedCommit({
  userToken,
  owner,
  repo,
  branch,
  files,
  onProgress,
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
  files: TemplateFile[];
  onProgress?: (completed: number, total: number) => Promise<void>;
}) {
  const sortedFiles = [...files].sort((left, right) =>
    left.relPath.localeCompare(right.relPath)
  );
  if (!sortedFiles.length) {
    throw new HttpError(500, "Template directory is empty.");
  }

  const parentCommitSha = await getBranchHeadSha({
    userToken,
    owner,
    repo,
    branch,
  });
  const baseTreeSha = await getCommitTreeSha({
    userToken,
    owner,
    repo,
    commitSha: parentCommitSha,
  });

  const treeEntries: Array<{
    path: string;
    mode: "100644" | "100755";
    type: "blob";
    sha: string;
  }> = [];

  const total = sortedFiles.length;
  for (let completed = 0; completed < sortedFiles.length; completed += 1) {
    const file = sortedFiles[completed];
    const { res: blobRes, data: blobData } = await ghUserWithRetry<
      GhBlobPayload | GhErrorPayload
    >({
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: file.contentB64,
          encoding: "base64",
        }),
      },
      delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
    });
    assertOk(blobRes, blobData, `Failed creating blob for ${file.relPath}.`);

    const blobSha = typeof (blobData as GhBlobPayload)?.sha === "string"
      ? (blobData as GhBlobPayload).sha
      : "";
    if (!blobSha) {
      throw new HttpError(
        500,
        `GitHub did not return blob SHA for ${file.relPath}.`,
      );
    }

    treeEntries.push({
      path: file.relPath,
      mode: file.mode,
      type: "blob",
      sha: blobSha,
    });

    const current = completed + 1;
    if (onProgress && (current === total || current % 3 === 0)) {
      await onProgress(current, total);
    }
  }

  const { res: treeRes, data: treeData } = await ghUserWithRetry<
    GhTreePayload | GhErrorPayload
  >({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(treeRes, treeData, "Failed creating template tree.");

  const treeSha = typeof (treeData as GhTreePayload)?.sha === "string"
    ? (treeData as GhTreePayload).sha
    : "";
  if (!treeSha) {
    throw new HttpError(
      500,
      "GitHub did not return tree SHA for template commit.",
    );
  }

  const { res: commitRes, data: commitData } = await ghUserWithRetry<
    GhCommitPayload | GhErrorPayload
  >({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Initialize repository from Solidary index template",
        tree: treeSha,
        parents: [parentCommitSha],
      }),
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(commitRes, commitData, "Failed creating template commit.");

  const commitSha = typeof (commitData as GhCommitPayload)?.sha === "string"
    ? (commitData as GhCommitPayload).sha
    : "";
  if (!commitSha) {
    throw new HttpError(
      500,
      "GitHub did not return commit SHA for template commit.",
    );
  }

  const { res: refRes, data: refData } = await ghUserWithRetry<GhErrorPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${
      encodeURIComponent(branch)
    }`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sha: commitSha,
        force: false,
      }),
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(
    refRes,
    refData,
    `Failed updating ${branch} branch to template commit.`,
  );
}

async function setDefaultBranch({
  userToken,
  owner,
  repo,
  branch,
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
}) {
  const { res, data } = await ghUserWithRetry<any>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_branch: branch }),
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(res, data, "Failed setting default branch.");
}

async function getRepo({
  userToken,
  owner,
  repo,
}: {
  userToken: string;
  owner: string;
  repo: string;
}) {
  const { res, data } = await ghUserWithRetry<GhRepoPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(res, data, "Failed reading repository.");
  return data;
}

async function cleanupRepo({
  userToken,
  owner,
  repo,
}: {
  userToken: string;
  owner: string;
  repo: string;
}) {
  const { res, data } = await ghUser<any>(
    userToken,
    `${GITHUB_API}/repos/${owner}/${repo}`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok && res.status !== 404) {
    console.log("[index-create-worker] cleanup failed", {
      owner,
      repo,
      status: res.status,
      message: getGhErrorMessage(data, "Failed cleanup"),
    });
  }
}

async function fetchRepoPages({
  userToken,
  owner,
  repo,
}: {
  userToken: string;
  owner: string;
  repo: string;
}) {
  const { res, data } = await ghUser<Record<string, unknown>>(
    userToken,
    `${GITHUB_API}/repos/${owner}/${repo}/pages`,
  );
  if (!res.ok) {
    return null;
  }
  return data;
}

async function updateRepoPages({
  userToken,
  owner,
  repo,
  branch,
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
}) {
  const { res, data } = await ghUser<Record<string, unknown>>(
    userToken,
    `${GITHUB_API}/repos/${owner}/${repo}/pages`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        build_type: "workflow",
        source: {
          branch,
          path: "/",
        },
      }),
    },
  );
  assertOk(res, data, `Failed updating GitHub Pages for ${owner}/${repo}.`);
}

async function enableGitHubPages({
  userToken,
  owner,
  repo,
  branch,
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
}) {
  let lastStatus = 0;
  let lastPayload: unknown = {};

  for (
    let attempt = 0;
    attempt < PAGES_ENABLE_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    const delay = PAGES_ENABLE_RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      await sleep(delay);
    }

    const { res, data } = await ghUser<Record<string, unknown>>(
      userToken,
      `${GITHUB_API}/repos/${owner}/${repo}/pages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          build_type: "workflow",
          source: {
            branch,
            path: "/",
          },
        }),
      },
    );

    if (res.status === 409) {
      await updateRepoPages({
        userToken,
        owner,
        repo,
        branch,
      });
      await fetchRepoPages({
        userToken,
        owner,
        repo,
      });
      return;
    }

    if (res.ok) {
      await updateRepoPages({
        userToken,
        owner,
        repo,
        branch,
      });
      return;
    }

    lastStatus = res.status;
    lastPayload = data;

    if (res.status === 422) {
      const { res: branchRes } = await ghUser<Record<string, unknown>>(
        userToken,
        `${GITHUB_API}/repos/${owner}/${repo}/branches/${
          encodeURIComponent(branch)
        }`,
      );

      if (branchRes.ok && attempt < PAGES_ENABLE_RETRY_DELAYS_MS.length - 1) {
        continue;
      }
    }

    break;
  }

  throw new HttpError(
    lastStatus || 500,
    getGhErrorMessage(
      lastPayload,
      `Failed to enable GitHub Pages for ${owner}/${repo}.`,
    ),
  );
}

const createTemplateConfigFile = ({
  title,
  description,
  slug,
  archiveId,
  repoFullName,
  repoUrl,
  projectRef,
  projectUrl,
  projectDashboardUrl,
  publishableKey,
  siteUrl,
  solidaryAppUrl,
  solidarySupabaseUrl,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
}: {
  title: string;
  description: string;
  slug: string;
  archiveId: string;
  repoFullName: string;
  repoUrl: string;
  projectRef: string;
  projectUrl: string;
  projectDashboardUrl: string;
  publishableKey: string;
  siteUrl: string;
  solidaryAppUrl: string;
  solidarySupabaseUrl: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
}) =>
  `${
    JSON.stringify(
      {
        title,
        description,
        slug,
        archiveId,
        repoFullName,
        repoUrl,
        projectRef,
        projectUrl,
        publishableKey,
        projectDashboardUrl,
        siteUrl,
        solidaryAppUrl,
        solidarySupabaseUrl,
        authCallbackUrl: `${projectUrl}/auth/v1/callback`,
        authProvidersDashboardUrl: `${projectDashboardUrl}/auth/providers`,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
      },
      null,
      2,
    )
  }\n`;

const createTemplateSolidaryLinksFile = ({
  indexId,
  siteUrl,
  parentIndexId,
  parentIndexUrl,
}: {
  indexId: string;
  siteUrl: string;
  parentIndexId: string;
  parentIndexUrl: string;
}) => {
  const connectionUuid = buildIndexParentConnectionUuid({
    sourceIndexId: indexId,
    targetIndexId: parentIndexId,
  });
  const hasParentConnection = Boolean(connectionUuid && parentIndexUrl.trim());

  return `${
    JSON.stringify(
      {
        "@context": {
          site: "urn:solidary:type:site",
          index: "urn:solidary:type:index",
          connection: "urn:solidary:type:connection",
          site_id: "urn:solidary:term:site_id",
          connections: {
            "@id": "urn:solidary:term:connections",
            "@container": "@set",
          },
          connected_site: "urn:solidary:term:connected_site",
        },
        "@id": siteUrl,
        "@type": "index",
        site_id: indexId,
        connections: hasParentConnection
          ? [
            {
              "@id": `urn:uuid:${connectionUuid}`,
              "@type": "connection",
              connected_site: {
                "@id": parentIndexUrl.trim(),
                "@type": "index",
                site_id: parentIndexId,
              },
            },
          ]
          : [],
      },
      null,
      2,
    )
  }\n`;
};

const loadTemplateFiles = () => {
  if (!bundledTemplateFiles.length) {
    throw new Error(
      "Index template bundle is empty. Regenerate template-files.ts.",
    );
  }
  return bundledTemplateFiles.map((file) => ({ ...file }));
};

const upsertTemplateFile = ({
  filesByPath,
  relPath,
  content,
  mode = "100644",
}: {
  filesByPath: Map<string, TemplateFile>;
  relPath: string;
  content: string;
  mode?: "100644" | "100755";
}) => {
  filesByPath.set(relPath, {
    relPath,
    mode,
    contentB64: Buffer.from(content, "utf8").toString("base64"),
  });
};

const applyIndexTemplateOverrides = ({
  files,
  title,
  description,
  slug,
  archiveId,
  repoFullName,
  repoUrl,
  projectRef,
  projectUrl,
  projectDashboardUrl,
  publishableKey,
  siteUrl,
  solidaryAppUrl,
  solidarySupabaseUrl,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
  imageContentB64,
  imageThumbContentB64,
}: {
  files: TemplateFile[];
  title: string;
  description: string;
  slug: string;
  archiveId: string;
  repoFullName: string;
  repoUrl: string;
  projectRef: string;
  projectUrl: string;
  projectDashboardUrl: string;
  publishableKey: string;
  siteUrl: string;
  solidaryAppUrl: string;
  solidarySupabaseUrl: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
  imageContentB64?: string;
  imageThumbContentB64?: string;
}) => {
  const filesByPath = new Map(
    files.map((file) => [file.relPath, file] as const),
  );
  upsertTemplateFile({
    filesByPath,
    relPath: "site/config/index.json",
    content: createTemplateConfigFile({
      title,
      description,
      slug,
      archiveId,
      repoFullName,
      repoUrl,
      projectRef,
      projectUrl,
      projectDashboardUrl,
      publishableKey,
      siteUrl,
      solidaryAppUrl,
      solidarySupabaseUrl,
      indexLevel,
      parentIndexId,
      parentIndexUrl,
      parentIndexLevel,
      }),
  });
  upsertTemplateFile({
    filesByPath,
    relPath: "site/.well-known/solidary-links.json",
    content: createTemplateSolidaryLinksFile({
      indexId: archiveId,
      siteUrl,
      parentIndexId,
      parentIndexUrl,
    }),
  });

  const normalizedImage = normalizeRepoImageContent(imageContentB64);
  if (normalizedImage) {
    filesByPath.set("site/solidary-media/images/site-image.jpg", {
      relPath: "site/solidary-media/images/site-image.jpg",
      mode: "100644",
      contentB64: normalizedImage,
    });
  }

  const normalizedImageThumb = normalizeRepoImageContent(imageThumbContentB64);
  if (normalizedImageThumb) {
    filesByPath.set("site/solidary-media/images/site-image_thumb.jpg", {
      relPath: "site/solidary-media/images/site-image_thumb.jpg",
      mode: "100644",
      contentB64: normalizedImageThumb,
    });
  }

  return [...filesByPath.values()].sort((left, right) =>
    left.relPath.localeCompare(right.relPath)
  );
};

async function managementRequest<T>({
  accessToken,
  path,
  init,
}: {
  accessToken: string;
  path: string;
  init?: RequestInit;
}) {
  const response = await fetch(
    new URL(path, SUPABASE_MANAGEMENT_API).toString(),
    {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    },
  );

  const payload = (await response.json().catch(() => ({}))) as T;
  return { response, payload };
}

async function createSupabaseProject({
  accessToken,
  name,
  organizationSlug,
}: {
  accessToken: string;
  name: string;
  organizationSlug: string;
}) {
  const { response, payload } = await managementRequest<
    ManagementProjectPayload | GhErrorPayload
  >({
    accessToken,
    path: "/v1/projects",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        organization_slug: organizationSlug,
        db_pass: createDatabasePassword(),
        region_selection: {
          type: "smartGroup",
          code: "americas",
        },
      }),
    },
  });

  if (!response.ok) {
    throw new HttpError(
      response.status,
      getGhErrorMessage(payload, "Failed to create Supabase project."),
    );
  }

  const project = payload as ManagementProjectPayload;
  const projectId = project.id?.trim() ?? "";
  if (!projectId) {
    throw new HttpError(
      500,
      "Supabase project creation response did not include an id.",
    );
  }

  return project;
}

async function resolveCreatedProject({
  accessToken,
  createdProject,
  organizationId,
  organizationSlug,
}: {
  accessToken: string;
  createdProject: ManagementProjectPayload;
  organizationId: string;
  organizationSlug: string;
}) {
  const directRef = createdProject.ref?.trim() ?? "";
  if (directRef) {
    return {
      ...createdProject,
      ref: directRef,
      organization_id: createdProject.organization_id ?? organizationId,
      organization_slug: createdProject.organization_slug ?? organizationSlug,
    };
  }

  const projectId = createdProject.id?.trim() ?? "";
  const projectName = createdProject.name?.trim() ?? "";

  for (let attempt = 0; attempt < 18; attempt += 1) {
    if (attempt > 0) {
      await sleep(Math.min(6000, 1000 + attempt * 500));
    }

    const { response, payload } = await managementRequest<unknown[]>({
      accessToken,
      path: "/v1/projects",
    });
    if (!response.ok || !Array.isArray(payload)) {
      continue;
    }

    const match = payload.find((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return false;
      }
      const row = entry as Record<string, unknown>;
      const rowId = typeof row.id === "string" ? row.id.trim() : "";
      const rowName = typeof row.name === "string" ? row.name.trim() : "";
      const rowOrgId = typeof row.organization_id === "string"
        ? row.organization_id.trim()
        : "";
      const rowOrgSlug = typeof row.organization_slug === "string"
        ? row.organization_slug.trim()
        : "";

      if (projectId && rowId && rowId === projectId) {
        return true;
      }

      return Boolean(
        projectName && rowName === projectName && (
          rowOrgId === organizationId || rowOrgSlug === organizationSlug
        ),
      );
    });

    if (!match || typeof match !== "object" || Array.isArray(match)) {
      continue;
    }

    const project = match as Record<string, unknown>;
    const ref = typeof project.ref === "string" ? project.ref.trim() : "";
    if (!ref) {
      continue;
    }

    return {
      id: typeof project.id === "string" ? project.id : projectId,
      ref,
      name: typeof project.name === "string" ? project.name : projectName,
      region: typeof project.region === "string" ? project.region : null,
      status: typeof project.status === "string" ? project.status : null,
      organization_id: typeof project.organization_id === "string"
        ? project.organization_id
        : organizationId,
      organization_slug: typeof project.organization_slug === "string"
        ? project.organization_slug
        : organizationSlug,
    } satisfies ManagementProjectPayload;
  }

  throw new HttpError(
    500,
    "Supabase project was created but its project ref could not be resolved yet.",
  );
}

const extractApiKey = (payload: unknown, type: string) => {
  const normalizedType = type.trim().toLowerCase();

  const readValue = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return "";
    }
    const row = value as Record<string, unknown>;
    const rowType = typeof row.type === "string"
      ? row.type.trim().toLowerCase()
      : "";
    if (rowType && rowType !== normalizedType) {
      return "";
    }
    return (
      (typeof row.api_key === "string" ? row.api_key : "") ||
      (typeof row.key === "string" ? row.key : "") ||
      (typeof row.value === "string" ? row.value : "") ||
      (typeof row.token === "string" ? row.token : "")
    ).trim();
  };

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const value = readValue(entry);
      if (value) return value;
    }
    return "";
  }

  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const directValue = typeof row[normalizedType] === "string"
      ? row[normalizedType]
      : "";
    if (directValue.trim()) {
      return directValue.trim();
    }
    if (Array.isArray(row.keys)) {
      return extractApiKey(row.keys, type);
    }
    return readValue(row);
  }

  return "";
};

async function ensureProjectApiKeys({
  accessToken,
  projectRef,
}: {
  accessToken: string;
  projectRef: string;
}) {
  const readKeys = async () => {
    return managementRequest<unknown>({
      accessToken,
      path: `/v1/projects/${projectRef}/api-keys?reveal=true`,
    });
  };

  const createKey = async (type: "publishable" | "secret") => {
    const body = type === "secret"
      ? {
        type,
        name: "default",
        secret_jwt_template: {
          role: "service_role",
        },
      }
      : {
        type,
        name: "default",
      };
    const { response, payload } = await managementRequest<unknown>({
      accessToken,
      path: `/v1/projects/${projectRef}/api-keys?reveal=true`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    });
    if (!response.ok) {
      throw new HttpError(
        response.status,
        getGhErrorMessage(payload, `Failed to create ${type} API key.`),
      );
    }
  };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (attempt > 0) {
      await sleep(Math.min(5000, 750 + attempt * 400));
    }

    const { response, payload } = await readKeys();
    if (!response.ok) {
      continue;
    }

    let publishableKey = extractApiKey(payload, "publishable");
    let secretKey = extractApiKey(payload, "secret");

    if (!publishableKey) {
      await createKey("publishable");
      const next = await readKeys();
      if (next.response.ok) {
        publishableKey = extractApiKey(next.payload, "publishable");
        secretKey = secretKey || extractApiKey(next.payload, "secret");
      }
    }

    if (!secretKey) {
      await createKey("secret");
      const next = await readKeys();
      if (next.response.ok) {
        publishableKey = publishableKey ||
          extractApiKey(next.payload, "publishable");
        secretKey = extractApiKey(next.payload, "secret");
      }
    }

    if (publishableKey && secretKey) {
      return {
        publishableKey,
        secretKey,
      };
    }
  }

  throw new HttpError(500, "Could not resolve the new project's API keys.");
}

async function ensureProjectFunctionSecrets({
  accessToken,
  projectRef,
  publishableKey,
  secretKey,
}: {
  accessToken: string;
  projectRef: string;
  publishableKey: string;
  secretKey: string;
}) {
  const { response, payload } = await managementRequest<unknown>({
    accessToken,
    path: `/v1/projects/${projectRef}/secrets`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        [
          {
            name: PROJECT_FUNCTION_SECRET_NAMES.projectId,
            value: projectRef,
          },
          {
            name: PROJECT_FUNCTION_SECRET_NAMES.publishableKey,
            value: publishableKey,
          },
          {
            name: PROJECT_FUNCTION_SECRET_NAMES.secretKey,
            value: secretKey,
          },
          {
            name: PROJECT_FUNCTION_SECRET_NAMES.tokenEncryptionKey,
            value: createProjectTokenEncryptionKey(),
          },
          {
            name: PROJECT_FUNCTION_SECRET_NAMES.githubTokenDebug,
            value: "false",
          },
          {
            name: PROJECT_FUNCTION_SECRET_NAMES.githubOauthClientId,
            value: "",
          },
          {
            name: PROJECT_FUNCTION_SECRET_NAMES.githubOauthClientSecret,
            value: "",
          },
        ],
      ),
    },
  });

  if (!response.ok) {
    throw new HttpError(
      response.status,
      getGhErrorMessage(payload, "Failed to update child project secrets."),
    );
  }
}

async function runProjectQuery({
  accessToken,
  projectRef,
  query,
}: {
  accessToken: string;
  projectRef: string;
  query: string;
}) {
  const { response, payload } = await managementRequest<unknown>({
    accessToken,
    path: `/v1/projects/${projectRef}/database/query`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `begin;\n${query.trim()}\ncommit;`,
      }),
    },
  });

  if (!response.ok) {
    throw new HttpError(
      response.status,
      getGhErrorMessage(payload, "Failed to run project SQL query."),
    );
  }
}

async function bootstrapProjectDatabase({
  accessToken,
  projectRef,
  indexId,
  slug,
  title,
  description,
  canonicalUrl,
  imageUrl,
  projectUrl,
  publishableKey,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
  parentRepoFullName,
  parentRepoUrl,
}: {
  accessToken: string;
  projectRef: string;
  indexId: string;
  slug: string;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  projectUrl: string;
  publishableKey: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
  parentRepoFullName: string;
  parentRepoUrl: string;
}) {
  const queries = [
    {
      label: "base schema bootstrap",
      query: indexBootstrapSql,
    },
    {
      label: "index admin bootstrap",
      query: createIndexAdminBootstrapSql({
        indexId,
        slug,
        title,
        description,
        canonicalUrl,
        imageUrl,
        projectUrl,
        publishableKey,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
        parentRepoFullName,
        parentRepoUrl,
      }),
    },
  ];

  for (const { query, label } of queries) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (attempt > 0) {
        await sleep(Math.min(8000, 1000 + attempt * 600));
      }

      try {
        await runProjectQuery({
          accessToken,
          projectRef,
          query,
        });
        break;
      } catch (error) {
        if (attempt === 15) {
          throw new Error(
            error instanceof Error
              ? `${label} failed: ${error.message}`
              : `${label} failed.`,
          );
        }
      }
    }
  }
}

async function syncChildRootArchive({
  accessToken,
  archiveId,
  slug,
  title,
  description,
  siteUrl,
  imageUrl,
  repoFullName,
  repoUrl,
  projectId,
  projectRef,
  projectName,
  projectUrl,
  projectDashboardUrl,
  publishableKey,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
  parentRepoFullName,
  parentRepoUrl,
}: {
  accessToken: string;
  archiveId: string;
  slug: string;
  title: string;
  description: string;
  siteUrl: string;
  imageUrl: string;
  repoFullName: string;
  repoUrl: string;
  projectId: string | null;
  projectRef: string;
  projectName: string;
  projectUrl: string;
  projectDashboardUrl: string;
  publishableKey: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
  parentRepoFullName: string;
  parentRepoUrl: string;
}) {
  await runProjectQuery({
    accessToken,
    projectRef,
    query: [
      "insert into public.indexes (",
      "  id,",
      "  owner_user_id,",
      "  slug,",
      "  title,",
      "  description,",
      "  image_url,",
      "  canonical_url,",
      "  repo_full_name,",
      "  repo_url,",
      "  supabase_project_id,",
      "  supabase_project_ref,",
      "  supabase_project_name,",
      "  supabase_project_url,",
      "  supabase_publishable_key,",
      "  supabase_dashboard_url,",
      "  source,",
      "  type,",
      "  is_root,",
      "  runtime_mode,",
      "  index_level,",
      "  parent_index_id,",
      "  parent_index_url,",
      "  parent_index_level,",
      "  parent_repo_full_name,",
      "  parent_repo_url,",
      "  finalized_at",
      ")",
      `values (${toSqlText(archiveId)}, null, ${toSqlText(slug)}, ${
        toSqlText(title)
      }, ${toSqlText(description)}, ${toSqlText(imageUrl)}, ${
        toSqlText(siteUrl)
      }, ${toSqlText(repoFullName)}, ${toSqlText(repoUrl)}, ${
        toSqlText(projectId)
      }, ${toSqlText(projectRef)}, ${toSqlText(projectName)}, ${
        toSqlText(projectUrl)
      }, ${toSqlText(publishableKey)}, ${
        toSqlText(projectDashboardUrl)
      }, 'index_create', 'index', true, 'scaffold', ${indexLevel}, ${
        toSqlText(parentIndexId)
      }, ${toSqlText(parentIndexUrl)}, ${parentIndexLevel}, ${
        toSqlText(parentRepoFullName)
      }, ${toSqlText(parentRepoUrl)}, null)`,
      "on conflict (id) do update set",
      "  slug = excluded.slug,",
      "  title = excluded.title,",
      "  description = excluded.description,",
      "  image_url = excluded.image_url,",
      "  canonical_url = excluded.canonical_url,",
      "  repo_full_name = excluded.repo_full_name,",
      "  repo_url = excluded.repo_url,",
      "  supabase_project_id = excluded.supabase_project_id,",
      "  supabase_project_ref = excluded.supabase_project_ref,",
      "  supabase_project_name = excluded.supabase_project_name,",
      "  supabase_project_url = excluded.supabase_project_url,",
      "  supabase_publishable_key = excluded.supabase_publishable_key,",
      "  supabase_dashboard_url = excluded.supabase_dashboard_url,",
      "  source = excluded.source,",
      "  type = excluded.type,",
      "  is_root = excluded.is_root,",
      "  runtime_mode = excluded.runtime_mode,",
      "  index_level = excluded.index_level,",
      "  parent_index_id = excluded.parent_index_id,",
      "  parent_index_url = excluded.parent_index_url,",
      "  parent_index_level = excluded.parent_index_level,",
      "  parent_repo_full_name = excluded.parent_repo_full_name,",
      "  parent_repo_url = excluded.parent_repo_url,",
      "  finalized_at = excluded.finalized_at,",
      "  updated_at = now();",
    ].join("\n"),
  });
}

async function reserveParentIndexMetadata({
  supabase,
  indexId,
  ownerUserId,
  slug,
  title,
  description,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
  parentRepoFullName,
  parentRepoUrl,
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  indexId: string;
  ownerUserId: string;
  slug: string;
  title: string;
  description: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
  parentRepoFullName: string;
  parentRepoUrl: string;
}) {
  const { error } = await supabase.from("indexes").insert({
    id: indexId,
    owner_user_id: ownerUserId,
    slug,
    title,
    description,
    source: "federation_mirror",
    type: "index",
    is_root: false,
    runtime_mode: "scaffold",
    index_level: indexLevel,
    parent_index_id: parentIndexId,
    parent_index_url: parentIndexUrl,
    parent_index_level: parentIndexLevel,
    parent_repo_full_name: parentRepoFullName,
    parent_repo_url: parentRepoUrl,
    finalized_at: null,
  });

  if (!error) {
    return;
  }

  if (isUniqueViolationError(error)) {
    throw new HttpError(409, buildIndexSlugConflictMessage(slug));
  }

  throw new HttpError(
    500,
    error.message || "Failed to reserve index metadata in Solidary.",
  );
}

async function releaseReservedParentIndexMetadata({
  supabase,
  indexId,
  ownerUserId,
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  indexId: string;
  ownerUserId: string;
}) {
  const { error } = await supabase
    .from("indexes")
    .delete()
    .eq("id", indexId)
    .eq("owner_user_id", ownerUserId);

  if (error) {
    console.log("[index-create-worker] failed to release reserved index metadata", {
      indexId,
      ownerUserId,
      message: error.message,
    });
  }
}

async function saveParentIndexMetadata({
  supabase,
  archiveId,
  ownerUserId,
  slug,
  title,
  description,
  siteUrl,
  imageUrl,
  repoOwner,
  repoName,
  repoFullName,
  repoUrl,
  projectId,
  projectRef,
  projectName,
  projectUrl,
  projectDashboardUrl,
  publishableKey,
  secretKey,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
  parentRepoFullName,
  parentRepoUrl,
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  archiveId: string;
  ownerUserId: string;
  slug: string;
  title: string;
  description: string;
  siteUrl: string;
  imageUrl: string;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  repoUrl: string;
  projectId: string | null;
  projectRef: string;
  projectName: string;
  projectUrl: string;
  projectDashboardUrl: string;
  publishableKey: string;
  secretKey: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
  parentRepoFullName: string;
  parentRepoUrl: string;
}) {
  const { error: archiveError } = await supabase.from("indexes").upsert({
    id: archiveId,
    owner_user_id: ownerUserId,
    slug,
    title,
    description,
    image_url: imageUrl,
    canonical_url: siteUrl,
    repo_full_name: repoFullName,
    repo_url: repoUrl,
    supabase_project_id: projectId,
    supabase_project_ref: projectRef,
    supabase_project_name: projectName,
    supabase_project_url: projectUrl,
    supabase_publishable_key: publishableKey,
    supabase_dashboard_url: projectDashboardUrl,
    source: "federation_mirror",
    type: "index",
    is_root: false,
    runtime_mode: "scaffold",
    index_level: indexLevel,
    parent_index_id: parentIndexId,
    parent_index_url: parentIndexUrl,
    parent_index_level: parentIndexLevel,
    parent_repo_full_name: parentRepoFullName,
    parent_repo_url: parentRepoUrl,
    finalized_at: null,
  });
  if (archiveError) {
    if (isUniqueViolationError(archiveError)) {
      throw new HttpError(409, buildIndexSlugConflictMessage(slug));
    }
    throw new HttpError(
      500,
      archiveError.message || "Failed to save archive metadata in Solidary.",
    );
  }

  const { error: membershipError } = await supabase
    .from("index_admin_memberships")
    .upsert({
      index_id: archiveId,
      user_id: ownerUserId,
      role: "owner",
    });
  if (membershipError) {
    throw new HttpError(
      500,
      membershipError.message || "Failed to save index admin membership.",
    );
  }

  const { error: credentialsError } = await supabase
    .from("index_project_credentials")
    .upsert({
      index_id: archiveId,
      owner_user_id: ownerUserId,
      supabase_project_ref: projectRef,
      supabase_project_url: projectUrl,
      supabase_publishable_key: publishableKey,
      supabase_secret_key_encrypted: encryptTokenValue(secretKey),
      token_encryption_key_version: getTokenEncryptionVersion(),
      repo_owner: repoOwner,
      repo_name: repoName,
      repo_full_name: repoFullName,
      repo_url: repoUrl,
    });
  if (credentialsError) {
    throw new HttpError(
      500,
      credentialsError.message || "Failed to save child project credentials.",
    );
  }

  const parentConnectionUuid = buildIndexParentConnectionUuid({
    sourceIndexId: archiveId,
    targetIndexId: parentIndexId,
  });
  if (parentConnectionUuid) {
    const nowIso = new Date().toISOString();
    const { error: connectionError } = await supabase.from("connections").upsert(
      {
        connection_uuid: parentConnectionUuid,
        source_index_id: archiveId,
        target_site_id: null,
        target_index_id: parentIndexId,
        source_requested_by_user_id: ownerUserId,
        responded_by_user_id: ownerUserId,
        status: "approved",
        responded_at: nowIso,
      },
      { onConflict: "connection_uuid" },
    );
    if (connectionError) {
      throw new HttpError(
        500,
        connectionError.message || "Failed to save parent index connection.",
      );
    }
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or Supabase service key.",
    });
  }

  const internalKey = event.headers["x-provision-internal-key"] ??
    event.headers["X-Provision-Internal-Key"];
  if (!internalKey || internalKey !== SUPABASE_SERVICE_KEY) {
    return safeJson(401, { error: "Unauthorized background worker dispatch." });
  }

  let payload: WorkerBody;
  try {
    payload = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload.",
    });
  }

  const jobId = payload.jobId?.trim() ?? "";
  const ownerUserId = payload.ownerUserId?.trim() ?? "";
  const repoName = payload.name?.trim() ?? "";
  const title = payload.title?.trim() ?? "";
  const description = payload.description?.trim() ?? "";
  const organizationId = payload.organizationId?.trim() ?? "";
  const organizationSlug = payload.organizationSlug?.trim() ?? "";
  const organizationName = payload.organizationName?.trim() ?? "";

  if (
    !jobId || !ownerUserId || !repoName || !title || !description ||
    !organizationId || !organizationSlug
  ) {
    return safeJson(400, {
      error: "Missing required worker payload values.",
    });
  }

  const supabase = createSupabaseAdmin();

  const updateJob = async (patch: Record<string, unknown>) => {
    const { error: updateError } = await supabase
      .from("index_provision_jobs")
      .update(patch)
      .eq("id", jobId)
      .eq("owner_user_id", ownerUserId);

    if (updateError) {
      console.log("[index-create-worker] failed to update job", {
        jobId,
        ownerUserId,
        message: updateError.message,
      });
    }
  };

  waitUntil((async () => {
    let createdOwner = "";
    let createdRepo = "";
    let createdProjectRef = "";
    let reservedIndexId = "";
    let parentIndexMetadataSaved = false;
    let userToken = "";
    const solidaryAppUrl = getSolidaryAppUrl();
    let parentIndexId = "";
    let parentIndexUrl = "";
    let parentIndexLevel = getSolidaryRootIndexLevel();
    let parentRepoFullName = getSolidaryRootRepoFullName();
    let parentRepoUrl = getSolidaryRootRepoUrl();
    let parentProjectUrl = SUPABASE_URL;
    let parentPublishableKey =
      (Deno.env.get("SOLIDARY_PUBLISHABLE_KEY") ??
        Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "").trim();
    let indexLevel = parentIndexLevel + 1;

    await updateJob({
      status: "running",
      step: "Preparing index provisioning...",
      error: null,
      started_at: new Date().toISOString(),
    });

    try {
      await updateJob({
        step: "Resolving Solidary root index...",
      });
      const rootIndex = await resolveSolidaryRootIndexContext(supabase);
      parentIndexId = rootIndex.parentIndexId;
      parentIndexUrl = rootIndex.parentIndexUrl;
      parentIndexLevel = rootIndex.parentIndexLevel;
      parentRepoFullName = rootIndex.parentRepoFullName;
      parentRepoUrl = rootIndex.parentRepoUrl;
      parentProjectUrl = rootIndex.parentProjectUrl;
      parentPublishableKey = rootIndex.parentPublishableKey;
      indexLevel = parentIndexLevel + 1;

      if (!isValidRepoFullName(parentRepoFullName)) {
        throw new HttpError(
          500,
          "Solidary root source repository is not configured as owner/repo.",
        );
      }
      if (!parentProjectUrl || !parentPublishableKey) {
        throw new HttpError(
          500,
          "Solidary root federation credentials are not configured.",
        );
      }

      const resolvedGitHubAuth = await resolveGitHubTokenForUser({
        supabase,
        userId: ownerUserId,
      });
      if (!resolvedGitHubAuth?.token) {
        const credentialPresence = await getGitHubCredentialPresenceForUser({
          supabase,
          userId: ownerUserId,
        }).catch(() => null);
        throw new HttpError(
          412,
          credentialPresence?.hasGitHubRow
            ? "GitHub App authorization is required for owner repository actions. Reconnect GitHub App from Profile and retry."
            : "GitHub authorization missing. Sign in with GitHub again from Profile settings and retry.",
        );
      }
      userToken = resolvedGitHubAuth.token;

      await updateJob({
        step: "Resolving Supabase management access...",
      });
      let managementAccessToken = "";
      try {
        managementAccessToken = (
          await resolveSupabaseManagementAccessForUser({
            supabase,
            userId: ownerUserId,
          })
        ).accessToken;
      } catch (error) {
        if (error instanceof SupabaseManagementReauthError) {
          throw new HttpError(
            412,
            "Reconnect your Supabase account and retry.",
          );
        }
        throw error;
      }

      await updateJob({
        step: "Loading index template...",
      });
      const templateFiles = loadTemplateFiles();

      await updateJob({
        step: "Reserving index slug...",
      });
      const archiveId = crypto.randomUUID();
      reservedIndexId = archiveId;
      await reserveParentIndexMetadata({
        supabase,
        indexId: archiveId,
        ownerUserId,
        slug: repoName,
        title,
        description,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
        parentRepoFullName,
        parentRepoUrl,
      });

      await updateJob({
        step: "Creating GitHub repository...",
      });
      const { res: newRepoRes, data: newRepoData } = await ghUser<
        GhRepoPayload
      >(
        userToken,
        `${GITHUB_API}/user/repos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: repoName,
            description,
            private: false,
            auto_init: true,
          }),
        },
      );
      assertOk(newRepoRes, newRepoData, "Failed to create repository.");

      const owner = newRepoData?.owner?.login?.trim() ?? "";
      const repo = newRepoData?.name?.trim() ?? "";
      if (!owner || !repo) {
        throw new HttpError(
          500,
          "Repository created but response missing owner/name.",
        );
      }
      createdOwner = owner;
      createdRepo = repo;

      const initialDefaultBranch = newRepoData.default_branch?.trim() ||
        TARGET_DEFAULT_BRANCH;
      const initialHeadSha = await getBranchHeadSha({
        userToken,
        owner,
        repo,
        branch: initialDefaultBranch,
      });
      if (initialDefaultBranch !== TARGET_DEFAULT_BRANCH) {
        await updateJob({
          step: "Creating main branch...",
        });
        await createBranchIfMissing({
          userToken,
          owner,
          repo,
          branch: TARGET_DEFAULT_BRANCH,
          fromSha: initialHeadSha,
        });
      }

      const siteUrl = resolveSiteUrlForRepo(owner, repo);
      await updateJob({
        step: "Creating Supabase project...",
      });
      const createdProject = await createSupabaseProject({
        accessToken: managementAccessToken,
        name: title,
        organizationSlug,
      });

      const resolvedProject = await resolveCreatedProject({
        accessToken: managementAccessToken,
        createdProject,
        organizationId,
        organizationSlug,
      });
      const projectRef = resolvedProject.ref?.trim() ?? "";
      if (!projectRef) {
        throw new HttpError(500, "Supabase project ref is missing.");
      }
      createdProjectRef = projectRef;

      const projectDashboardUrl = getProjectDashboardUrl(projectRef);
      const projectUrl = getProjectUrl(projectRef);
      const defaultImageUrl =
        normalizeRepoImageContent(payload.imageContentB64?.trim())
          ? resolveAbsoluteAssetUrl({
            siteUrl,
            assetPath: DEFAULT_INDEX_IMAGE_PATH,
          })
          : "";

      await updateJob({
        step: "Retrieving project API keys...",
        project_payload: {
          id: resolvedProject.id ?? null,
          ref: projectRef,
          name: resolvedProject.name ?? title,
          organization_id: organizationId,
          organization_slug: organizationSlug,
          region: resolvedProject.region ?? null,
          status: resolvedProject.status ?? null,
          dashboard_url: projectDashboardUrl,
          project_url: projectUrl,
        },
      });
      const { publishableKey, secretKey } = await ensureProjectApiKeys({
        accessToken: managementAccessToken,
        projectRef,
      });
      await ensureProjectFunctionSecrets({
        accessToken: managementAccessToken,
        projectRef,
        publishableKey,
        secretKey,
      });

      await updateJob({
        step: "Bootstrapping database schema...",
      });
      await bootstrapProjectDatabase({
        accessToken: managementAccessToken,
        projectRef,
        indexId: archiveId,
        slug: repoName,
        title,
        description,
        canonicalUrl: siteUrl,
        imageUrl: defaultImageUrl,
        projectUrl,
        publishableKey,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
        parentRepoFullName,
        parentRepoUrl,
      });

      await syncChildRootArchive({
        accessToken: managementAccessToken,
        archiveId,
        slug: repoName,
        title,
        description,
        siteUrl,
        imageUrl: defaultImageUrl,
        repoFullName: `${owner}/${repo}`,
        repoUrl: `https://github.com/${owner}/${repo}`,
        projectId: resolvedProject.id ?? null,
        projectRef,
        projectName: resolvedProject.name ?? title,
        projectUrl,
        projectDashboardUrl,
        publishableKey,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
        parentRepoFullName,
        parentRepoUrl,
      });

      await updateJob({
        step: "Creating repository files...",
      });
      const filesForRepo = applyIndexTemplateOverrides({
        files: templateFiles,
        title,
        description,
        slug: repoName,
        archiveId,
        repoFullName: `${owner}/${repo}`,
        repoUrl: `https://github.com/${owner}/${repo}`,
        projectRef,
        projectUrl,
        projectDashboardUrl,
        publishableKey,
        siteUrl,
        solidaryAppUrl,
        solidarySupabaseUrl: SUPABASE_URL,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
        imageContentB64: payload.imageContentB64?.trim(),
        imageThumbContentB64: payload.imageThumbContentB64?.trim(),
      });
      await createTemplateSeedCommit({
        userToken,
        owner,
        repo,
        branch: TARGET_DEFAULT_BRANCH,
        files: filesForRepo,
        onProgress: async (completed, total) => {
          const percent = Math.max(
            1,
            Math.round((completed / Math.max(1, total)) * 100),
          );
          await updateJob({
            step: `Creating repository files (${percent}%)...`,
          });
        },
      });
      await setDefaultBranch({
        userToken,
        owner,
        repo,
        branch: TARGET_DEFAULT_BRANCH,
      });

      await updateJob({
        step: "Enabling GitHub Pages...",
      });
      await enableGitHubPages({
        userToken,
        owner,
        repo,
        branch: TARGET_DEFAULT_BRANCH,
      });

      const repoPayload = await getRepo({ userToken, owner, repo });
      const archivePayload = {
        id: archiveId,
        type: "index",
        is_root: false,
        runtime_mode: "scaffold",
        title,
        slug: repoName,
        description,
        image_url: defaultImageUrl || null,
        index_level: indexLevel,
        parent_index_id: parentIndexId,
        parent_index_url: parentIndexUrl,
        parent_index_level: parentIndexLevel,
        parent_repo_full_name: parentRepoFullName || null,
        parent_repo_url: parentRepoUrl || null,
        canonical_url: siteUrl,
        repo_full_name: repoPayload.full_name ?? `${owner}/${repo}`,
        repo_url: repoPayload.html_url ?? `https://github.com/${owner}/${repo}`,
      };

      await updateJob({
        step: "Saving index metadata...",
      });
      await saveParentIndexMetadata({
        supabase,
        archiveId,
        ownerUserId,
        slug: repoName,
        title,
        description,
        siteUrl,
        imageUrl: defaultImageUrl,
        repoOwner: owner,
        repoName: repo,
        repoFullName: archivePayload.repo_full_name,
        repoUrl: archivePayload.repo_url,
        projectId: resolvedProject.id ?? null,
        projectRef,
        projectName: resolvedProject.name ?? title,
        projectUrl,
        projectDashboardUrl,
        publishableKey,
        secretKey,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
        parentRepoFullName,
        parentRepoUrl,
      });

      const childSupabase = createProjectAdmin(projectUrl, secretKey);
      await ensureFederationPeerPair({
        parentSupabase: supabase,
        parentIndexId,
        parentProjectUrl,
        parentPublishableKey,
        childProjectUrl: projectUrl,
        childPublishableKey: publishableKey,
        childSecretKey: secretKey,
        childIndexId: archiveId,
      });

      await Promise.all([
        enqueueAuthoritativeFederationSnapshot({
          supabase,
          targetRemoteIndexId: archiveId,
        }),
        enqueueAuthoritativeFederationSnapshot({
          supabase: childSupabase,
          targetRemoteIndexId: parentIndexId,
        }),
      ]);
      await Promise.all([
        dispatchFederationQueueNow({ supabase }),
        dispatchFederationQueueNow({ supabase: childSupabase }),
      ]);
      parentIndexMetadataSaved = true;

      await updateJob({
        status: "succeeded",
        step: "Index provisioning completed.",
        error: null,
        index_id: archiveId,
        repo_full_name: archivePayload.repo_full_name,
        repo_payload: repoPayload,
        index_payload: archivePayload,
        project_payload: {
          id: resolvedProject.id ?? null,
          ref: projectRef,
          name: resolvedProject.name ?? title,
          organization_id: organizationId,
          organization_slug: organizationSlug,
          organization_name: organizationName || null,
          region: resolvedProject.region ?? null,
          status: resolvedProject.status ?? null,
          dashboard_url: projectDashboardUrl,
          project_url: projectUrl,
          publishable_key: publishableKey,
        },
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      if (createdOwner && createdRepo && userToken) {
        await updateJob({
          step: "Cleanup: deleting partial repository...",
        });
        await cleanupRepo({
          userToken,
          owner: createdOwner,
          repo: createdRepo,
        });
      }
      if (reservedIndexId && !parentIndexMetadataSaved) {
        await releaseReservedParentIndexMetadata({
          supabase,
          indexId: reservedIndexId,
          ownerUserId,
        });
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      await updateJob({
        status: "failed",
        step: "Index provisioning failed.",
        error: createdProjectRef
          ? `${message} Created project ref: ${createdProjectRef}.`
          : message,
        completed_at: new Date().toISOString(),
      });
    }
  })());

  return safeJson(202, {
    status: "accepted",
    jobId,
  });
};

Deno.serve((request) => runHandler(request, handler));
