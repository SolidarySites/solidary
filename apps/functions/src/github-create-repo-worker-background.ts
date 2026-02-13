import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { ASTRO_BASELINE_BUNDLED_TEMPLATE } from "./astro-baseline-bundled-template";
import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { join, relative, sep } from "node:path";

const GITHUB_API = "https://api.github.com";
const TEMPLATE_DIR = "templates/astro-baseline";
const TARGET_DEFAULT_BRANCH = "main";
const BRANCH_READY_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000];
const GITHUB_WRITE_RETRY_DELAYS_MS = [0, 200, 500, 1000, 2000, 4000];
const RETRYABLE_GITHUB_STATUS = new Set([404, 409, 422, 429, 500, 502, 503, 504]);
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const CREATE_SITE_SUPABASE_API_KEY = process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";

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
  relPath: string;
  mode: "100644" | "100755";
  contentB64: string;
};

type ProvisionWorkerBody = {
  jobId?: string;
  ownerUserId?: string;
  token?: string;
  name?: string;
  description?: string;
  private?: boolean;
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

const parseBody = (rawBody: string | null): ProvisionWorkerBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as ProvisionWorkerBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const createSupabaseAdmin = () =>
  createClient(SUPABASE_URL, CREATE_SITE_SUPABASE_API_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

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
        throw new Error(`Template contains unsupported symlink: ${relPath}`);
      }

      if (ent.isFile()) {
        const stat = await fsp.stat(absPath);
        const isExecutable = (stat.mode & 0o111) !== 0;
        out.push({
          relPath,
          mode: isExecutable ? "100755" : "100644",
          contentB64: (await fsp.readFile(absPath)).toString("base64")
        });
      }
    }
  }

  await walk(rootAbs);
  return out;
}

async function loadTemplateFiles(): Promise<FileRecord[]> {
  try {
    const templateRoot = findTemplateRoot();
    const files = await walkFiles(templateRoot);
    if (files.length === 0) {
      throw new Error("Template directory is empty.");
    }
    return files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown template discovery error";
    console.log("[github-create-repo-worker] falling back to bundled templates", {
      message
    });

    if (!ASTRO_BASELINE_BUNDLED_TEMPLATE.length) {
      throw new Error("Template directory not found and bundled template fallback is empty.");
    }

    return [...ASTRO_BASELINE_BUNDLED_TEMPLATE].sort((a, b) => a.relPath.localeCompare(b.relPath));
  }
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
  const contentB64 = file.contentB64;

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

  let { res, data } = await writeOnce(null);
  if (!res.ok && (res.status === 409 || res.status === 422)) {
    await sleep(120);
    ({ res, data } = await writeOnce(null));
  }
  if (!res.ok && (res.status === 409 || res.status === 422)) {
    const currentSha = await getFileSha({
      userToken,
      owner,
      repo,
      path: file.relPath,
      branch
    });
    ({ res, data } = await writeOnce(currentSha ?? null));
  }

  if (!res.ok && file.relPath.startsWith(".github/workflows/")) {
    throw new HttpError(
      403,
      "GitHub token is missing permission to write workflow files. Sign out and sign in again so GitHub grants the 'workflow' scope."
    );
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
  const total = sortedFiles.length;
  for (let completed = 0; completed < sortedFiles.length; completed += 1) {
    const file = sortedFiles[completed];
    await writeFileToBranch({
      userToken,
      owner,
      repo,
      branch,
      file
    });
    const current = completed + 1;
    if (onProgress && (current === total || current % 5 === 0)) {
      await onProgress(current, total);
    }
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
  const parsedToken = payload.token?.trim() ?? "";
  const parsedName = payload.name?.trim() ?? "";

  if (!jobId || !ownerUserId || !parsedToken || !parsedName) {
    return safeJson(400, {
      error: "Missing jobId, ownerUserId, token, or name."
    });
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

  let createdOwner = "";
  let createdRepo = "";
  let userToken = parsedToken;

  await updateJob({
    status: "running",
    step: "Preparing repository provisioning...",
    error: null,
    started_at: new Date().toISOString()
  });

  try {
    const name = parsedName;
    const description = typeof payload.description === "string" ? payload.description : "";
    const isPrivate = payload.private === undefined ? false : Boolean(payload.private);

    await updateJob({
      step: "Loading bundled template files..."
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

    await updateJob({
      step: "Seeding template files (0%)..."
    });
    await seedTemplateFiles({
      userToken,
      owner,
      repo,
      branch: TARGET_DEFAULT_BRANCH,
      files: templateFiles,
      onProgress: async (completed, total) => {
        const percent = Math.max(1, Math.round((completed / Math.max(1, total)) * 100));
        await updateJob({
          step: `Seeding template files (${percent}%)...`
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

    return safeJson(202, {
      status: "accepted",
      jobId
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
      return safeJson(202, {
        status: "accepted",
        jobId
      });
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
    return safeJson(202, {
      status: "accepted",
      jobId
    });
  }
};
