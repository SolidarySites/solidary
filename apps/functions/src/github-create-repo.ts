import type { Handler } from "@netlify/functions";
import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { join, relative, sep } from "node:path";

const GITHUB_API = "https://api.github.com";
const TEMPLATE_DIR = "templates/astro-baseline";
const TARGET_DEFAULT_BRANCH = "main";
const BRANCH_READY_RETRY_DELAYS_MS = [0, 1000, 2000, 4000, 8000, 12000, 16000];
const GITHUB_WRITE_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000];
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
type GhBranchPayload = {
  commit?: { sha?: string };
};
type GhContentReadPayload = {
  sha?: string;
  type?: string;
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

async function getFileSha({
  userToken,
  owner,
  repo,
  path,
  branch
}: {
  userToken: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
}) {
  const url = new URL(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);
  url.searchParams.set("ref", branch);

  const { res, data } = await ghUserWithRetry<GhContentReadPayload | GhErrorPayload>({
    userToken,
    url: url.toString(),
    delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
    shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
  });

  if (res.status === 404) {
    return null;
  }
  assertOk(res, data, `Failed reading ${path} in ${owner}/${repo}.`);

  const payload = data as GhContentReadPayload;
  if (payload.type && payload.type !== "file") {
    throw new HttpError(
      422,
      `Path ${path} in ${owner}/${repo} is not a regular file (${payload.type}).`
    );
  }

  return typeof payload.sha === "string" ? payload.sha : null;
}

async function writeFileToBranch({
  userToken,
  owner,
  repo,
  branch,
  file
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
  file: FileRecord;
}) {
  if (file.mode === "120000") {
    throw new HttpError(
      500,
      `Template file ${file.relPath} is a symlink and cannot be written through the GitHub contents API.`
    );
  }

  const { contentB64 } = await readFileAsGitBlob(file.absPath, file.mode);

  const writeOnce = async (sha?: string | null) =>
    ghUserWithRetry<any>({
      userToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/contents/${file.relPath}`,
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Seed ${file.relPath}`,
          content: contentB64,
          branch,
          sha: sha ?? undefined
        })
      },
      delaysMs: GITHUB_WRITE_RETRY_DELAYS_MS,
      shouldRetry: (statusCode) => RETRYABLE_GITHUB_STATUS.has(statusCode)
    });

  let currentSha = await getFileSha({
    userToken,
    owner,
    repo,
    path: file.relPath,
    branch
  });

  let { res, data } = await writeOnce(currentSha);
  if (!res.ok && (res.status === 409 || res.status === 422)) {
    currentSha = await getFileSha({
      userToken,
      owner,
      repo,
      path: file.relPath,
      branch
    });
    ({ res, data } = await writeOnce(currentSha));
  }

  assertOk(res, data, `Failed writing template file ${file.relPath} to ${owner}/${repo}.`);

  if (file.mode === "100755") {
    console.log("[github-create-repo] executable bit not preserved by contents API", {
      owner,
      repo,
      path: file.relPath
    });
  }
}

async function seedTemplateFiles({
  userToken,
  owner,
  repo,
  branch,
  files
}: {
  userToken: string;
  owner: string;
  repo: string;
  branch: string;
  files: FileRecord[];
}) {
  const sortedFiles = [...files].sort((a, b) => a.relPath.localeCompare(b.relPath));
  for (const file of sortedFiles) {
    await writeFileToBranch({
      userToken,
      owner,
      repo,
      branch,
      file
    });
  }
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
      await createBranchIfMissing({
        userToken,
        owner,
        repo,
        branch: TARGET_DEFAULT_BRANCH,
        fromSha: initialHeadSha
      });
    }

    await getBranchHeadSha({
      userToken,
      owner,
      repo,
      branch: TARGET_DEFAULT_BRANCH
    });

    await seedTemplateFiles({
      userToken,
      owner,
      repo,
      branch: TARGET_DEFAULT_BRANCH,
      files: templateFiles
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
      console.log("[github-create-repo] failed", {
        owner: createdOwner || null,
        repo: createdRepo || null,
        statusCode: error.statusCode,
        message: error.message
      });
      return safeJson(error.statusCode, { error: error.message });
    }

    console.log("[github-create-repo] failed", {
      owner: createdOwner || null,
      repo: createdRepo || null,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return safeJson(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
};
