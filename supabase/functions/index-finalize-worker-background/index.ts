import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { runHandler } from "../_shared/request-adapter.ts";
import {
  createChildProjectClient,
  type IndexArchiveRow,
  type IndexProjectCredentialsRow,
  type ParentSourceRepoResolution,
  resolveParentSourceRepo,
} from "../_shared/index-admin.ts";
import {
  resolveSupabaseManagementAccessForUser,
  SupabaseManagementReauthError,
  updateSupabaseProjectAuthConfig,
} from "../_shared/supabase-management-auth/index.ts";
import { decryptTokenValue } from "../_shared/token-crypto.ts";
import { resolveGitHubTokenForUser } from "../_shared/github-auth-broker.ts";
import type { Handler } from "../_shared/types.ts";

const GITHUB_API = "https://api.github.com";
const SUPABASE_MANAGEMENT_API = "https://api.supabase.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") ?? "";
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
const GITHUB_BLOB_WRITE_CONCURRENCY = 8;
const GITHUB_BLOB_PROGRESS_INTERVAL = 24;
const EMPTY_GIT_BLOB_SHA = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
const REQUIRED_FINALIZATION_SUPABASE_SCOPES = [
  "secrets:write",
  "auth:write",
] as const;
const SOURCE_TREE_EXCLUSIONS = [
  ".env",
  ".env.example",
  ".env.local",
  ".env.production",
  "apps/site/dist/",
  "site/.well-known/",
  "site/config/index.json",
  "site/assets/index-image.jpg",
  "supabase/migrations/",
  "supabase/.temp/",
  ".DS_Store",
] as const;

type GhErrorPayload = { message?: string; documentation_url?: string };
type GhRepoPayload = {
  default_branch?: string;
  full_name?: string;
  html_url?: string;
  name?: string;
  owner?: { login?: string };
};
type GhBranchPayload = { commit?: { sha?: string } };
type GhCommitPayload = { sha?: string; tree?: { sha?: string } };
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
type GhBlobPayload = { content?: string; encoding?: string; sha?: string };

type WorkerBody = {
  jobId?: string;
  archiveId?: string;
  ownerUserId?: string;
};

type SourceBlobFile = {
  path: string;
  mode: "100644" | "100755";
  contentB64: string;
};

type ChildParentSourceArchiveRow = {
  id: string;
  parent_index_id: string | null;
  parent_index_url: string | null;
  parent_repo_full_name: string | null;
  parent_repo_url: string | null;
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

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const splitScopes = (value: string) =>
  value.split(/[\s,]+/g).map((entry) => entry.trim().toLowerCase()).filter(
    Boolean,
  );

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

const assertOk = (res: Response, payload: unknown, fallbackMessage: string) => {
  if (!res.ok) {
    throw new HttpError(
      res.status,
      getGhErrorMessage(payload, fallbackMessage),
    );
  }
};

const shouldExcludeSourcePath = (path: string) =>
  SOURCE_TREE_EXCLUSIONS.some((entry) =>
    entry.endsWith("/")
      ? path === entry.slice(0, -1) || path.startsWith(entry)
      : path === entry || path.endsWith(`/${entry}`)
  );

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
  const res = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(userToken),
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

async function getRepo({
  userToken,
  owner,
  repo,
}: {
  userToken: string;
  owner: string;
  repo: string;
}) {
  const { res, data } = await ghUserWithRetry<GhRepoPayload | GhErrorPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(res, data, "Failed reading repository.");
  return data as GhRepoPayload;
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
  const { res, data } = await ghUserWithRetry<GhBranchPayload | GhErrorPayload>(
    {
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/branches/${
        encodeURIComponent(branch)
      }`,
      delaysMs: BRANCH_READY_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
    },
  );
  assertOk(res, data, `Failed to read ${branch} branch for ${owner}/${repo}.`);
  const sha = typeof (data as GhBranchPayload)?.commit?.sha === "string"
    ? (data as GhBranchPayload).commit?.sha
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
  const { res, data } = await ghUserWithRetry<GhTreePayload | GhErrorPayload>({
    userToken,
    url:
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(res, data, `Failed reading tree ${treeSha} for ${owner}/${repo}.`);
  const tree = Array.isArray((data as GhTreePayload).tree)
    ? (data as GhTreePayload).tree ?? []
    : [];
  return tree;
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
  const { res, data } = await ghUserWithRetry<GhBlobPayload | GhErrorPayload>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/blobs/${blobSha}`,
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(res, data, `Failed reading blob ${blobSha} from ${owner}/${repo}.`);
  const blobPayload = data as GhBlobPayload;
  const encoding = typeof blobPayload.encoding === "string"
    ? blobPayload.encoding
    : "";
  const rawContent: string = typeof blobPayload.content === "string"
    ? blobPayload.content
    : "";
  if (blobSha === EMPTY_GIT_BLOB_SHA) {
    return "";
  }
  const content = rawContent.trim() ? rawContent : "";
  if (encoding !== "base64" || !content) {
    throw new HttpError(
      500,
      `Blob ${blobSha} from ${owner}/${repo} did not return base64 content.`,
    );
  }
  return content.replace(/\n/g, "");
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
  const { res, data } = await ghUserWithRetry<GhBlobPayload | GhErrorPayload>({
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
  assertOk(res, data, "Failed creating GitHub blob.");
  const sha = typeof (data as GhBlobPayload).sha === "string"
    ? (data as GhBlobPayload).sha
    : "";
  if (!sha) {
    throw new HttpError(500, "GitHub did not return a blob SHA.");
  }
  return sha;
}

async function createCommitFromFiles({
  userToken,
  owner,
  repo,
  branch,
  files,
  message,
  onProgress,
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
  files: SourceBlobFile[];
  message: string;
  onProgress?: (
    progress: { completed: number; total: number },
  ) => Promise<void>;
}) {
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

  const tree: Array<{
    path: string;
    mode: "100644" | "100755";
    type: "blob";
    sha: string;
  }> = [];

  let completed = 0;
  for (
    let offset = 0;
    offset < files.length;
    offset += GITHUB_BLOB_WRITE_CONCURRENCY
  ) {
    const batch = files.slice(offset, offset + GITHUB_BLOB_WRITE_CONCURRENCY);
    const batchTree = await Promise.all(
      batch.map(async (file) => {
        const blobSha = await createBlob({
          userToken,
          owner,
          repo,
          contentB64: file.contentB64,
        });
        return {
          path: file.path,
          mode: file.mode,
          type: "blob" as const,
          sha: blobSha,
        };
      }),
    );
    tree.push(...batchTree);
    completed += batch.length;

    if (
      onProgress &&
      (completed === files.length ||
        completed % GITHUB_BLOB_PROGRESS_INTERVAL === 0)
    ) {
      await onProgress({
        completed,
        total: files.length,
      });
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
        tree,
      }),
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(treeRes, treeData, "Failed creating repository tree.");
  const treeSha = typeof (treeData as GhTreePayload).sha === "string"
    ? (treeData as GhTreePayload).sha
    : "";
  if (!treeSha) {
    throw new HttpError(500, "GitHub did not return a tree SHA.");
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
        message,
        tree: treeSha,
        parents: [parentCommitSha],
      }),
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode),
  });
  assertOk(commitRes, commitData, "Failed creating repository commit.");

  const commitSha = typeof (commitData as GhCommitPayload).sha === "string"
    ? (commitData as GhCommitPayload).sha
    : "";
  if (!commitSha) {
    throw new HttpError(500, "GitHub did not return a commit SHA.");
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
  assertOk(refRes, refData, `Failed updating ${branch} branch.`);
}

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
    `VITE_SUPABASE_PROJECT_ID=${projectRef}`,
    `VITE_SUPABASE_URL=${projectUrl}`,
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

      - name: Copy standalone bridge admin
        run: |
          mkdir -p apps/site/dist/admin apps/site/dist/config apps/site/dist/.well-known apps/site/dist/assets
          cp -R site/admin/. apps/site/dist/admin/
          cp site/config/index.json apps/site/dist/config/index.json
          cp site/shared.js apps/site/dist/shared.js
          if [ -d site/.well-known ]; then cp -R site/.well-known/. apps/site/dist/.well-known/; fi
          if [ -d site/assets ]; then cp -R site/assets/. apps/site/dist/assets/; fi
          cp apps/site/dist/index.html apps/site/dist/404.html

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: ./apps/site/dist

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

async function loadSourceRepoFiles({
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
  const headSha = await getBranchHeadSha({
    userToken,
    owner,
    repo,
    branch,
  });
  const treeSha = await getCommitTreeSha({
    userToken,
    owner,
    repo,
    commitSha: headSha,
  });
  const treeEntries = await getRecursiveTree({
    userToken,
    owner,
    repo,
    treeSha,
  });

  const files: SourceBlobFile[] = [];
  for (const entry of treeEntries) {
    const path = toTrimmedString(entry.path);
    const type = toTrimmedString(entry.type);
    const mode = toTrimmedString(entry.mode);
    const sha = toTrimmedString(entry.sha);
    if (!path || type !== "blob" || !sha) {
      continue;
    }
    if (shouldExcludeSourcePath(path)) {
      continue;
    }
    const contentB64 = await getBlobBase64({
      userToken,
      owner,
      repo,
      blobSha: sha,
    });
    files.push({
      path,
      mode: mode === "100755" ? "100755" : "100644",
      contentB64,
    });
  }

  return files;
}

const upsertFile = (
  filesByPath: Map<string, SourceBlobFile>,
  file: SourceBlobFile,
) => {
  filesByPath.set(file.path, file);
};

const buildPatchedRepoFiles = ({
  sourceFiles,
  projectRef,
  projectUrl,
  publishableKey,
}: {
  sourceFiles: SourceBlobFile[];
  projectRef: string;
  projectUrl: string;
  publishableKey: string;
}) => {
  const filesByPath = new Map(
    sourceFiles.map((file) => [file.path, file] as const),
  );

  const viteConfig = filesByPath.get("apps/site/vite.config.ts");
  if (viteConfig) {
    upsertFile(filesByPath, {
      path: viteConfig.path,
      mode: viteConfig.mode,
      contentB64: Buffer.from(
        applyVitePagesPatch(fileB64ToUtf8(viteConfig.contentB64)),
        "utf8",
      ).toString("base64"),
    });
  }

  const appTsx = filesByPath.get("apps/site/src/App/App.tsx");
  if (appTsx) {
    upsertFile(filesByPath, {
      path: appTsx.path,
      mode: appTsx.mode,
      contentB64: Buffer.from(
        applyRouterBasenamePatch(fileB64ToUtf8(appTsx.contentB64)),
        "utf8",
      ).toString("base64"),
    });
  }

  upsertFile(filesByPath, {
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
  });

  upsertFile(filesByPath, {
    path: ".github/workflows/deploy.yml",
    mode: "100644",
    contentB64: Buffer.from(createDeployWorkflow(), "utf8").toString("base64"),
  });

  return [...filesByPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
};

const splitRepoFullName = (repoFullName: string) => {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo_full_name: ${repoFullName}`);
  }
  return {
    owner,
    repo,
  };
};

const isReservedSupabaseSecretName = (name: string) =>
  name.trim().toUpperCase().startsWith("SUPABASE_");

async function setProjectSecrets({
  accessToken,
  projectRef,
  secrets,
}: {
  accessToken: string;
  projectRef: string;
  secrets: Record<string, string>;
}) {
  const filteredSecrets = Object.entries(secrets)
    .filter(([name, value]) =>
      value.trim() && !isReservedSupabaseSecretName(name)
    )
    .map(([name, value]) => ({
      name,
      value,
    }));

  const skippedSecrets = Object.keys(secrets).filter((name) =>
    isReservedSupabaseSecretName(name)
  );
  if (skippedSecrets.length) {
    console.log("[index-finalize-worker] skipped reserved secrets", {
      projectRef,
      skippedSecrets,
    });
  }

  if (!filteredSecrets.length) {
    return;
  }

  const response = await fetch(
    `${SUPABASE_MANAGEMENT_API}/v1/projects/${projectRef}/secrets`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(filteredSecrets),
    },
  );
  if (response.ok) {
    return;
  }

  const payload = await response.json().catch(() => ({}));
  throw new HttpError(
    500,
    getGhErrorMessage(payload, "Failed to create project secrets."),
  );
}

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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or CREATE_SITE_SUPABASE_API_KEY.",
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
  const updateJob = async (
    patch: Record<string, unknown>,
  ) => {
    const { error } = await supabase
      .from("index_finalization_jobs")
      .update(patch)
      .eq("id", jobId)
      .eq("archive_id", archiveId);
    if (error) {
      throw new Error(error.message);
    }
  };

  waitUntil((async () => {
    await updateJob({
      status: "running",
      step: "Preparing finalization...",
      error: null,
      started_at: new Date().toISOString(),
    });

    try {
      const [{ archive, credentials }, resolvedGitHubAuth] = await Promise.all([
        readArchiveAndCredentials({
          supabase,
          archiveId,
        }),
        resolveGitHubTokenForUser({
          supabase,
          userId: ownerUserId,
        }),
      ]);

      const githubToken = toTrimmedString(resolvedGitHubAuth?.token);
      if (!githubToken) {
        throw new HttpError(
          412,
          "Reconnect GitHub from Profile before finalising the index.",
        );
      }

      let managementAccessToken = "";
      let managementScope = "";
      try {
        const resolvedManagementAccess =
          await resolveSupabaseManagementAccessForUser({
            supabase,
            userId: ownerUserId,
          });
        managementAccessToken = resolvedManagementAccess.accessToken;
        managementScope = resolvedManagementAccess.scope;
      } catch (error) {
        if (error instanceof SupabaseManagementReauthError) {
          throw new HttpError(
            412,
            "Reconnect your Supabase account before finalising the index.",
          );
        }
        throw error;
      }

      const grantedManagementScopes = splitScopes(managementScope);
      if (
        grantedManagementScopes.length &&
        !REQUIRED_FINALIZATION_SUPABASE_SCOPES.every((scope) =>
          grantedManagementScopes.includes(scope)
        )
      ) {
        throw new HttpError(
          412,
          "Reconnect your Supabase account with Secrets write and Auth write access before finalising the index.",
        );
      }

      const childArchive = await readChildParentSourceArchive({
        archiveId,
        credentials,
      });
      const parentSource = resolveParentSourceRepo({
        archive,
        childArchive,
      });
      if (!parentSource.repoFullName) {
        throw new HttpError(
          412,
          parentSource.message ??
            "The parent source repository is not configured for this index.",
        );
      }
      const syncedArchive = await reconcileParentSourceRepoLineage({
        supabase,
        archiveId,
        archive,
        credentials,
        childArchive,
        parentSource,
      });
      const sourceRepo = splitRepoFullName(parentSource.repoFullName);
      const targetRepo = {
        owner: credentials.repo_owner,
        repo: credentials.repo_name,
      };

      await updateJob({
        step: "Reading parent repository...",
        source_repo_full_name: parentSource.repoFullName,
        source_repo_url: parentSource.repoUrl,
        target_repo_full_name: credentials.repo_full_name,
        child_project_ref: credentials.supabase_project_ref,
        payload: {
          source_repo_full_name: parentSource.repoFullName,
          source_repo_url: parentSource.repoUrl,
          source_repo_resolution: parentSource.sourceKind,
        },
      });

      const sourceRepoPayload = await getRepo({
        userToken: githubToken,
        owner: sourceRepo.owner,
        repo: sourceRepo.repo,
      });
      const sourceBranch = toTrimmedString(sourceRepoPayload.default_branch) ||
        "main";
      const sourceFiles = await loadSourceRepoFiles({
        userToken: githubToken,
        owner: sourceRepo.owner,
        repo: sourceRepo.repo,
        branch: sourceBranch,
      });

      const finalRepoFiles = buildPatchedRepoFiles({
        sourceFiles,
        projectRef: credentials.supabase_project_ref,
        projectUrl: credentials.supabase_project_url,
        publishableKey: toTrimmedString(credentials.supabase_publishable_key),
      });
      const totalFinalRepoFiles = finalRepoFiles.length;

      await updateJob({
        step:
          `Writing finalized repository files (0/${totalFinalRepoFiles})...`,
        source_branch: sourceBranch,
        payload: {
          source_repo_full_name: parentSource.repoFullName,
          source_repo_url: parentSource.repoUrl,
          source_repo_resolution: parentSource.sourceKind,
          source_branch: sourceBranch,
          target_repo_full_name: credentials.repo_full_name,
          child_project_ref: credentials.supabase_project_ref,
          total_repo_files: totalFinalRepoFiles,
          repo_files_written: 0,
        },
      });
      await createCommitFromFiles({
        userToken: githubToken,
        owner: targetRepo.owner,
        repo: targetRepo.repo,
        branch: "main",
        files: finalRepoFiles,
        message: `Finalize index from ${parentSource.repoFullName}`,
        onProgress: async ({ completed, total }) => {
          try {
            await updateJob({
              step:
                `Writing finalized repository files (${completed}/${total})...`,
              payload: {
                source_repo_full_name: parentSource.repoFullName,
                source_repo_url: parentSource.repoUrl,
                source_repo_resolution: parentSource.sourceKind,
                source_branch: sourceBranch,
                target_repo_full_name: credentials.repo_full_name,
                child_project_ref: credentials.supabase_project_ref,
                total_repo_files: total,
                repo_files_written: completed,
              },
            });
          } catch (error) {
            console.warn(
              "[index-finalize-worker] failed to report write progress",
              {
                archiveId,
                completed,
                total,
                message: error instanceof Error ? error.message : String(error),
              },
            );
          }
        },
      });

      await updateJob({
        step: "Configuring child project secrets...",
      });
      await setProjectSecrets({
        accessToken: managementAccessToken,
        projectRef: credentials.supabase_project_ref,
        secrets: {
          CREATE_SITE_SUPABASE_API_KEY: decryptTokenValue(
            credentials.supabase_secret_key_encrypted,
          ),
          DELETE_REPO_SUPABASE_SECRET_KEY: decryptTokenValue(
            credentials.supabase_secret_key_encrypted,
          ),
          TOKEN_ENCRYPTION_KEY: TOKEN_ENCRYPTION_KEY,
          SOLIDARY_APP_URL: toTrimmedString(syncedArchive.canonical_url),
          SOLIDARY_ROOT_INDEX_ID: archive.id,
          SOLIDARY_ROOT_INDEX_URL: toTrimmedString(syncedArchive.canonical_url),
          SOLIDARY_ROOT_INDEX_LEVEL: String(archive.index_level ?? 1),
          SOLIDARY_ROOT_REPO_FULL_NAME: credentials.repo_full_name,
          SOLIDARY_ROOT_REPO_URL: toTrimmedString(credentials.repo_url),
        },
      });

      await updateJob({
        step: "Configuring child auth URLs...",
      });
      await updateSupabaseProjectAuthConfig({
        accessToken: managementAccessToken,
        projectRef: credentials.supabase_project_ref,
        siteUrl: toTrimmedString(syncedArchive.canonical_url),
      });

      await updateJob({
        step: "Marking index as finalized...",
      });
      await updateArchiveModes({
        archiveId,
        supabase,
        credentials,
      });

      await updateJob({
        status: "succeeded",
        step:
          "Index finalization completed. Add child repo secrets and run the Deploy Supabase Functions workflow.",
        error: null,
        payload: {
          source_repo_full_name: parentSource.repoFullName,
          source_repo_url: parentSource.repoUrl,
          source_repo_resolution: parentSource.sourceKind,
          source_branch: sourceBranch,
          target_repo_full_name: credentials.repo_full_name,
          target_repo_url: credentials.repo_url,
          child_project_ref: credentials.supabase_project_ref,
          functions_workflow_file: "deploy-supabase-functions.yml",
        },
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      await updateJob({
        status: "failed",
        step: "Index finalization failed.",
        error: error instanceof Error ? error.message : "Finalization failed.",
        completed_at: new Date().toISOString(),
      });
    }
  })());

  return safeJson(202, {
    ok: true,
    job_id: jobId,
  });
};

Deno.serve((request) => runHandler(request, handler));
