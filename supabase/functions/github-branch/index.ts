import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  HttpError,
  authorizeGitHubRepoAction,
  mapGitHubApiFailureToActionableAuthMessage,
  safeJson
} from "../_shared/github-repo-guardrails.ts";

const GITHUB_API = "https://api.github.com";

type BranchBody = {
  token?: string;
  supabase_access_token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = (JSON.parse(event.body ?? "{}") ?? {}) as BranchBody;
    const owner = body.owner?.trim() ?? "";
    const repo = body.repo?.trim() ?? "";
    const branch = body.branch?.trim() ?? "";

    if (!owner || !repo || !branch) {
      return safeJson(400, { error: "Missing owner, repo, or branch." });
    }

    const { githubToken, tokenSource, repoScope } = await authorizeGitHubRepoAction({
      functionName: "github-branch",
      action: "read_branch_head",
      owner,
      repo,
      directToken: body.token,
      supabaseAccessToken: body.supabase_access_token,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const response = await fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      commit?: { sha?: string };
    };
    if (!response.ok) {
      const rawMessage = payload.message?.trim() || "Failed to read branch.";
      return safeJson(response.status, {
        error: mapGitHubApiFailureToActionableAuthMessage({
          tokenSource,
          repoScope,
          owner,
          repo,
          statusCode: response.status,
          message: rawMessage
        })
      });
    }

    return safeJson(200, { sha: payload.commit?.sha ?? "" });
  } catch (error) {
    if (error instanceof HttpError) {
      return safeJson(error.statusCode, { error: error.message });
    }
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};


Deno.serve((request) => runHandler(request, handler));
