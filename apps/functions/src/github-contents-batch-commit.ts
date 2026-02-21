import type { Handler } from "@netlify/functions";
import {
  authorizeGitHubRepoAction,
  safeJson
} from "./github-repo-guardrails";

const GITHUB_API = "https://api.github.com";
const RETRYABLE_STATUS = new Set([404, 409, 422, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [0, 200, 500, 1000, 2000];

type BatchCommitBody = {
  token?: string;
  supabase_access_token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  message?: string;
  upserts?: Array<{
    path?: string;
    content?: string;
    mode?: "100644" | "100755";
  }>;
  deletes?: string[];
};

type GhErrorPayload = { message?: string; documentation_url?: string };

type BranchPayload = {
  commit?: {
    sha?: string;
  };
};

type CommitPayload = {
  sha?: string;
  tree?: {
    sha?: string;
  };
};

type BlobPayload = {
  sha?: string;
};

type TreePayload = {
  sha?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getGhErrorMessage = (payload: unknown, fallback: string) => {
  const p = payload as GhErrorPayload;
  const message = typeof p?.message === "string" ? p.message.trim() : "";
  const docs = typeof p?.documentation_url === "string" ? p.documentation_url.trim() : "";
  if (!message && !docs) return fallback;
  if (message && docs) return `${fallback} (${message}; ${docs})`;
  return `${fallback} (${message || docs})`;
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

const assertOk = (res: Response, payload: unknown, fallback: string) => {
  if (!res.ok) {
    throw new HttpError(res.status, getGhErrorMessage(payload, fallback));
  }
};

const ghRequest = async <T>(token: string, url: string, init: RequestInit = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {})
    }
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { res, data };
};

const ghRequestWithRetry = async <T>({
  token,
  url,
  init,
  shouldRetry
}: {
  token: string;
  url: string;
  init?: RequestInit;
  shouldRetry: (statusCode: number, payload: T) => boolean;
}) => {
  let last:
    | {
        res: Response;
        data: T;
      }
    | undefined;

  for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
    const delay = RETRY_DELAYS_MS[i];
    if (delay > 0) {
      await sleep(delay);
    }

    const current = await ghRequest<T>(token, url, init);
    last = current;

    if (current.res.ok) {
      return current;
    }
    if (!shouldRetry(current.res.status, current.data)) {
      return current;
    }
  }

  return last as { res: Response; data: T };
};

const parseBody = (rawBody: string | null): BatchCommitBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as BatchCommitBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: BatchCommitBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload."
    });
  }

  const token = body.token?.trim();
  const supabaseAccessToken = body.supabase_access_token?.trim();
  const owner = body.owner?.trim();
  const repo = body.repo?.trim();
  const branch = body.branch?.trim();
  const commitMessage = body.message?.trim() || "Publish site content";

  if (!owner || !repo || !branch) {
    return safeJson(400, { error: "Missing owner, repo, or branch." });
  }

  const upserts = Array.isArray(body.upserts) ? body.upserts : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];
  if (!upserts.length && !deletes.length) {
    return safeJson(400, { error: "Missing upserts or deletes." });
  }

  try {
    const { githubToken } = await authorizeGitHubRepoAction({
      functionName: "github-contents-batch-commit",
      action: "batch_commit_contents",
      owner,
      repo,
      directToken: token,
      supabaseAccessToken,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const dedupedUpserts = new Map<
      string,
      {
        path: string;
        mode: "100644" | "100755";
        content: string;
      }
    >();

    for (const upsert of upserts) {
      const path = upsert?.path?.trim() ?? "";
      const content = upsert?.content?.trim() ?? "";
      if (!path || !content) continue;
      const mode = upsert.mode === "100755" ? "100755" : "100644";
      dedupedUpserts.set(path, { path, mode, content });
    }

    const deleteSet = new Set<string>();
    for (const path of deletes) {
      const normalizedPath = path?.trim() ?? "";
      if (!normalizedPath) continue;
      deleteSet.add(normalizedPath);
    }

    for (const upsertPath of dedupedUpserts.keys()) {
      deleteSet.delete(upsertPath);
    }

    if (!dedupedUpserts.size && !deleteSet.size) {
      return safeJson(200, { noChanges: true });
    }

    const branchUrl = `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`;
    const { res: branchRes, data: branchData } = await ghRequestWithRetry<
      BranchPayload | GhErrorPayload
    >({
      token: githubToken,
      url: branchUrl,
      shouldRetry: (statusCode) => RETRYABLE_STATUS.has(statusCode)
    });
    assertOk(branchRes, branchData, `Failed reading ${branch} branch.`);

    const headSha =
      typeof (branchData as BranchPayload)?.commit?.sha === "string"
        ? (branchData as BranchPayload).commit?.sha
        : undefined;
    if (!headSha) {
      throw new HttpError(500, `Branch ${branch} does not have a head commit SHA.`);
    }

    const { res: headCommitRes, data: headCommitData } = await ghRequestWithRetry<
      CommitPayload | GhErrorPayload
    >({
      token: githubToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${headSha}`,
      shouldRetry: (statusCode) => RETRYABLE_STATUS.has(statusCode)
    });
    assertOk(headCommitRes, headCommitData, "Failed reading head commit.");

    const baseTreeSha =
      typeof (headCommitData as CommitPayload)?.tree?.sha === "string"
        ? (headCommitData as CommitPayload).tree?.sha
        : undefined;
    if (!baseTreeSha) {
      throw new HttpError(500, "Head commit is missing base tree SHA.");
    }

    const treeEntries: Array<{
      path: string;
      mode: "100644" | "100755";
      type: "blob";
      sha: string | null;
    }> = [];

    for (const upsert of dedupedUpserts.values()) {
      const { res: blobRes, data: blobData } = await ghRequestWithRetry<
        BlobPayload | GhErrorPayload
      >({
        token: githubToken,
        url: `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: upsert.content,
            encoding: "base64"
          })
        },
        shouldRetry: (statusCode) => RETRYABLE_STATUS.has(statusCode)
      });
      assertOk(blobRes, blobData, `Failed creating blob for ${upsert.path}.`);

      const blobSha = typeof (blobData as BlobPayload)?.sha === "string" ? (blobData as BlobPayload).sha : "";
      if (!blobSha) {
        throw new HttpError(500, `GitHub did not return blob SHA for ${upsert.path}.`);
      }

      treeEntries.push({
        path: upsert.path,
        mode: upsert.mode,
        type: "blob",
        sha: blobSha
      });
    }

    for (const path of deleteSet.values()) {
      treeEntries.push({
        path,
        mode: "100644",
        type: "blob",
        sha: null
      });
    }

    const { res: treeRes, data: treeData } = await ghRequestWithRetry<
      TreePayload | GhErrorPayload
    >({
      token: githubToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries
        })
      },
      shouldRetry: (statusCode) => RETRYABLE_STATUS.has(statusCode)
    });
    assertOk(treeRes, treeData, "Failed creating git tree.");

    const treeSha = typeof (treeData as TreePayload)?.sha === "string" ? (treeData as TreePayload).sha : "";
    if (!treeSha) {
      throw new HttpError(500, "GitHub did not return tree SHA.");
    }

    if (treeSha === baseTreeSha) {
      return safeJson(200, {
        noChanges: true,
        commitSha: headSha
      });
    }

    const { res: commitRes, data: commitData } = await ghRequestWithRetry<
      CommitPayload | GhErrorPayload
    >({
      token: githubToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: commitMessage,
          tree: treeSha,
          parents: [headSha]
        })
      },
      shouldRetry: (statusCode) => RETRYABLE_STATUS.has(statusCode)
    });
    assertOk(commitRes, commitData, "Failed creating commit.");

    const commitSha = typeof (commitData as CommitPayload)?.sha === "string" ? (commitData as CommitPayload).sha : "";
    if (!commitSha) {
      throw new HttpError(500, "GitHub did not return commit SHA.");
    }

    const { res: refRes, data: refData } = await ghRequestWithRetry<any>({
      token: githubToken,
      url: `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      init: {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sha: commitSha,
          force: false
        })
      },
      shouldRetry: (statusCode) => RETRYABLE_STATUS.has(statusCode)
    });
    assertOk(refRes, refData, `Failed updating ${branch} ref.`);

    return safeJson(200, {
      noChanges: false,
      commitSha
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return safeJson(error.statusCode, { error: error.message });
    }
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
