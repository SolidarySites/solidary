import type { Handler } from "@netlify/functions";
import {
  HttpError,
  authorizeGitHubRepoAction,
  safeJson
} from "./github-repo-guardrails";

const GITHUB_API = "https://api.github.com";

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
});

const getErrorMessage = (payload: unknown, fallback: string) => {
  const data = payload as { message?: string };
  return typeof data?.message === "string" && data.message.trim() ? data.message.trim() : fallback;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = (event.body ? JSON.parse(event.body) : {}) as Record<string, unknown>;
  } catch {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON payload." })
    };
  }

  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  const supabaseAccessToken =
    typeof payload.supabase_access_token === "string"
      ? payload.supabase_access_token.trim()
      : "";
  const owner = typeof payload.owner === "string" ? payload.owner.trim() : "";
  const repo = typeof payload.repo === "string" ? payload.repo.trim() : "";
  const branch = typeof payload.branch === "string" ? payload.branch.trim() : "";
  const baseBranch =
    typeof payload.baseBranch === "string" && payload.baseBranch.trim()
      ? payload.baseBranch.trim()
      : "main";

  if (!owner || !repo || !branch) {
    return safeJson(400, { error: "Missing owner, repo, or branch." });
  }

  const readBranch = async (targetBranch: string, githubToken: string) => {
    const response = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodeURIComponent(targetBranch)}`,
      {
        method: "GET",
        headers: githubHeaders(githubToken)
      }
    );
    const data = (await response.json().catch(() => ({}))) as {
      commit?: { sha?: string };
      message?: string;
    };
    return { response, data };
  };

  try {
    const { githubToken } = await authorizeGitHubRepoAction({
      functionName: "github-ensure-branch",
      action: "ensure_branch",
      owner,
      repo,
      directToken: token,
      supabaseAccessToken,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const existing = await readBranch(branch, githubToken);
    if (existing.response.ok) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branch,
          sha: existing.data?.commit?.sha ?? null,
          created: false
        })
      };
    }
    if (existing.response.status !== 404) {
      return {
        statusCode: existing.response.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: getErrorMessage(existing.data, "Failed to read target branch.")
        })
      };
    }

    const base = await readBranch(baseBranch, githubToken);
    if (!base.response.ok) {
      return {
        statusCode: base.response.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: getErrorMessage(base.data, "Failed to read base branch.")
        })
      };
    }

    const baseSha = base.data?.commit?.sha?.trim() ?? "";
    if (!baseSha) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Base branch is missing a head commit SHA." })
      };
    }

    const createResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: githubHeaders(githubToken),
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseSha
      })
    });
    const createPayload = (await createResponse.json().catch(() => ({}))) as {
      object?: { sha?: string };
      message?: string;
    };

    if (!createResponse.ok && createResponse.status !== 422) {
      return {
        statusCode: createResponse.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: getErrorMessage(createPayload, "Failed to create branch.")
        })
      };
    }

    const finalBranch = await readBranch(branch, githubToken);
    if (!finalBranch.response.ok) {
      return {
        statusCode: finalBranch.response.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: getErrorMessage(finalBranch.data, "Failed to verify branch after create.")
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branch,
        sha: finalBranch.data?.commit?.sha ?? createPayload.object?.sha ?? null,
        created: createResponse.ok
      })
    };
  } catch (error) {
    if (error instanceof HttpError) {
      return safeJson(error.statusCode, { error: error.message });
    }
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error."
    });
  }
};
