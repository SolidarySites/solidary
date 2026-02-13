import type { Handler } from "@netlify/functions";
import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { join, relative, sep } from "node:path";

const GITHUB_API = "https://api.github.com";
const TEMPLATE_DIR = "templates/astro-baseline";
const TARGET_DEFAULT_BRANCH = "main";
const BRANCH_READY_RETRY_DELAYS_MS = [0, 300, 900, 1800, 3600, 6400];
const GITHUB_WRITE_RETRY_DELAYS_MS = [0, 250, 700, 1400, 2600];
const RETRYABLE_GITHUB_STATUS = new Set([404, 409, 422, 429, 500, 502, 503, 504]);

const EXCLUDE_DIRS = new Set(["node_modules", ".git", ".netlify", "dist", ".astro", ".turbo"]);
const EXCLUDE_FILES = new Set<string>([".DS_Store"]);

type GhErrorPayload = { message?: string; documentation_url?: string };
type GhRepoPayload = {
  default_branch?: string;
  full_name?: string;
  name?: string;
  owner?: { login?: string };
};

type FileRecord = {
  absPath: string;
  relPath: string;
  mode: "100644" | "100755" | "120000";
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

function safeJson(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
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

async function mapLimit<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let i = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

function normalizeGitPath(pathValue: string) {
  return pathValue.split(sep).join("/");
}

function findTemplateRoot(): string {
  const candidates: string[] = [];

  candidates.push(join(process.cwd(), TEMPLATE_DIR));
  candidates.push(join(process.cwd(), "..", TEMPLATE_DIR));

  if (typeof __dirname === "string" && __dirname.length > 0) {
    candidates.push(join(__dirname, TEMPLATE_DIR));
    candidates.push(join(__dirname, "..", TEMPLATE_DIR));
    candidates.push(join(__dirname, "..", "..", TEMPLATE_DIR));
    candidates.push(join(__dirname, "..", "..", "..", TEMPLATE_DIR));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error("Template directory not found in function bundle.");
}

async function walkFiles(rootAbs: string): Promise<FileRecord[]> {
  const out: FileRecord[] = [];

  async function walk(dirAbs: string) {
    const entries = await fsp.readdir(dirAbs, { withFileTypes: true });

    for (const ent of entries) {
      const absPath = join(dirAbs, ent.name);
      const relPath = normalizeGitPath(relative(rootAbs, absPath));

      if (!relPath || relPath.startsWith("..")) continue;
      if (EXCLUDE_FILES.has(ent.name)) continue;

      if (ent.isDirectory()) {
        if (EXCLUDE_DIRS.has(ent.name)) continue;
        await walk(absPath);
        continue;
      }

      if (ent.isSymbolicLink()) {
        out.push({ absPath, relPath, mode: "120000" });
        continue;
      }

      if (ent.isFile()) {
        const stat = await fsp.stat(absPath);
        const isExecutable = (stat.mode & 0o111) !== 0;
        out.push({ absPath, relPath, mode: isExecutable ? "100755" : "100644" });
      }
    }
  }

  await walk(rootAbs);
  return out;
}

async function readFileAsGitBlob(absPath: string, mode: FileRecord["mode"]): Promise<{ contentB64: string }> {
  if (mode === "120000") {
    const linkTarget = await fsp.readlink(absPath);
    return { contentB64: Buffer.from(linkTarget, "utf8").toString("base64") };
  }
  return { contentB64: (await fsp.readFile(absPath)).toString("base64") };
}

function getGhErrorMessage(payload: unknown, fallback: string) {
  const maybePayload = payload as GhErrorPayload;
  return maybePayload?.message ?? fallback;
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
  const refUrl = `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const { res, data } = await ghUserWithRetry<any>({
    userToken,
    url: refUrl,
    delaysMs: BRANCH_READY_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertOk(res, data, `Failed to read ${branch} branch ref.`);

  const sha = typeof data?.object?.sha === "string" ? data.object.sha : undefined;
  if (!sha) {
    throw new HttpError(500, `Branch ${branch} does not contain a head commit SHA.`);
  }
  return sha;
}

async function createBlobsTreeAndCommit({
  userToken,
  owner,
  repo,
  files,
  parentSha
}: {
  userToken: string;
  owner: string;
  repo: string;
  files: FileRecord[];
  parentSha: string;
}) {
  const treeItems = await mapLimit(files, 10, async (file) => {
    const { contentB64 } = await readFileAsGitBlob(file.absPath, file.mode);

    const { res: blobRes, data: blobData } = await ghUserWithRetry<any>({
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentB64,
          encoding: "base64"
        })
      },
      delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
    });
    assertOk(blobRes, blobData, `Failed creating blob for ${file.relPath}.`);

    return {
      path: file.relPath,
      mode: file.mode,
      type: "blob",
      sha: blobData.sha as string
    };
  });

  const { res: treeRes, data: treeData } = await ghUserWithRetry<any>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree: treeItems })
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertOk(treeRes, treeData, "Failed creating tree.");

  const { res: commitRes, data: commitData } = await ghUserWithRetry<any>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Initialize repository from bundled template",
        tree: treeData.sha,
        parents: [parentSha]
      })
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });
  assertOk(commitRes, commitData, "Failed creating commit.");

  const commitSha = typeof commitData?.sha === "string" ? commitData.sha : undefined;
  if (!commitSha) {
    throw new HttpError(500, "Missing commit SHA from GitHub.");
  }
  return commitSha;
}

async function ensureMainBranchPointsToCommit({
  userToken,
  owner,
  repo,
  sourceDefaultBranch,
  commitSha
}: {
  userToken: string;
  owner: string;
  repo: string;
  sourceDefaultBranch: string;
  commitSha: string;
}) {
  if (sourceDefaultBranch === TARGET_DEFAULT_BRANCH) {
    const { res, data } = await ghUserWithRetry<any>({
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${TARGET_DEFAULT_BRANCH}`,
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
    assertOk(res, data, `Failed updating ${TARGET_DEFAULT_BRANCH} branch.`);
    return;
  }

  const mainRef = `refs/heads/${TARGET_DEFAULT_BRANCH}`;
  const { res: createRes, data: createData } = await ghUserWithRetry<any>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/refs`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: mainRef,
        sha: commitSha
      })
    },
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });

  if (createRes.ok) return;
  if (createRes.status !== 422) {
    assertOk(createRes, createData, `Failed creating ${TARGET_DEFAULT_BRANCH} branch.`);
  }

  const { res: patchRes, data: patchData } = await ghUserWithRetry<any>({
    userToken,
    url: `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${TARGET_DEFAULT_BRANCH}`,
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
  assertOk(patchRes, patchData, `Failed updating ${TARGET_DEFAULT_BRANCH} branch.`);
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

  let createdOwner = "";
  let createdRepo = "";
  let userToken = "";

  try {
    const {
      token,
      name,
      description,
      private: isPrivate
    } = JSON.parse(event.body ?? "{}") as {
      token?: string;
      name?: string;
      description?: string;
      private?: boolean;
    };

    if (!token || !name) {
      return safeJson(400, { error: "Missing token or name." });
    }
    userToken = token;

    const templateRoot = findTemplateRoot();
    const templateFiles = await walkFiles(templateRoot);
    if (templateFiles.length === 0) {
      throw new HttpError(500, "Template directory is empty.");
    }

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

    const initialDefaultBranch = newRepoData.default_branch || TARGET_DEFAULT_BRANCH;
    const baseSha = await getBranchHeadSha({
      userToken,
      owner,
      repo,
      branch: initialDefaultBranch
    });

    const commitSha = await createBlobsTreeAndCommit({
      userToken,
      owner,
      repo,
      files: templateFiles,
      parentSha: baseSha
    });

    await ensureMainBranchPointsToCommit({
      userToken,
      owner,
      repo,
      sourceDefaultBranch: initialDefaultBranch,
      commitSha
    });

    await setDefaultBranch({
      userToken,
      owner,
      repo,
      branch: TARGET_DEFAULT_BRANCH
    });

    const repoPayload = await getRepo({ userToken, owner, repo });
    return safeJson(200, { repo: repoPayload });
  } catch (error) {
    if (createdOwner && createdRepo && userToken) {
      await cleanupRepo({
        userToken,
        owner: createdOwner,
        repo: createdRepo
      });
    }

    if (error instanceof HttpError) {
      return safeJson(error.statusCode, { error: error.message });
    }

    return safeJson(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
};
