import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { runHandler } from "../_shared/request-adapter.ts";
import {
  createChildProjectClient,
  type IndexArchiveRow,
  type IndexFinalizationJobRow,
  type IndexProjectCredentialsRow,
  type ParentSourceRepoResolution,
  resolveParentSourceRepo,
} from "../_shared/index-admin.ts";
import { refreshIndexFederationMirror } from "../_shared/index-federation.ts";
import {
  type IndexFinalizationPayloadState,
  type IndexFinalizationPreparedTreeEntry,
  type IndexFinalizationSourceManifestEntry,
  parseIndexFinalizationPayload,
} from "../_shared/index-finalization.ts";
import { resolveGitHubTokenForUser } from "../_shared/github-auth-broker.ts";
import {
  buildFinalizationStepLabel,
  findSourceTreeBlobEntryByPath,
} from "./helpers.ts";
import { getSolidaryAppUrl } from "../_shared/solidary-root-index.ts";
import { prepareSourceManifest } from "./prepare-manifest.ts";
import type { Handler } from "../_shared/types.ts";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";
const FINALIZE_WORKER_PATH = "/functions/v1/index-finalize-worker-background";
const FINALIZATION_BATCH_SIZE = 20;
const GITHUB_BLOB_CONCURRENCY = 5;
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
const GITHUB_WRITE_RETRY_DELAYS_MS = [0, 200, 500, 1000, 2000, 4000];
const BRANCH_READY_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000];
const EMPTY_GIT_BLOB_SHA = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
const LEGACY_STANDALONE_SITE_ROOT = "site";
const STANDALONE_PUBLIC_ROOT = "apps/site/public";
const STANDALONE_TEMPLATE_ROOT =
  "apps/site/src/templates/index/default_template/scaffold/site";
const STANDALONE_INDEX_IMAGE_ASSET_PATH = "/assets/index-image.jpg";
const STANDALONE_PUBLIC_CONFIG_PATH =
  `${STANDALONE_PUBLIC_ROOT}/config/index.json`;
const STANDALONE_PUBLIC_SOLIDARY_PATH =
  `${STANDALONE_PUBLIC_ROOT}/.well-known/solidary.json`;
const STANDALONE_PUBLIC_SOLIDARY_LINKS_PATH =
  `${STANDALONE_PUBLIC_ROOT}/.well-known/solidary-links.json`;
const STANDALONE_PUBLIC_INDEX_IMAGE_PATH =
  `${STANDALONE_PUBLIC_ROOT}${STANDALONE_INDEX_IMAGE_ASSET_PATH}`;
const LEGACY_STANDALONE_INDEX_IMAGE_PATH =
  `${LEGACY_STANDALONE_SITE_ROOT}${STANDALONE_INDEX_IMAGE_ASSET_PATH}`;
const STANDALONE_PUBLIC_TEMPLATE_MAPPINGS = [
  {
    sourcePath: `${STANDALONE_TEMPLATE_ROOT}/admin/index.html`,
    targetPath: `${STANDALONE_PUBLIC_ROOT}/admin/index.html`,
  },
  {
    sourcePath: `${STANDALONE_TEMPLATE_ROOT}/admin/app.js`,
    targetPath: `${STANDALONE_PUBLIC_ROOT}/admin/app.js`,
  },
  {
    sourcePath: `${STANDALONE_TEMPLATE_ROOT}/styles.css`,
    targetPath: `${STANDALONE_PUBLIC_ROOT}/styles.css`,
  },
  {
    sourcePath: `${STANDALONE_TEMPLATE_ROOT}/shared.js`,
    targetPath: `${STANDALONE_PUBLIC_ROOT}/shared.js`,
  },
] as const;

type GhErrorPayload = {
  message?: string;
  documentation_url?: string;
};

type GhRepoPayload = {
  default_branch?: string;
};

type GhBranchPayload = {
  commit?: { sha?: string };
};

type GhCommitPayload = {
  sha?: string;
  tree?: { sha?: string };
};

type GhTreeEntry = {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
};

type GhTreePayload = {
  sha?: string;
  tree?: GhTreeEntry[];
  truncated?: boolean;
};

type GhBlobPayload = {
  content?: string;
  encoding?: string;
  sha?: string;
};

type WorkerBody = {
  jobId?: string;
  archiveId?: string;
  ownerUserId?: string;
};

type ChildParentSourceArchiveRow = {
  id: string;
  parent_index_id: string | null;
  parent_index_url: string | null;
  parent_repo_full_name: string | null;
  parent_repo_url: string | null;
};

type FinalizationExecutionContext = {
  archive: IndexArchiveRow;
  credentials: IndexProjectCredentialsRow;
  parentSource: ParentSourceRepoResolution;
  sourceRepo: {
    owner: string;
    repo: string;
  };
  targetRepo: {
    owner: string;
    repo: string;
  };
  githubToken: string;
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
    console.error("[index-finalize-worker] background task failed", {
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

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const fileB64ToUtf8 = (value: string) =>
  Buffer.from(value, "base64").toString("utf8");

const createServiceSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Missing SUPABASE_URL or Supabase service key.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

const assertOk = (
  response: Response,
  payload: unknown,
  fallbackMessage: string,
) => {
  if (!response.ok) {
    throw new HttpError(
      response.status,
      getGhErrorMessage(payload, fallbackMessage),
    );
  }
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

async function ghUser<T>(
  userToken: string,
  url: string,
  init: RequestInit = {},
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(userToken),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T;
  return { response, payload };
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
      response: Response;
      payload: T;
    }
    | undefined;

  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    const delay = delaysMs[attempt];
    if (delay > 0) {
      await sleep(delay);
    }

    const current = await ghUser<T>(userToken, url, init);
    last = current;
    if (
      current.response.ok ||
      !shouldRetry(current.response.status, current.payload)
    ) {
      return current;
    }
  }

  return last as {
    response: Response;
    payload: T;
  };
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
  const { response, payload } = await ghUserWithRetry<
    GhRepoPayload | GhErrorPayload
  >({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(response, payload, "Failed reading repository.");
  return payload as GhRepoPayload;
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
  const { response, payload } = await ghUserWithRetry<
    GhBranchPayload | GhErrorPayload
  >({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/branches/${
      encodeURIComponent(branch)
    }`,
    delaysMs: BRANCH_READY_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(
    response,
    payload,
    `Failed to read ${branch} branch for ${owner}/${repo}.`,
  );
  const sha = typeof (payload as GhBranchPayload)?.commit?.sha === "string"
    ? (payload as GhBranchPayload).commit?.sha
    : "";
  if (!sha) {
    throw new HttpError(
      500,
      `Branch ${branch} for ${owner}/${repo} does not contain a head commit SHA.`,
    );
  }
  return sha;
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
  const { response, payload } = await ghUserWithRetry<
    GhCommitPayload | GhErrorPayload
  >({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${commitSha}`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(
    response,
    payload,
    `Failed reading commit ${commitSha} for ${owner}/${repo}.`,
  );

  const treeSha = typeof (payload as GhCommitPayload)?.tree?.sha === "string"
    ? (payload as GhCommitPayload).tree?.sha
    : "";
  if (!treeSha) {
    throw new HttpError(
      500,
      `Commit ${commitSha} for ${owner}/${repo} does not contain a tree SHA.`,
    );
  }
  return treeSha;
}

async function getRecursiveTree({
  userToken,
  owner,
  repo,
  treeSha,
}: {
  userToken: string;
  owner: string;
  repo: string;
  treeSha: string;
}) {
  const { response, payload } = await ghUserWithRetry<
    GhTreePayload | GhErrorPayload
  >({
    userToken,
    url:
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(
    response,
    payload,
    `Failed reading tree ${treeSha} for ${owner}/${repo}.`,
  );
  const treePayload = payload as GhTreePayload;
  if (treePayload.truncated === true) {
    throw new HttpError(
      412,
      `The parent repository tree for ${owner}/${repo} is too large for the GitHub recursive tree API. Reduce the source repo size or switch to a smaller parent source repo before finalising this index.`,
    );
  }
  return Array.isArray(treePayload.tree) ? treePayload.tree : [];
}

async function getBlobBase64({
  userToken,
  owner,
  repo,
  blobSha,
}: {
  userToken: string;
  owner: string;
  repo: string;
  blobSha: string;
}) {
  const { response, payload } = await ghUserWithRetry<
    GhBlobPayload | GhErrorPayload
  >({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/blobs/${blobSha}`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(
    response,
    payload,
    `Failed reading blob ${blobSha} from ${owner}/${repo}.`,
  );

  const blobPayload = payload as GhBlobPayload;
  const encoding = typeof blobPayload.encoding === "string"
    ? blobPayload.encoding
    : "";
  const rawContent = typeof blobPayload.content === "string"
    ? blobPayload.content
    : "";
  if (blobSha === EMPTY_GIT_BLOB_SHA) {
    return "";
  }
  if (encoding !== "base64" || !rawContent.trim()) {
    throw new HttpError(
      500,
      `Blob ${blobSha} from ${owner}/${repo} did not return base64 content.`,
    );
  }
  return rawContent.replace(/\n/g, "");
}

async function createBlob({
  userToken,
  owner,
  repo,
  contentB64,
}: {
  userToken: string;
  owner: string;
  repo: string;
  contentB64: string;
}) {
  const { response, payload } = await ghUserWithRetry<
    GhBlobPayload | GhErrorPayload
  >({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: contentB64,
        encoding: "base64",
      }),
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(response, payload, "Failed creating GitHub blob.");
  const sha = typeof (payload as GhBlobPayload).sha === "string"
    ? (payload as GhBlobPayload).sha
    : "";
  if (!sha) {
    throw new HttpError(500, "GitHub did not return a blob SHA.");
  }
  return sha;
}

async function createCommitFromTreeEntries({
  userToken,
  owner,
  repo,
  branch,
  treeEntries,
  message,
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
  treeEntries: IndexFinalizationPreparedTreeEntry[];
  message: string;
}) {
  const parentCommitSha = await getBranchHeadSha({
    userToken,
    owner,
    repo,
    branch,
  });

  const { response: treeResponse, payload: treePayload } =
    await ghUserWithRetry<
      GhTreePayload | GhErrorPayload
    >({
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tree: treeEntries.map((entry) => ({
            path: entry.path,
            mode: entry.mode,
            type: "blob",
            sha: entry.sha,
          })),
        }),
      },
      delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
    });
  assertOk(treeResponse, treePayload, "Failed creating repository tree.");
  const treeSha = typeof (treePayload as GhTreePayload).sha === "string"
    ? (treePayload as GhTreePayload).sha
    : "";
  if (!treeSha) {
    throw new HttpError(500, "GitHub did not return a tree SHA.");
  }

  const { response: commitResponse, payload: commitPayload } =
    await ghUserWithRetry<
      GhCommitPayload | GhErrorPayload
    >({
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          tree: treeSha,
          parents: [parentCommitSha],
        }),
      },
      delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
    });
  assertOk(commitResponse, commitPayload, "Failed creating repository commit.");

  const commitSha = typeof (commitPayload as GhCommitPayload).sha === "string"
    ? (commitPayload as GhCommitPayload).sha
    : "";
  if (!commitSha) {
    throw new HttpError(500, "GitHub did not return a commit SHA.");
  }

  const { response: refResponse, payload: refPayload } = await ghUserWithRetry<
    GhErrorPayload
  >({
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
  assertOk(refResponse, refPayload, `Failed updating ${branch} branch.`);
}

const createEnvFile = ({
  projectRef,
  projectUrl,
  publishableKey,
}: {
  projectRef: string;
  projectUrl: string;
  publishableKey: string;
}) =>
  [
    `SOLIDARY_PROJECT_ID=${projectRef}`,
    `SUPABASE_URL=${projectUrl}`,
    `SOLIDARY_PUBLISHABLE_KEY=${publishableKey}`,
    `VITE_SUPABASE_PROJECT_ID=${projectRef}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
    "",
  ].join("\n");

const applyVitePagesPatch = (source: string) => {
  if (source.includes('base: "./"')) {
    return source;
  }

  const replaced = source.replace(
    /export default defineConfig\(\{\s*/m,
    'export default defineConfig({\n  base: "./",\n  ',
  );
  return replaced === source ? source : replaced;
};

const applyRouterBasenamePatch = (source: string) => {
  if (source.includes("resolveRouterBasename")) {
    return source;
  }

  const helper = "const resolveRouterBasename = () => {\n" +
    '  if (typeof window === "undefined") return "";\n' +
    '  if (!/github\\.io$/i.test(window.location.hostname)) return "";\n' +
    '  const segments = window.location.pathname.split("/").filter(Boolean);\n' +
    '  return segments[0] ? `/${segments[0]}` : "";\n' +
    "};\n\n";

  let next = source.replace(
    "const StudioLockExitGuard = () => {",
    `${helper}const StudioLockExitGuard = () => {`,
  );
  next = next.replace(
    "<BrowserRouter>",
    "<BrowserRouter basename={resolveRouterBasename()}>",
  );
  return next;
};

const createDeployWorkflow = () =>
  `name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build site
        run: npm run build

      - name: Prepare GitHub Pages fallback
        run: |
          cp apps/site/dist/index.html apps/site/dist/404.html

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: ./apps/site/dist

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

const getProjectDashboardUrl = (projectRef: string) =>
  `https://supabase.com/dashboard/project/${projectRef}`;

const resolveSiteUrlForRepo = (owner: string, repo: string) => {
  const pagesRootUrl = `https://${owner}.github.io`;
  const isUserSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  return isUserSite ? pagesRootUrl : `${pagesRootUrl}/${repo}`;
};

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

const createStandaloneConfigFile = ({
  archiveId,
  title,
  description,
  slug,
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
  archiveId: string;
  title: string;
  description: string;
  slug: string;
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

const createStandaloneSolidaryFile = ({
  archiveId,
  title,
  description,
  siteUrl,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel,
  hasImage,
}: {
  archiveId: string;
  title: string;
  description: string;
  siteUrl: string;
  indexLevel: number;
  parentIndexId: string;
  parentIndexUrl: string;
  parentIndexLevel: number;
  hasImage: boolean;
}) =>
  `${
    JSON.stringify(
      {
        protocol_version: "1.0",
        type: "index",
        site_id: archiveId,
        site_url: siteUrl,
        title,
        site_image: hasImage
          ? resolveAbsoluteAssetUrl({
            siteUrl,
            assetPath: STANDALONE_INDEX_IMAGE_ASSET_PATH,
          })
          : "",
        site_image_thumb: "",
        description,
        index_level: indexLevel,
        parent_index_id: parentIndexId,
        parent_index_url: parentIndexUrl,
        parent_index_level: parentIndexLevel,
      },
      null,
      2,
    )
  }\n`;

const createStandaloneSolidaryLinksFile = ({
  archiveId,
  siteUrl,
}: {
  archiveId: string;
  siteUrl: string;
}) =>
  `${
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
        site_id: archiveId,
        connections: [],
      },
      null,
      2,
    )
  }\n`;

const stripStandaloneManagedSourceEntries = (
  sourceManifest: IndexFinalizationSourceManifestEntry[],
) =>
  sourceManifest.filter((entry) => {
    if (entry.kind !== "source") {
      return true;
    }

    const path = entry.path;
    return !(
      path.startsWith(`${LEGACY_STANDALONE_SITE_ROOT}/`) ||
      path.startsWith(`${STANDALONE_PUBLIC_ROOT}/admin/`) ||
      path.startsWith(`${STANDALONE_PUBLIC_ROOT}/config/`) ||
      path.startsWith(`${STANDALONE_PUBLIC_ROOT}/.well-known/`) ||
      path === `${STANDALONE_PUBLIC_ROOT}/shared.js` ||
      path === `${STANDALONE_PUBLIC_ROOT}/styles.css` ||
      path === STANDALONE_PUBLIC_INDEX_IMAGE_PATH
    );
  });

const createGeneratedContentEntry = ({
  path,
  content,
  mode = "100644",
}: {
  path: string;
  content: string;
  mode?: "100644" | "100755";
}): IndexFinalizationSourceManifestEntry => ({
  kind: "generated",
  path,
  mode,
  contentB64: Buffer.from(content, "utf8").toString("base64"),
});

const createGeneratedBase64Entry = ({
  path,
  contentB64,
  mode = "100644",
}: {
  path: string;
  contentB64: string;
  mode?: "100644" | "100755";
}): IndexFinalizationSourceManifestEntry => ({
  kind: "generated",
  path,
  mode,
  contentB64,
});

const resolveArchiveIndexLevel = (archive: IndexArchiveRow) => {
  const value = Number(archive.index_level);
  if (!Number.isFinite(value)) {
    throw new HttpError(412, "The child index is missing its index level.");
  }
  return Math.max(0, Math.trunc(value));
};

const resolveArchiveParentIndexLevel = (archive: IndexArchiveRow) => {
  const value = Number(archive.parent_index_level);
  if (!Number.isFinite(value)) {
    throw new HttpError(
      412,
      "The child index is missing its parent index level.",
    );
  }
  return Math.max(0, Math.trunc(value));
};

const resolveArchiveParentIndexId = (archive: IndexArchiveRow) => {
  const value = toTrimmedString(archive.parent_index_id);
  if (!value) {
    throw new HttpError(412, "The child index is missing its parent index id.");
  }
  return value;
};

const resolveArchiveParentIndexUrl = (archive: IndexArchiveRow) => {
  const value = toTrimmedString(archive.parent_index_url);
  if (!value) {
    throw new HttpError(
      412,
      "The child index is missing its parent index URL.",
    );
  }
  return value;
};

const buildStandalonePublicTemplateEntries = async ({
  sourceTree,
  loadSourceBlobBase64,
}: {
  sourceTree: GhTreeEntry[];
  loadSourceBlobBase64: (blobSha: string) => Promise<string>;
}) =>
  Promise.all(
    STANDALONE_PUBLIC_TEMPLATE_MAPPINGS.map(
      async ({ sourcePath, targetPath }) => {
        const sourceEntry = findSourceTreeBlobEntryByPath({
          treeEntries: sourceTree,
          path: sourcePath,
        });
        const sourceSha = toTrimmedString(sourceEntry?.sha);
        if (!sourceSha) {
          throw new HttpError(
            412,
            `Finalization source repo is missing required template file ${sourcePath}.`,
          );
        }

        return createGeneratedBase64Entry({
          path: targetPath,
          contentB64: await loadSourceBlobBase64(sourceSha),
        });
      },
    ),
  );

const readCurrentIndexImageContentB64 = async ({
  targetTree,
  loadTargetBlobBase64,
}: {
  targetTree: GhTreeEntry[];
  loadTargetBlobBase64: (blobSha: string) => Promise<string>;
}) => {
  const currentImageEntry = findSourceTreeBlobEntryByPath({
    treeEntries: targetTree,
    path: STANDALONE_PUBLIC_INDEX_IMAGE_PATH,
  }) ?? findSourceTreeBlobEntryByPath({
    treeEntries: targetTree,
    path: LEGACY_STANDALONE_INDEX_IMAGE_PATH,
  });
  const currentImageSha = toTrimmedString(currentImageEntry?.sha);
  return currentImageSha ? loadTargetBlobBase64(currentImageSha) : null;
};

const splitRepoFullName = (repoFullName: string) => {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo_full_name: ${repoFullName}`);
  }
  return { owner, repo };
};

const createStandalonePublicGeneratedEntries = ({
  archive,
  credentials,
  siteUrl,
  indexImageContentB64,
}: {
  archive: IndexArchiveRow;
  credentials: IndexProjectCredentialsRow;
  siteUrl: string;
  indexImageContentB64: string | null;
}): IndexFinalizationSourceManifestEntry[] => {
  const repoFullName = toTrimmedString(credentials.repo_full_name);
  const repoUrl = toTrimmedString(credentials.repo_url);
  const slug = toTrimmedString(archive.slug);
  const title = toTrimmedString(archive.title);
  const description = toTrimmedString(archive.description);
  const projectRef = toTrimmedString(credentials.supabase_project_ref);
  const projectUrl = toTrimmedString(credentials.supabase_project_url);
  const publishableKey = toTrimmedString(credentials.supabase_publishable_key);
  const parentIndexId = resolveArchiveParentIndexId(archive);
  const parentIndexUrl = resolveArchiveParentIndexUrl(archive);
  const parentIndexLevel = resolveArchiveParentIndexLevel(archive);
  const indexLevel = resolveArchiveIndexLevel(archive);

  if (
    !repoFullName || !repoUrl || !slug || !title || !projectRef ||
    !projectUrl || !publishableKey
  ) {
    throw new HttpError(
      412,
      "The child index is missing repository or Supabase metadata needed for finalization.",
    );
  }

  const projectDashboardUrl = getProjectDashboardUrl(projectRef);

  const generatedEntries = [
    createGeneratedContentEntry({
      path: STANDALONE_PUBLIC_CONFIG_PATH,
      content: createStandaloneConfigFile({
        archiveId: archive.id,
        title,
        description,
        slug,
        repoFullName,
        repoUrl,
        projectRef,
        projectUrl,
        projectDashboardUrl,
        publishableKey,
        siteUrl,
        solidaryAppUrl: getSolidaryAppUrl(),
        solidarySupabaseUrl: SUPABASE_URL,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
      }),
    }),
    createGeneratedContentEntry({
      path: STANDALONE_PUBLIC_SOLIDARY_PATH,
      content: createStandaloneSolidaryFile({
        archiveId: archive.id,
        title,
        description,
        siteUrl,
        indexLevel,
        parentIndexId,
        parentIndexUrl,
        parentIndexLevel,
        hasImage: Boolean(indexImageContentB64),
      }),
    }),
    createGeneratedContentEntry({
      path: STANDALONE_PUBLIC_SOLIDARY_LINKS_PATH,
      content: createStandaloneSolidaryLinksFile({
        archiveId: archive.id,
        siteUrl,
      }),
    }),
  ];

  if (indexImageContentB64) {
    generatedEntries.push(
      createGeneratedBase64Entry({
        path: STANDALONE_PUBLIC_INDEX_IMAGE_PATH,
        contentB64: indexImageContentB64,
      }),
    );
  }

  return generatedEntries;
};

const createGeneratedManifestEntries = ({
  projectRef,
  projectUrl,
  publishableKey,
}: {
  projectRef: string;
  projectUrl: string;
  publishableKey: string;
}): IndexFinalizationSourceManifestEntry[] => [
  {
    kind: "generated",
    path: ".env.production",
    mode: "100644",
    contentB64: Buffer.from(
      createEnvFile({
        projectRef,
        projectUrl,
        publishableKey,
      }),
      "utf8",
    ).toString("base64"),
  },
  {
    kind: "generated",
    path: ".github/workflows/deploy.yml",
    mode: "100644",
    contentB64: Buffer.from(createDeployWorkflow(), "utf8").toString("base64"),
  },
];

const patchSourceContentB64 = ({
  path,
  contentB64,
}: {
  path: string;
  contentB64: string;
}) => {
  if (path === "apps/site/vite.config.ts") {
    return Buffer.from(
      applyVitePagesPatch(fileB64ToUtf8(contentB64)),
      "utf8",
    ).toString("base64");
  }

  if (path === "apps/site/src/App/App.tsx") {
    return Buffer.from(
      applyRouterBasenamePatch(fileB64ToUtf8(contentB64)),
      "utf8",
    ).toString("base64");
  }

  return contentB64;
};

const readArchiveAndCredentials = async ({
  supabase,
  archiveId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  archiveId: string;
}) => {
  const [
    { data: archiveData, error: archiveError },
    { data: credentialsData, error: credentialsError },
  ] = await Promise.all([
    supabase
      .from("archives")
      .select(
        [
          "id",
          "owner_user_id",
          "type",
          "is_root",
          "runtime_mode",
          "slug",
          "title",
          "description",
          "image_url",
          "canonical_url",
          "repo_full_name",
          "repo_url",
          "supabase_project_id",
          "supabase_project_ref",
          "supabase_project_name",
          "supabase_dashboard_url",
          "index_level",
          "parent_index_id",
          "parent_index_url",
          "parent_index_level",
          "parent_repo_full_name",
          "parent_repo_url",
          "finalized_at",
        ].join(", "),
      )
      .eq("id", archiveId)
      .eq("type", "index")
      .maybeSingle(),
    supabase
      .from("index_project_credentials")
      .select(
        [
          "archive_id",
          "owner_user_id",
          "supabase_project_ref",
          "supabase_project_url",
          "supabase_publishable_key",
          "supabase_secret_key_encrypted",
          "repo_owner",
          "repo_name",
          "repo_full_name",
          "repo_url",
        ].join(", "),
      )
      .eq("archive_id", archiveId)
      .maybeSingle(),
  ]);

  if (archiveError) {
    throw new Error(archiveError.message);
  }
  if (credentialsError) {
    throw new Error(credentialsError.message);
  }
  if (!archiveData) {
    throw new Error("Index archive not found.");
  }
  if (!credentialsData) {
    throw new Error("Index project credentials are missing.");
  }

  return {
    archive: archiveData as unknown as IndexArchiveRow,
    credentials: credentialsData as unknown as IndexProjectCredentialsRow,
  };
};

const readChildParentSourceArchive = async ({
  archiveId,
  credentials,
}: {
  archiveId: string;
  credentials: IndexProjectCredentialsRow;
}) => {
  const child = createChildProjectClient(credentials);
  const { data, error } = await child
    .from("archives")
    .select(
      [
        "id",
        "parent_index_id",
        "parent_index_url",
        "parent_repo_full_name",
        "parent_repo_url",
      ].join(", "),
    )
    .eq("id", archiveId)
    .eq("is_root", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("The child index is missing its archive metadata row.");
  }

  return data as unknown as ChildParentSourceArchiveRow;
};

const reconcileParentSourceRepoLineage = async ({
  supabase,
  archiveId,
  archive,
  credentials,
  childArchive,
  parentSource,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  archiveId: string;
  archive: IndexArchiveRow;
  credentials: IndexProjectCredentialsRow;
  childArchive: ChildParentSourceArchiveRow;
  parentSource: ParentSourceRepoResolution;
}) => {
  if (!parentSource.repoFullName || !parentSource.repoUrl) {
    return archive;
  }

  const nextValues = {
    parent_repo_full_name: parentSource.repoFullName,
    parent_repo_url: parentSource.repoUrl,
  };

  if (
    toTrimmedString(archive.parent_repo_full_name) !==
      nextValues.parent_repo_full_name ||
    toTrimmedString(archive.parent_repo_url) !== nextValues.parent_repo_url
  ) {
    const { error } = await supabase
      .from("archives")
      .update(nextValues)
      .eq("id", archiveId);
    if (error) {
      throw new Error(error.message);
    }
  }

  if (
    toTrimmedString(childArchive.parent_repo_full_name) !==
      nextValues.parent_repo_full_name ||
    toTrimmedString(childArchive.parent_repo_url) !== nextValues.parent_repo_url
  ) {
    const child = createChildProjectClient(credentials);
    const { error } = await child
      .from("archives")
      .update(nextValues)
      .eq("id", archiveId)
      .eq("is_root", true);
    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    ...archive,
    ...nextValues,
  } satisfies IndexArchiveRow;
};

const updateArchiveModes = async ({
  archiveId,
  supabase,
  credentials,
}: {
  archiveId: string;
  supabase: ReturnType<typeof createServiceSupabase>;
  credentials: IndexProjectCredentialsRow;
}) => {
  const finalizedAt = new Date().toISOString();
  const { error: parentError } = await supabase
    .from("archives")
    .update({
      runtime_mode: "finalized",
      finalized_at: finalizedAt,
    })
    .eq("id", archiveId);
  if (parentError) {
    throw new Error(parentError.message);
  }

  const child = createChildProjectClient(credentials);
  const { error: childError } = await child
    .from("archives")
    .update({
      runtime_mode: "finalized",
      finalized_at: finalizedAt,
    })
    .eq("id", archiveId)
    .eq("is_root", true);
  if (childError) {
    throw new Error(childError.message);
  }
};

const encodePayloadState = (payloadState: IndexFinalizationPayloadState) => ({
  phase: payloadState.phase ?? undefined,
  source_branch: payloadState.sourceBranch ?? undefined,
  source_manifest: payloadState.sourceManifest,
  cursor: payloadState.cursor,
  final_tree_entries: payloadState.finalTreeEntries,
  total_files: payloadState.totalFiles,
  processed_files: payloadState.processedFiles,
  source_repo_resolution: payloadState.sourceRepoResolution ?? undefined,
  target_repo_full_name: payloadState.targetRepoFullName ?? undefined,
  child_project_ref: payloadState.childProjectRef ?? undefined,
});

const defaultPayloadState = (): IndexFinalizationPayloadState => ({
  phase: null,
  sourceBranch: null,
  sourceManifest: [],
  cursor: 0,
  finalTreeEntries: [],
  totalFiles: 0,
  processedFiles: 0,
  sourceRepoResolution: null,
  targetRepoFullName: null,
  childProjectRef: null,
});

const readJob = async ({
  supabase,
  jobId,
  archiveId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  jobId: string;
  archiveId: string;
}) => {
  const { data, error } = await supabase
    .from("index_finalization_jobs")
    .select(
      [
        "id",
        "archive_id",
        "owner_user_id",
        "status",
        "step",
        "error",
        "source_repo_full_name",
        "source_repo_url",
        "source_branch",
        "target_repo_full_name",
        "child_project_ref",
        "payload",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
      ].join(", "),
    )
    .eq("id", jobId)
    .eq("archive_id", archiveId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Index finalization job not found.");
  }

  return data as unknown as IndexFinalizationJobRow;
};

const updateJob = async ({
  supabase,
  jobId,
  archiveId,
  values,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  jobId: string;
  archiveId: string;
  values: Record<string, unknown>;
}) => {
  const { error } = await supabase
    .from("index_finalization_jobs")
    .update(values)
    .eq("id", jobId)
    .eq("archive_id", archiveId);

  if (error) {
    throw new Error(error.message);
  }
};

const failJob = async ({
  supabase,
  jobId,
  archiveId,
  payloadState,
  phase,
  error,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  jobId: string;
  archiveId: string;
  payloadState: IndexFinalizationPayloadState;
  phase: IndexFinalizationPayloadState["phase"];
  error: string;
}) => {
  const nextPayload = {
    ...payloadState,
    phase,
  };

  await updateJob({
    supabase,
    jobId,
    archiveId,
    values: {
      status: "failed",
      step: "Index finalization failed.",
      error,
      payload: encodePayloadState(nextPayload),
      completed_at: new Date().toISOString(),
    },
  });
};

const dispatchWorker = async ({
  jobId,
  archiveId,
  ownerUserId,
}: {
  jobId: string;
  archiveId: string;
  ownerUserId: string;
}) => {
  const response = await fetch(
    new URL(FINALIZE_WORKER_PATH, SUPABASE_URL).toString(),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-provision-internal-key": SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        jobId,
        archiveId,
        ownerUserId,
      }),
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Could not dispatch the next finalization worker phase.",
    );
  }
};

const scheduleWorkerDispatch = ({
  supabase,
  jobId,
  archiveId,
  ownerUserId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  jobId: string;
  archiveId: string;
  ownerUserId: string;
}) => {
  waitUntil((async () => {
    let payloadState = defaultPayloadState();

    try {
      const currentJob = await readJob({
        supabase,
        jobId,
        archiveId,
      }).catch(() => null);
      if (currentJob?.payload) {
        payloadState = parseIndexFinalizationPayload(currentJob.payload);
      }
      if (
        currentJob?.status === "failed" || currentJob?.status === "succeeded"
      ) {
        return;
      }

      await dispatchWorker({
        jobId,
        archiveId,
        ownerUserId,
      });
    } catch (error) {
      try {
        const latestJob = await readJob({
          supabase,
          jobId,
          archiveId,
        }).catch(() => null);
        if (latestJob?.payload) {
          payloadState = parseIndexFinalizationPayload(latestJob.payload);
        }
        if (
          latestJob?.status === "failed" || latestJob?.status === "succeeded"
        ) {
          return;
        }

        await failJob({
          supabase,
          jobId,
          archiveId,
          payloadState,
          phase: payloadState.phase,
          error: error instanceof Error
            ? error.message
            : "Could not dispatch the next finalization worker phase.",
        });
      } catch (persistError) {
        console.error(
          "[index-finalize-worker] could not persist dispatch failure",
          {
            archiveId,
            jobId,
            message: persistError instanceof Error
              ? persistError.message
              : String(persistError),
          },
        );
      }
    }
  })());
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
) => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await task(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
};

const materializeManifestEntry = async ({
  entry,
  githubToken,
  sourceRepo,
  targetRepo,
}: {
  entry: IndexFinalizationSourceManifestEntry;
  githubToken: string;
  sourceRepo: {
    owner: string;
    repo: string;
  };
  targetRepo: {
    owner: string;
    repo: string;
  };
}) => {
  const rawContentB64 = entry.kind === "generated"
    ? entry.contentB64
    : await getBlobBase64({
      userToken: githubToken,
      owner: sourceRepo.owner,
      repo: sourceRepo.repo,
      blobSha: entry.sourceSha,
    });

  const contentB64 = entry.kind === "generated"
    ? rawContentB64
    : patchSourceContentB64({
      path: entry.path,
      contentB64: rawContentB64,
    });

  const sha = await createBlob({
    userToken: githubToken,
    owner: targetRepo.owner,
    repo: targetRepo.repo,
    contentB64,
  });

  return {
    path: entry.path,
    mode: entry.mode,
    sha,
  } satisfies IndexFinalizationPreparedTreeEntry;
};

const loadFinalizationContext = async ({
  supabase,
  archiveId,
  ownerUserId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  archiveId: string;
  ownerUserId: string;
}): Promise<FinalizationExecutionContext> => {
  const { archive, credentials } = await readArchiveAndCredentials({
    supabase,
    archiveId,
  });
  if (archive.owner_user_id !== ownerUserId) {
    throw new HttpError(
      403,
      "Only the index owner can finalise this child repo.",
    );
  }

  const childArchive = await readChildParentSourceArchive({
    archiveId,
    credentials,
  });
  const parentSource = resolveParentSourceRepo({
    archive,
    childArchive: {
      parent_index_id: childArchive.parent_index_id,
      parent_index_url: childArchive.parent_index_url,
      parent_repo_full_name: childArchive.parent_repo_full_name,
      parent_repo_url: childArchive.parent_repo_url,
    },
  });
  if (!parentSource.repoFullName || !parentSource.repoUrl) {
    throw new HttpError(
      412,
      parentSource.message ??
        "The parent source repository is not configured for this index.",
    );
  }

  const resolvedGitHubAuth = await resolveGitHubTokenForUser({
    supabase,
    userId: ownerUserId,
  });
  const githubToken = toTrimmedString(resolvedGitHubAuth?.token);
  if (!githubToken) {
    throw new HttpError(
      412,
      "Reconnect GitHub from Profile before finalising the index.",
    );
  }

  await reconcileParentSourceRepoLineage({
    supabase,
    archiveId,
    archive,
    credentials,
    childArchive,
    parentSource,
  });

  return {
    archive,
    credentials,
    parentSource,
    sourceRepo: splitRepoFullName(parentSource.repoFullName),
    targetRepo: {
      owner: credentials.repo_owner,
      repo: credentials.repo_name,
    },
    githubToken,
  };
};

const runPrepareManifestPhase = async ({
  supabase,
  jobId,
  archiveId,
  ownerUserId,
  payloadState,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  jobId: string;
  archiveId: string;
  ownerUserId: string;
  payloadState: IndexFinalizationPayloadState;
}) => {
  const context = await loadFinalizationContext({
    supabase,
    archiveId,
    ownerUserId,
  });

  const sourceRepoPayload = await getRepo({
    userToken: context.githubToken,
    owner: context.sourceRepo.owner,
    repo: context.sourceRepo.repo,
  });
  const sourceBranch = toTrimmedString(sourceRepoPayload.default_branch) ||
    "main";
  const sourceHeadSha = await getBranchHeadSha({
    userToken: context.githubToken,
    owner: context.sourceRepo.owner,
    repo: context.sourceRepo.repo,
    branch: sourceBranch,
  });
  const sourceTreeSha = await getCommitTreeSha({
    userToken: context.githubToken,
    owner: context.sourceRepo.owner,
    repo: context.sourceRepo.repo,
    commitSha: sourceHeadSha,
  });
  const sourceTree = await getRecursiveTree({
    userToken: context.githubToken,
    owner: context.sourceRepo.owner,
    repo: context.sourceRepo.repo,
    treeSha: sourceTreeSha,
  });
  const targetRepoPayload = await getRepo({
    userToken: context.githubToken,
    owner: context.targetRepo.owner,
    repo: context.targetRepo.repo,
  });
  const targetBranch = toTrimmedString(targetRepoPayload.default_branch) ||
    "main";
  const targetHeadSha = await getBranchHeadSha({
    userToken: context.githubToken,
    owner: context.targetRepo.owner,
    repo: context.targetRepo.repo,
    branch: targetBranch,
  });
  const targetTreeSha = await getCommitTreeSha({
    userToken: context.githubToken,
    owner: context.targetRepo.owner,
    repo: context.targetRepo.repo,
    commitSha: targetHeadSha,
  });
  const targetTree = await getRecursiveTree({
    userToken: context.githubToken,
    owner: context.targetRepo.owner,
    repo: context.targetRepo.repo,
    treeSha: targetTreeSha,
  });

  const publishableKey = toTrimmedString(
    context.credentials.supabase_publishable_key,
  );
  if (!publishableKey) {
    throw new HttpError(
      500,
      "The child project publishable key is missing from index_project_credentials.",
    );
  }

  const templateEntries = await buildStandalonePublicTemplateEntries({
    sourceTree,
    loadSourceBlobBase64: (blobSha) =>
      getBlobBase64({
        userToken: context.githubToken,
        owner: context.sourceRepo.owner,
        repo: context.sourceRepo.repo,
        blobSha,
      }),
  });
  const currentIndexImageContentB64 = await readCurrentIndexImageContentB64({
    targetTree,
    loadTargetBlobBase64: (blobSha) =>
      getBlobBase64({
        userToken: context.githubToken,
        owner: context.targetRepo.owner,
        repo: context.targetRepo.repo,
        blobSha,
      }),
  });
  const siteUrl = toTrimmedString(context.archive.canonical_url) ||
    resolveSiteUrlForRepo(context.targetRepo.owner, context.targetRepo.repo);
  const generatedEntries = [
    ...createGeneratedManifestEntries({
      projectRef: context.credentials.supabase_project_ref,
      projectUrl: context.credentials.supabase_project_url,
      publishableKey,
    }),
    ...templateEntries,
    ...createStandalonePublicGeneratedEntries({
      archive: context.archive,
      credentials: context.credentials,
      siteUrl,
      indexImageContentB64: currentIndexImageContentB64,
    }),
  ];

  const sourceManifest = stripStandaloneManagedSourceEntries(
    await prepareSourceManifest({
      treeEntries: sourceTree,
      generatedEntries,
      loadBlobBase64: (blobSha) =>
        getBlobBase64({
          userToken: context.githubToken,
          owner: context.sourceRepo.owner,
          repo: context.sourceRepo.repo,
          blobSha,
        }),
    }),
  );

  const nextPayload: IndexFinalizationPayloadState = {
    ...payloadState,
    phase: "materialize_blobs",
    sourceBranch,
    sourceManifest,
    cursor: 0,
    finalTreeEntries: [],
    totalFiles: sourceManifest.length,
    processedFiles: 0,
    sourceRepoResolution: context.parentSource.sourceKind,
    targetRepoFullName: context.credentials.repo_full_name,
    childProjectRef: context.credentials.supabase_project_ref,
  };

  await updateJob({
    supabase,
    jobId,
    archiveId,
    values: {
      status: "running",
      step: buildFinalizationStepLabel({
        phase: "materialize_blobs",
        processedFiles: 0,
        totalFiles: nextPayload.totalFiles,
      }),
      error: null,
      source_repo_full_name: context.parentSource.repoFullName,
      source_repo_url: context.parentSource.repoUrl,
      source_branch: sourceBranch,
      target_repo_full_name: context.credentials.repo_full_name,
      child_project_ref: context.credentials.supabase_project_ref,
      payload: encodePayloadState(nextPayload),
    },
  });

  scheduleWorkerDispatch({
    supabase,
    jobId,
    archiveId,
    ownerUserId,
  });
};

const runMaterializeBlobsPhase = async ({
  supabase,
  jobId,
  archiveId,
  ownerUserId,
  payloadState,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  jobId: string;
  archiveId: string;
  ownerUserId: string;
  payloadState: IndexFinalizationPayloadState;
}) => {
  if (!payloadState.sourceManifest.length || !payloadState.totalFiles) {
    throw new HttpError(
      412,
      "The finalization manifest is missing. Retry child setup to rebuild it.",
    );
  }

  const context = await loadFinalizationContext({
    supabase,
    archiveId,
    ownerUserId,
  });

  const currentCursor = Math.min(
    payloadState.cursor,
    payloadState.sourceManifest.length,
  );
  const batch = payloadState.sourceManifest.slice(
    currentCursor,
    currentCursor + FINALIZATION_BATCH_SIZE,
  );

  if (!batch.length) {
    const nextPayload: IndexFinalizationPayloadState = {
      ...payloadState,
      phase: "commit_finalize",
      cursor: payloadState.totalFiles,
      processedFiles: payloadState.totalFiles,
    };
    await updateJob({
      supabase,
      jobId,
      archiveId,
      values: {
        status: "running",
        step: buildFinalizationStepLabel({
          phase: "commit_finalize",
          processedFiles: nextPayload.processedFiles,
          totalFiles: nextPayload.totalFiles,
        }),
        payload: encodePayloadState(nextPayload),
      },
    });
    scheduleWorkerDispatch({
      supabase,
      jobId,
      archiveId,
      ownerUserId,
    });
    return;
  }

  const batchTreeEntries = await mapWithConcurrency(
    batch,
    GITHUB_BLOB_CONCURRENCY,
    (entry) =>
      materializeManifestEntry({
        entry,
        githubToken: context.githubToken,
        sourceRepo: context.sourceRepo,
        targetRepo: context.targetRepo,
      }),
  );

  const processedFiles = Math.min(
    currentCursor + batch.length,
    payloadState.totalFiles,
  );
  const nextPayload: IndexFinalizationPayloadState = {
    ...payloadState,
    phase: processedFiles >= payloadState.totalFiles
      ? "commit_finalize"
      : "materialize_blobs",
    cursor: processedFiles,
    finalTreeEntries: [...payloadState.finalTreeEntries, ...batchTreeEntries],
    processedFiles,
  };

  await updateJob({
    supabase,
    jobId,
    archiveId,
    values: {
      status: "running",
      step: buildFinalizationStepLabel({
        phase: nextPayload.phase === "commit_finalize"
          ? "commit_finalize"
          : "materialize_blobs",
        processedFiles: nextPayload.processedFiles,
        totalFiles: nextPayload.totalFiles,
      }),
      payload: encodePayloadState(nextPayload),
    },
  });

  scheduleWorkerDispatch({
    supabase,
    jobId,
    archiveId,
    ownerUserId,
  });
};

const runCommitFinalizePhase = async ({
  supabase,
  jobId,
  archiveId,
  payloadState,
  ownerUserId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  jobId: string;
  archiveId: string;
  payloadState: IndexFinalizationPayloadState;
  ownerUserId: string;
}) => {
  if (
    !payloadState.finalTreeEntries.length ||
    payloadState.finalTreeEntries.length !== payloadState.totalFiles
  ) {
    throw new HttpError(
      412,
      "The finalization tree is incomplete. Retry child setup to rebuild the child repository commit.",
    );
  }

  const context = await loadFinalizationContext({
    supabase,
    archiveId,
    ownerUserId,
  });

  const targetRepoPayload = await getRepo({
    userToken: context.githubToken,
    owner: context.targetRepo.owner,
    repo: context.targetRepo.repo,
  });
  const targetBranch = toTrimmedString(targetRepoPayload.default_branch) ||
    "main";

  await updateJob({
    supabase,
    jobId,
    archiveId,
    values: {
      status: "running",
      step: "Creating final repository commit...",
      payload: encodePayloadState({
        ...payloadState,
        phase: "commit_finalize",
      }),
    },
  });

  await createCommitFromTreeEntries({
    userToken: context.githubToken,
    owner: context.targetRepo.owner,
    repo: context.targetRepo.repo,
    branch: targetBranch,
    treeEntries: payloadState.finalTreeEntries,
    message: `Finalize index from ${context.parentSource.repoFullName}`,
  });

  await updateJob({
    supabase,
    jobId,
    archiveId,
    values: {
      status: "running",
      step: "Marking index as finalized...",
    },
  });

  await updateArchiveModes({
    archiveId,
    supabase,
    credentials: context.credentials,
  });

  try {
    await refreshIndexFederationMirror({
      supabase,
      sourceProjectUrl: context.credentials.supabase_project_url,
      sourcePublishableKey: context.credentials.supabase_publishable_key ?? "",
      expectedArchiveId: archiveId,
    });
  } catch (error) {
    console.warn(
      "[index-finalize-worker] failed to refresh local federation mirror",
      {
        archiveId,
        message: error instanceof Error ? error.message : String(error),
      },
    );
  }

  await updateJob({
    supabase,
    jobId,
    archiveId,
    values: {
      status: "succeeded",
      step: "Index finalization completed. Continue to deploy child functions.",
      error: null,
      payload: encodePayloadState({
        ...payloadState,
        phase: "commit_finalize",
        cursor: payloadState.totalFiles,
        processedFiles: payloadState.totalFiles,
      }),
      completed_at: new Date().toISOString(),
    },
  });
};

const executeFinalizationPhase = async ({
  supabase,
  jobId,
  archiveId,
  ownerUserId,
}: {
  supabase: ReturnType<typeof createServiceSupabase>;
  jobId: string;
  archiveId: string;
  ownerUserId: string;
}) => {
  const currentJob = await readJob({
    supabase,
    jobId,
    archiveId,
  });
  if (currentJob.status === "failed" || currentJob.status === "succeeded") {
    return;
  }

  const initialPayload = currentJob.payload
    ? parseIndexFinalizationPayload(currentJob.payload)
    : defaultPayloadState();
  const payloadState: IndexFinalizationPayloadState = {
    ...initialPayload,
    phase: initialPayload.phase ?? "prepare_manifest",
  };
  const currentPhase = payloadState.phase ?? "prepare_manifest";

  await updateJob({
    supabase,
    jobId,
    archiveId,
    values: {
      status: "running",
      error: null,
      started_at: currentJob.started_at ?? new Date().toISOString(),
      completed_at: null,
      step: buildFinalizationStepLabel({
        phase: currentPhase,
        processedFiles: payloadState.processedFiles,
        totalFiles: payloadState.totalFiles,
      }),
      payload: encodePayloadState(payloadState),
    },
  });

  if (currentPhase === "prepare_manifest") {
    await runPrepareManifestPhase({
      supabase,
      jobId,
      archiveId,
      ownerUserId,
      payloadState,
    });
    return;
  }

  if (currentPhase === "materialize_blobs") {
    await runMaterializeBlobsPhase({
      supabase,
      jobId,
      archiveId,
      ownerUserId,
      payloadState,
    });
    return;
  }

  await runCommitFinalizePhase({
    supabase,
    jobId,
    archiveId,
    ownerUserId,
    payloadState,
  });
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

  const internalKey = event.headers["x-provision-internal-key"] ??
    event.headers["X-Provision-Internal-Key"];
  if (!internalKey || internalKey !== SUPABASE_SERVICE_KEY) {
    return safeJson(401, { error: "Unauthorized background worker dispatch." });
  }

  const body = parseBody(event.body);
  const jobId = toTrimmedString(body.jobId);
  const archiveId = toTrimmedString(body.archiveId);
  const ownerUserId = toTrimmedString(body.ownerUserId);
  if (!jobId || !archiveId || !ownerUserId) {
    return safeJson(400, {
      error: "Missing jobId, archiveId, or ownerUserId.",
    });
  }

  const supabase = createServiceSupabase();
  let payloadState = defaultPayloadState();

  try {
    const currentJob = await readJob({
      supabase,
      jobId,
      archiveId,
    });
    payloadState = currentJob.payload
      ? parseIndexFinalizationPayload(currentJob.payload)
      : defaultPayloadState();

    await executeFinalizationPhase({
      supabase,
      jobId,
      archiveId,
      ownerUserId,
    });

    return safeJson(200, {
      ok: true,
      job_id: jobId,
    });
  } catch (error) {
    try {
      const latestJob = await readJob({
        supabase,
        jobId,
        archiveId,
      }).catch(() => null);
      if (latestJob?.payload) {
        payloadState = parseIndexFinalizationPayload(latestJob.payload);
      }

      await failJob({
        supabase,
        jobId,
        archiveId,
        payloadState,
        phase: payloadState.phase,
        error: error instanceof Error ? error.message : "Finalization failed.",
      });
    } catch (persistError) {
      console.error("[index-finalize-worker] could not persist failure", {
        archiveId,
        jobId,
        message: persistError instanceof Error
          ? persistError.message
          : String(persistError),
      });
    }

    return safeJson(error instanceof HttpError ? error.statusCode : 500, {
      error: error instanceof Error ? error.message : "Finalization failed.",
      job_id: jobId,
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
