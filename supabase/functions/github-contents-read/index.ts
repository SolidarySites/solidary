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
    const {
      token,
      owner,
      repo,
      path,
      branch,
      supabase_access_token
    } = JSON.parse(event.body ?? "{}");
    if (!owner || !repo || !path) {
      return safeJson(400, { error: "Missing owner, repo, or path." });
    }

    const { githubToken } = await authorizeGitHubRepoAction({
      functionName: "github-contents-read",
      action: "read_contents",
      owner,
      repo,
      directToken: token,
      supabaseAccessToken: supabase_access_token,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const url = new URL(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);
    if (branch) {
      url.searchParams.set("ref", branch);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      sha?: string;
      content?: string;
      encoding?: string;
    };
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: payload.message ?? "Failed to read file."
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sha: payload.sha,
        content: payload.content,
        encoding: payload.encoding
      })
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
