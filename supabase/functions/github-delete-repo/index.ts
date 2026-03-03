import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  HttpError,
  authorizeGitHubRepoAction,
  safeJson
} from "../_shared/github-repo-guardrails.ts";

const GITHUB_API = "https://api.github.com";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, owner, repo, supabase_access_token } = JSON.parse(event.body ?? "{}");
    if (!owner || !repo) {
      return safeJson(400, { error: "Missing owner or repo." });
    }

    const { githubToken } = await authorizeGitHubRepoAction({
      functionName: "github-delete-repo",
      action: "delete_repo",
      owner,
      repo,
      directToken: token,
      supabaseAccessToken: supabase_access_token,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      }
    });

    if (response.status === 204) {
      return { statusCode: 204, body: "" };
    }

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    return {
      statusCode: response.status,
      body: JSON.stringify({ error: payload?.message ?? "Failed to delete repo." })
    };
  } catch (error) {
    if (error instanceof HttpError) {
      return safeJson(error.statusCode, { error: error.message });
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })
    };
  }
};


Deno.serve((request) => runHandler(request, handler));
