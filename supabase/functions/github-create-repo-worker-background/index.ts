import { runHandler } from "../_shared/request-adapter.ts";
import { Buffer } from "node:buffer";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  getGitHubCredentialPresenceForUser,
  resolveGitHubTokenForUser
} from "../_shared/github-auth-broker.ts";
import { auditGitHubRepoAction } from "../_shared/github-repo-guardrails.ts";
import { bundledTemplateFiles } from "./template-files.ts";

const GITHUB_API = "https://api.github.com";
const TARGET_DEFAULT_BRANCH = "main";
const BRANCH_READY_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000];
const GITHUB_WRITE_RETRY_DELAYS_MS = [0, 200, 500, 1000, 2000, 4000];
const STORAGE_DOWNLOAD_RETRY_DELAYS_MS = [0, 250, 500, 1000, 2000];
const RETRYABLE_GITHUB_STATUS = new Set([404, 409, 422, 429, 500, 502, 503, 504]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CREATE_SITE_SUPABASE_API_KEY = Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const SITE_DRAFT_IMAGES_BUCKET = "site-draft-images";
const SOLIDARY_CONTENT_FILE_REL_PATH = "src/content/solidary.md";
const HEADER_CONTENT_FILE_REL_PATH = "src/content/header.md";
const FOOTER_CONTENT_FILE_REL_PATH = "src/content/footer.md";
const SOLIDARY_FILE_REL_PATH = "public/.well-known/solidary.json";
const SOLIDARY_LINKS_FILE_REL_PATH = "public/.well-known/solidary-links.json";
const SOLIDARY_MEDIA_IMAGE_ROOT = "public/solidary-media/images/";
const DEFAULT_OG_IMAGE_URL = "/solidary-media/images/og/og-home.jpg";
const SOLIDARY_LINKS_SITE_TYPE = "site";

const SOLIDARY_METADATA_TEMPLATE = {
  protocol_version: "1.0",
  site_id: "",
  site_url: "",
  title: "",
  site_image: "",
  site_image_thumb: "",
  description: ""
} as const;

const SOLIDARY_LINKS_TEMPLATE = {
  "@context": {
    site_id: "urn:solidary:term:site_id",
    site_url: {
      "@id": "urn:solidary:term:site_url",
      "@type": "@id"
    },
    connections: {
      "@id": "urn:solidary:term:connections",
      "@container": "@set"
    },
    connection_uuid: "urn:solidary:term:connection_uuid",
    connected_site: "urn:solidary:term:connected_site"
  },
  "@id": "",
  "@type": SOLIDARY_LINKS_SITE_TYPE,
  site_id: "",
  site_url: "",
  connections: []
} as const;

const DEFAULT_FOOTER_MODULES = [
  { content: "%copyright%", alignment: "left" },
  { content: "", alignment: "center" },
  { content: "", alignment: "right" }
] as const;

type GhErrorPayload = { message?: string; documentation_url?: string };
type GhRepoPayload = {
  default_branch?: string;
  full_name?: string;
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

type FileRecord = {
  relPath: string;
  mode: "100644" | "100755";
  contentB64: string;
};

type ProvisionWorkerBody = {
  jobId?: string;
  ownerUserId?: string;
  name?: string;
  description?: string;
  private?: boolean;
  siteId?: string;
  siteTitle?: string;
  siteDescription?: string;
  siteImagePath?: string;
  siteImageStoragePath?: string;
  siteImageContentB64?: string;
  siteImageThumbPath?: string;
  siteImageThumbStoragePath?: string;
  siteImageThumbContentB64?: string;
  ogImagePath?: string;
  ogImageStoragePath?: string;
  ogImageContentB64?: string;
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const WORKFLOW_SCOPE_ERROR_MESSAGE =
  "GitHub token is missing permission to write workflow files. Reconnect GitHub and verify workflow access.";

function safeJson(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

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

  // Local fallback when EdgeRuntime is unavailable.
  void promise.catch((error) => {
    console.error("[github-create-repo-worker] background task failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  });
};

const parseBody = (rawBody: string | null): ProvisionWorkerBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as ProvisionWorkerBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const resolveSiteUrlForRepo = (owner: string, repo: string) => {
  const pagesRootUrl = `https://${owner}.github.io`;
  const isUserSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  return isUserSite ? pagesRootUrl : `${pagesRootUrl}/${repo}`;
};

const normalizePublicAssetPath = (assetPath: string) =>
  `/${assetPath.trim().replace(/^public\//, "").replace(/^\/+/, "")}`;

const resolveAbsoluteAssetUrl = ({ siteUrl, assetPath }: { siteUrl: string; assetPath: string }) => {
  const normalizedAssetPath = normalizePublicAssetPath(assetPath);

  try {
    const base = new URL(siteUrl);
    const basePath = base.pathname.replace(/\/$/, "");
    base.pathname = `${basePath}${normalizedAssetPath}`.replace(/\/{2,}/g, "/");
    base.search = "";
    base.hash = "";
    return base.toString();
  } catch {
    return normalizedAssetPath;
  }
};

const normalizeRepoImagePath = (pathValue: string, label = "Image") => {
  const normalized = pathValue.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) {
    throw new Error(`${label} path is empty.`);
  }
  if (!normalized.startsWith(SOLIDARY_MEDIA_IMAGE_ROOT)) {
    throw new Error(`${label} path must start with ${SOLIDARY_MEDIA_IMAGE_ROOT}.`);
  }
  if (normalized.split("/").includes("..")) {
    throw new Error(`${label} path contains invalid segments.`);
  }
  return normalized;
};

const normalizeStoragePath = (pathValue: string) => {
  const normalized = pathValue.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("Site image storage path is empty.");
  }
  if (normalized.split("/").includes("..")) {
    throw new Error("Site image storage path contains invalid segments.");
  }
  return normalized;
};

const formatFrontmatterValue = (value: unknown) => JSON.stringify(value);

const renderFrontmatter = (updates: Record<string, unknown>) =>
  Object.entries(updates)
    .map(([key, value]) => `${key}: ${formatFrontmatterValue(value)}`)
    .join("\n");

const replaceFrontmatterFields = (content: string, updates: Record<string, unknown>) => {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
  if (!match) {
    const normalizedBody = content.trim().length ? `\n${content}` : "\n";
    return `---\n${renderFrontmatter(updates)}\n---${normalizedBody}`;
  }

  const body = match[2] ?? "\n";
  const normalizedBody = body.startsWith("\n") || body.startsWith("\r\n") ? body : `\n${body}`;

  return `---\n${renderFrontmatter(updates)}\n---${normalizedBody}`;
};

const updateTemplateMarkdownFrontmatter = ({
  filesByPath,
  relPath,
  updates
}: {
  filesByPath: Map<string, FileRecord>;
  relPath: string;
  updates: Record<string, unknown>;
}) => {
  const current = filesByPath.get(relPath);
  if (!current) {
    filesByPath.set(relPath, {
      relPath,
      mode: "100644",
      contentB64: Buffer.from(`---\n${renderFrontmatter(updates)}\n---\n`, "utf8").toString("base64")
    });
    return;
  }

  const source = Buffer.from(current.contentB64, "base64").toString("utf8");
  const rendered = replaceFrontmatterFields(source, updates);
  filesByPath.set(relPath, {
    ...current,
    contentB64: Buffer.from(rendered, "utf8").toString("base64")
  });
};

function renderSolidaryMetadataFile({
  siteId,
  title,
  description,
  siteUrl,
  siteImageUrl,
  siteImageThumbUrl
}: {
  siteId: string;
  title: string;
  description: string;
  siteUrl: string;
  siteImageUrl: string;
  siteImageThumbUrl: string;
}) {
  return `${JSON.stringify(
    {
      ...SOLIDARY_METADATA_TEMPLATE,
      site_id: siteId,
      site_url: siteUrl,
      title,
      site_image: siteImageUrl,
      site_image_thumb: siteImageThumbUrl,
      description
    },
    null,
    2
  )}\n`;
}

function renderSolidaryLinksFile({
  siteId,
  siteUrl
}: {
  siteId: string;
  siteUrl: string;
}) {
  return `${JSON.stringify(
    {
      ...SOLIDARY_LINKS_TEMPLATE,
      "@id": siteUrl,
      site_id: siteId,
      site_url: siteUrl,
      connections: []
    },
    null,
    2
  )}\n`;
}

function applyCreateFlowOverridesToTemplateFiles({
  files,
  owner,
  repo,
  siteId,
  siteTitle,
  siteDescription,
  siteImagePath,
  siteImageContentB64,
  siteImageThumbPath,
  siteImageThumbContentB64,
  ogImagePath,
  ogImageContentB64
}: {
  files: FileRecord[];
  owner: string;
  repo: string;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  siteImagePath: string;
  siteImageContentB64: string;
  siteImageThumbPath: string;
  siteImageThumbContentB64: string;
  ogImagePath: string;
  ogImageContentB64: string;
}) {
  const resolvedSiteId = siteId || crypto.randomUUID();
  const resolvedTitle = siteTitle.trim();
  const resolvedDescription = siteDescription.trim();
  if (!resolvedTitle) {
    throw new Error("Create flow metadata is missing site title.");
  }
  if (!resolvedDescription) {
    throw new Error("Create flow metadata is missing site description.");
  }
  const siteUrl = resolveSiteUrlForRepo(owner, repo);
  const siteImageRelPath = siteImagePath ? normalizeRepoImagePath(siteImagePath, "Site image") : "";
  const siteImageThumbRelPath = siteImageThumbPath
    ? normalizeRepoImagePath(siteImageThumbPath, "Site image thumbnail")
    : "";
  const ogImageRelPath = ogImagePath ? normalizeRepoImagePath(ogImagePath, "OG image") : "";
  const ogImageUrl = resolveAbsoluteAssetUrl({
    siteUrl,
    assetPath: ogImageRelPath || DEFAULT_OG_IMAGE_URL
  });
  const siteImageUrl = siteImageRelPath
    ? resolveAbsoluteAssetUrl({
        siteUrl,
        assetPath: siteImageRelPath
      })
    : "";
  const siteImageThumbUrl = siteImageThumbRelPath
    ? resolveAbsoluteAssetUrl({
        siteUrl,
        assetPath: siteImageThumbRelPath
      })
    : "";

  const nextByPath = new Map<string, FileRecord>(files.map((file) => [file.relPath, file]));

  updateTemplateMarkdownFrontmatter({
    filesByPath: nextByPath,
    relPath: SOLIDARY_CONTENT_FILE_REL_PATH,
    updates: {
      title: resolvedTitle,
      description: resolvedDescription,
      url: siteUrl,
      ogImage: ogImageUrl
    }
  });
  updateTemplateMarkdownFrontmatter({
    filesByPath: nextByPath,
    relPath: HEADER_CONTENT_FILE_REL_PATH,
    updates: {
      disabled: false,
      fixed: false,
      brandText: resolvedTitle,
      disableBrand: false
    }
  });
  updateTemplateMarkdownFrontmatter({
    filesByPath: nextByPath,
    relPath: FOOTER_CONTENT_FILE_REL_PATH,
    updates: {
      disabled: false,
      fixed: false,
      modules: DEFAULT_FOOTER_MODULES
    }
  });

  nextByPath.set(SOLIDARY_FILE_REL_PATH, {
    relPath: SOLIDARY_FILE_REL_PATH,
    mode: "100644",
    contentB64: Buffer.from(
      renderSolidaryMetadataFile({
        siteId: resolvedSiteId,
        title: resolvedTitle,
        description: resolvedDescription,
        siteUrl,
        siteImageUrl,
        siteImageThumbUrl
      }),
      "utf8"
    ).toString("base64")
  });
  nextByPath.set(SOLIDARY_LINKS_FILE_REL_PATH, {
    relPath: SOLIDARY_LINKS_FILE_REL_PATH,
    mode: "100644",
    contentB64: Buffer.from(
      renderSolidaryLinksFile({
        siteId: resolvedSiteId,
        siteUrl
      }),
      "utf8"
    ).toString("base64")
  });

  if (siteImageRelPath && siteImageContentB64) {
    nextByPath.set(siteImageRelPath, {
      relPath: siteImageRelPath,
      mode: "100644",
      contentB64: siteImageContentB64
    });
  }
  if (siteImageThumbRelPath && siteImageThumbContentB64) {
    nextByPath.set(siteImageThumbRelPath, {
      relPath: siteImageThumbRelPath,
      mode: "100644",
      contentB64: siteImageThumbContentB64
    });
  }
  if (ogImageRelPath && ogImageContentB64) {
    nextByPath.set(ogImageRelPath, {
      relPath: ogImageRelPath,
      mode: "100644",
      contentB64: ogImageContentB64
    });
  }

  return Array.from(nextByPath.values());
}

const createSupabaseAdmin = () =>
  createClient(SUPABASE_URL, CREATE_SITE_SUPABASE_API_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

async function loadStagedSiteImageContentB64({
  supabase,
  storagePath
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  storagePath: string;
}) {
  const normalizedStoragePath = normalizeStoragePath(storagePath);
  let lastErrorMessage = "Failed to download staged site image.";

  for (let attempt = 0; attempt < STORAGE_DOWNLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = STORAGE_DOWNLOAD_RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      await sleep(delay);
    }

    const { data, error } = await supabase.storage
      .from(SITE_DRAFT_IMAGES_BUCKET)
      .download(normalizedStoragePath);

    if (!error && data) {
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer).toString("base64");
    }

    lastErrorMessage = error?.message?.trim() || "Failed to download staged site image.";
    const looksRetryableMissingObject = /not found|does not exist|404/i.test(lastErrorMessage);
    if (!looksRetryableMissingObject) {
      break;
    }
  }

  throw new Error(`Failed to load staged site image (${lastErrorMessage}).`);
}

async function cleanupStagedSiteImage({
  supabase,
  storagePath
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  storagePath: string;
}) {
  let normalizedStoragePath = "";
  try {
    normalizedStoragePath = normalizeStoragePath(storagePath);
  } catch {
    return;
  }

  const { error } = await supabase.storage.from(SITE_DRAFT_IMAGES_BUCKET).remove([normalizedStoragePath]);
  if (error) {
    console.log("[github-create-repo-worker] failed to delete staged site image", {
      storagePath: normalizedStoragePath,
      message: error.message
    });
  }
}

async function ghUser<T>(userToken: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${userToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {})
    }
  });

  const data = (await res.json().catch(() => ({}))) as T;
  return { res, data };
}

async function ghUserWithRetry<T>({
  userToken,
  url,
  init,
  delaysMs,
  shouldRetry
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

async function loadTemplateFiles(): Promise<FileRecord[]> {
  if (!bundledTemplateFiles.length) {
    throw new Error("Template bundle is empty. Regenerate template-files.ts.");
  }
  return bundledTemplateFiles.map((file) => ({ ...file }));
}

function getGhErrorMessage(payload: unknown, fallback: string) {
  const maybePayload = payload as GhErrorPayload;
  const message = typeof maybePayload?.message === "string" ? maybePayload.message.trim() : "";
  const docs = typeof maybePayload?.documentation_url === "string" ? maybePayload.documentation_url.trim() : "";
  if (!message && !docs) return fallback;
  if (message && docs) return `${fallback} (${message}; ${docs})`;
  return `${fallback} (${message || docs})`;
}

function assertOk(res: Response, payload: unknown, fallbackMessage: string) {
  if (!res.ok) {
    throw new HttpError(res.status, getGhErrorMessage(payload, fallbackMessage));
  }
}

async function getBranchHeadSha({
  userToken,
  owner,
  repo,
  branch
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
}) {
  const branchUrl = `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`;
  const { res, data } = await ghUserWithRetry<GhBranchPayload | GhErrorPayload>({
    userToken,
    url: branchUrl,
    delaysMs: BRANCH_READY_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertOk(res, data, `Failed to read ${branch} branch for ${owner}/${repo}.`);

  const sha = typeof (data as GhBranchPayload)?.commit?.sha === "string" ? (data as GhBranchPayload).commit?.sha : undefined;
  if (!sha) {
    throw new HttpError(500, `Branch ${branch} for ${owner}/${repo} does not contain a head commit SHA.`);
  }
  return sha;
}

async function createBranchIfMissing({
  userToken,
  owner,
  repo,
  branch,
  fromSha
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
        sha: fromSha
      })
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });

  if (res.ok || res.status === 422) return;
  assertOk(res, data, `Failed creating ${branch} branch for ${owner}/${repo}.`);
}

async function getCommitTreeSha({
  userToken,
  owner,
  repo,
  commitSha
}: {
  userToken: string;
  owner: string;
  repo: string;
  commitSha: string;
}) {
  const { res, data } = await ghUserWithRetry<GhCommitPayload | GhErrorPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${commitSha}`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertOk(res, data, `Failed reading commit ${commitSha} for ${owner}/${repo}.`);

  const treeSha = typeof (data as GhCommitPayload)?.tree?.sha === "string" ? (data as GhCommitPayload).tree?.sha : "";
  if (!treeSha) {
    throw new HttpError(500, `Commit ${commitSha} for ${owner}/${repo} does not contain a tree SHA.`);
  }
  return treeSha;
}

async function createTemplateSeedCommit({
  userToken,
  owner,
  repo,
  branch,
  files,
  onProgress
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
  files: FileRecord[];
  onProgress?: (completed: number, total: number) => Promise<void>;
}) {
  const sortedFiles = [...files].sort((a, b) => a.relPath.localeCompare(b.relPath));
  if (!sortedFiles.length) {
    throw new HttpError(500, "Template directory is empty.");
  }

  const hasWorkflowFile = sortedFiles.some((file) => file.relPath.startsWith(".github/workflows/"));
  const assertWorkflowPermission = (statusCode: number) => {
    if (statusCode === 403 && hasWorkflowFile) {
      throw new HttpError(403, WORKFLOW_SCOPE_ERROR_MESSAGE);
    }
  };

  const parentCommitSha = await getBranchHeadSha({
    userToken,
    owner,
    repo,
    branch
  });
  const baseTreeSha = await getCommitTreeSha({
    userToken,
    owner,
    repo,
    commitSha: parentCommitSha
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
    const { res: blobRes, data: blobData } = await ghUserWithRetry<GhBlobPayload | GhErrorPayload>({
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: file.contentB64,
          encoding: "base64"
        })
      },
      delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
    });
    assertWorkflowPermission(blobRes.status);
    assertOk(blobRes, blobData, `Failed creating blob for ${file.relPath}.`);

    const blobSha = typeof (blobData as GhBlobPayload)?.sha === "string" ? (blobData as GhBlobPayload).sha : "";
    if (!blobSha) {
      throw new HttpError(500, `GitHub did not return blob SHA for ${file.relPath}.`);
    }

    treeEntries.push({
      path: file.relPath,
      mode: file.mode,
      type: "blob",
      sha: blobSha
    });

    const current = completed + 1;
    if (onProgress && (current === total || current % 5 === 0)) {
      await onProgress(current, total);
    }
  }

  const { res: treeRes, data: treeData } = await ghUserWithRetry<GhTreePayload | GhErrorPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries
      })
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertWorkflowPermission(treeRes.status);
  assertOk(treeRes, treeData, "Failed creating template tree.");

  const treeSha = typeof (treeData as GhTreePayload)?.sha === "string" ? (treeData as GhTreePayload).sha : "";
  if (!treeSha) {
    throw new HttpError(500, "GitHub did not return tree SHA for template commit.");
  }

  const { res: commitRes, data: commitData } = await ghUserWithRetry<GhCommitPayload | GhErrorPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Initialize repository from template",
        tree: treeSha,
        parents: [parentCommitSha]
      })
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertWorkflowPermission(commitRes.status);
  assertOk(commitRes, commitData, "Failed creating template commit.");

  const commitSha = typeof (commitData as GhCommitPayload)?.sha === "string" ? (commitData as GhCommitPayload).sha : "";
  if (!commitSha) {
    throw new HttpError(500, "GitHub did not return commit SHA for template commit.");
  }

  const { res: refRes, data: refData } = await ghUserWithRetry<GhErrorPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sha: commitSha,
        force: false
      })
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertWorkflowPermission(refRes.status);
  assertOk(refRes, refData, `Failed updating ${branch} branch to template commit.`);
}

async function setDefaultBranch({
  userToken,
  owner,
  repo,
  branch
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
      body: JSON.stringify({ default_branch: branch })
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertOk(res, data, "Failed setting default branch.");
}

async function getRepo({
  userToken,
  owner,
  repo
}: {
  userToken: string;
  owner: string;
  repo: string;
}) {
  const { res, data } = await ghUserWithRetry<GhRepoPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertOk(res, data, "Failed reading repository.");
  return data;
}

async function cleanupRepo({
  userToken,
  owner,
  repo
}: {
  userToken: string;
  owner: string;
  repo: string;
}) {
  const { res, data } = await ghUser<any>(userToken, `${GITHUB_API}/repos/${owner}/${repo}`, {
    method: "DELETE"
  });

  if (!res.ok && res.status !== 404) {
    console.log("[github-create-repo] cleanup failed", {
      owner,
      repo,
      status: res.status,
      message: getGhErrorMessage(data, "Failed cleanup")
    });
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  if (!SUPABASE_URL || !CREATE_SITE_SUPABASE_API_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or CREATE_SITE_SUPABASE_API_KEY."
    });
  }

  const internalKey =
    event.headers["x-provision-internal-key"] ?? event.headers["X-Provision-Internal-Key"];
  if (!internalKey || internalKey !== CREATE_SITE_SUPABASE_API_KEY) {
    return safeJson(401, { error: "Unauthorized background worker dispatch." });
  }

  let payload: ProvisionWorkerBody;
  try {
    payload = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload."
    });
  }

  const jobId = payload.jobId?.trim() ?? "";
  const ownerUserId = payload.ownerUserId?.trim() ?? "";
  const parsedName = payload.name?.trim() ?? "";
  const rawSiteImageStoragePath = payload.siteImageStoragePath?.trim() ?? "";
  const rawSiteImageThumbStoragePath = payload.siteImageThumbStoragePath?.trim() ?? "";
  const rawOgImageStoragePath = payload.ogImageStoragePath?.trim() ?? "";

  if (!jobId || !ownerUserId || !parsedName) {
    return safeJson(400, {
      error: "Missing jobId, ownerUserId, or name."
    });
  }

  let siteImageStoragePath = "";
  let siteImageThumbStoragePath = "";
  let ogImageStoragePath = "";
  if (rawSiteImageStoragePath) {
    try {
      siteImageStoragePath = normalizeStoragePath(rawSiteImageStoragePath);
    } catch (error) {
      return safeJson(400, {
        error: error instanceof Error ? error.message : "Invalid siteImageStoragePath."
      });
    }

    if (!siteImageStoragePath.startsWith(`${ownerUserId}/`)) {
      return safeJson(403, {
        error: "siteImageStoragePath must be scoped to the job owner."
      });
    }
  }
  if (rawSiteImageThumbStoragePath) {
    try {
      siteImageThumbStoragePath = normalizeStoragePath(rawSiteImageThumbStoragePath);
    } catch (error) {
      return safeJson(400, {
        error: error instanceof Error ? error.message : "Invalid siteImageThumbStoragePath."
      });
    }

    if (!siteImageThumbStoragePath.startsWith(`${ownerUserId}/`)) {
      return safeJson(403, {
        error: "siteImageThumbStoragePath must be scoped to the job owner."
      });
    }
  }
  if (rawOgImageStoragePath) {
    try {
      ogImageStoragePath = normalizeStoragePath(rawOgImageStoragePath);
    } catch (error) {
      return safeJson(400, {
        error: error instanceof Error ? error.message : "Invalid ogImageStoragePath."
      });
    }

    if (!ogImageStoragePath.startsWith(`${ownerUserId}/`)) {
      return safeJson(403, {
        error: "ogImageStoragePath must be scoped to the job owner."
      });
    }
  }

  const supabase = createSupabaseAdmin();
  const updateJob = async (patch: Record<string, unknown>) => {
    const { error: updateError } = await supabase
      .from("repo_provision_jobs")
      .update(patch)
      .eq("id", jobId)
      .eq("owner_user_id", ownerUserId);

    if (updateError) {
      console.log("[github-create-repo-worker] failed to update job", {
        jobId,
        ownerUserId,
        message: updateError.message
      });
    }
  };

  waitUntil((async () => {
    let createdOwner = "";
    let createdRepo = "";
    let userToken = "";

    await updateJob({
      status: "running",
      step: "Preparing repository provisioning...",
      error: null,
      started_at: new Date().toISOString()
    });

    try {
      const resolvedGitHubAuth = await resolveGitHubTokenForUser({
        supabase,
        userId: ownerUserId
      });
      if (!resolvedGitHubAuth?.token) {
        const credentialPresence = await getGitHubCredentialPresenceForUser({
          supabase,
          userId: ownerUserId
        }).catch(() => null);
        throw new HttpError(
          412,
          credentialPresence?.hasGitHubRow
            ? "GitHub App authorization is required for owner repository actions. Solidary OAuth fallback is disabled for owner repositories. Reconnect GitHub App from Profile and retry."
            : "GitHub authorization missing. Sign in with GitHub again from Profile settings and retry."
        );
      }
      userToken = resolvedGitHubAuth.token;

      const name = parsedName;
      const description = typeof payload.description === "string" ? payload.description : "";
      const isPrivate = payload.private === undefined ? false : Boolean(payload.private);
      const siteId = payload.siteId?.trim() ?? "";
      const siteTitle = payload.siteTitle?.trim() ?? "";
      const siteDescription = payload.siteDescription?.trim() ?? "";
      const siteImagePath = payload.siteImagePath?.trim() ?? "";
      const siteImageThumbPath = payload.siteImageThumbPath?.trim() ?? "";
      const ogImagePath = payload.ogImagePath?.trim() ?? "";
      const siteImageContentB64Raw = payload.siteImageContentB64?.trim() ?? "";
      const siteImageThumbContentB64Raw = payload.siteImageThumbContentB64?.trim() ?? "";
      const ogImageContentB64Raw = payload.ogImageContentB64?.trim() ?? "";
      const siteImageContentB64 =
        siteImageContentB64Raw ||
        (siteImageStoragePath
          ? await loadStagedSiteImageContentB64({
              supabase,
              storagePath: siteImageStoragePath
            })
          : "");
      const siteImageThumbContentB64 =
        siteImageThumbContentB64Raw ||
        (siteImageThumbStoragePath
          ? await loadStagedSiteImageContentB64({
              supabase,
              storagePath: siteImageThumbStoragePath
            })
          : "");
      const ogImageContentB64 =
        ogImageContentB64Raw ||
        (ogImageStoragePath
          ? await loadStagedSiteImageContentB64({
              supabase,
              storagePath: ogImageStoragePath
            })
          : "");

      await updateJob({
        step: "Loading template files..."
      });

      const templateFiles = await loadTemplateFiles();

      await updateJob({
        step: "Creating GitHub repository..."
      });

      const { res: newRepoRes, data: newRepoData } = await ghUser<GhRepoPayload>(
        userToken,
        `${GITHUB_API}/user/repos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            private: isPrivate === undefined ? false : Boolean(isPrivate),
            auto_init: true
          })
        }
      );
      assertOk(newRepoRes, newRepoData, "Failed to create repository.");

      const owner = newRepoData?.owner?.login;
      const repo = newRepoData?.name;
      if (!owner || !repo) {
        throw new HttpError(500, "Repository created but response missing owner/name.");
      }
      createdOwner = owner;
      createdRepo = repo;

      await updateJob({
        step: "Checking default branch..."
      });

      const repoAfterCreate = await getRepo({ userToken, owner, repo });
      const initialDefaultBranch =
        repoAfterCreate.default_branch || newRepoData.default_branch || TARGET_DEFAULT_BRANCH;
      const initialHeadSha = await getBranchHeadSha({
        userToken,
        owner,
        repo,
        branch: initialDefaultBranch
      });

      if (initialDefaultBranch !== TARGET_DEFAULT_BRANCH) {
        await updateJob({
          step: "Creating main branch..."
        });
        await createBranchIfMissing({
          userToken,
          owner,
          repo,
          branch: TARGET_DEFAULT_BRANCH,
          fromSha: initialHeadSha
        });
      }

      const templateFilesForCreateFlow = applyCreateFlowOverridesToTemplateFiles({
        files: templateFiles,
        owner,
        repo,
        siteId,
        siteTitle,
        siteDescription,
        siteImagePath,
        siteImageContentB64,
        siteImageThumbPath,
        siteImageThumbContentB64,
        ogImagePath,
        ogImageContentB64
      });

      await updateJob({
        step: "Creating template commit (0%)..."
      });
      await createTemplateSeedCommit({
        userToken,
        owner,
        repo,
        branch: TARGET_DEFAULT_BRANCH,
        files: templateFilesForCreateFlow,
        onProgress: async (completed, total) => {
          const percent = Math.max(1, Math.round((completed / Math.max(1, total)) * 100));
          await updateJob({
            step: `Creating template commit (${percent}%)...`
          });
        }
      });

      await updateJob({
        step: "Finalizing default branch..."
      });
      await setDefaultBranch({
        userToken,
        owner,
        repo,
        branch: TARGET_DEFAULT_BRANCH
      });

      const repoPayload = await getRepo({ userToken, owner, repo });
      await updateJob({
        status: "succeeded",
        step: "Repository provisioning completed.",
        error: null,
        repo_full_name: repoPayload.full_name ?? `${owner}/${repo}`,
        repo_payload: repoPayload,
        completed_at: new Date().toISOString()
      });

      await auditGitHubRepoAction({
        supabase,
        userId: ownerUserId,
        functionName: "github-create-repo-worker-background",
        action: "create_repo",
        owner,
        repo,
        decision: "allowed",
        tokenSource: resolvedGitHubAuth.source,
        httpStatus: 200
      });
    } catch (error) {
      if (createdOwner && createdRepo && userToken) {
        await updateJob({
          step: "Cleanup: deleting partial repository..."
        });
        await cleanupRepo({
          userToken,
          owner: createdOwner,
          repo: createdRepo
        });
      }

      if (error instanceof HttpError) {
        const message = error.message;
        console.log("[github-create-repo-worker] failed", {
          owner: createdOwner || null,
          repo: createdRepo || null,
          statusCode: error.statusCode,
          message
        });
        await updateJob({
          status: "failed",
          step: "Repository provisioning failed.",
          error: message,
          completed_at: new Date().toISOString()
        });
        if (createdOwner && createdRepo) {
          await auditGitHubRepoAction({
            supabase,
            userId: ownerUserId,
            functionName: "github-create-repo-worker-background",
            action: "create_repo",
            owner: createdOwner,
            repo: createdRepo,
            decision: "error",
            tokenSource: "none",
            httpStatus: error.statusCode,
            message
          });
        }
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      console.log("[github-create-repo-worker] failed", {
        owner: createdOwner || null,
        repo: createdRepo || null,
        message
      });
      await updateJob({
        status: "failed",
        step: "Repository provisioning failed.",
        error: message,
        completed_at: new Date().toISOString()
      });
      if (createdOwner && createdRepo) {
        await auditGitHubRepoAction({
          supabase,
          userId: ownerUserId,
          functionName: "github-create-repo-worker-background",
          action: "create_repo",
          owner: createdOwner,
          repo: createdRepo,
          decision: "error",
          tokenSource: "none",
          httpStatus: 500,
          message
        });
      }
    } finally {
      for (const storagePath of [siteImageStoragePath, siteImageThumbStoragePath, ogImageStoragePath]) {
        if (!storagePath) {
          continue;
        }
        await cleanupStagedSiteImage({
          supabase,
          storagePath
        });
      }
    }
  })());

  return safeJson(202, {
    status: "accepted",
    jobId
  });
};


Deno.serve((request) => runHandler(request, handler));
