import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  HttpError,
  authorizeGitHubRepoAction,
  mapGitHubApiFailureToActionableAuthMessage,
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
      message,
      branch,
      supabase_access_token
    } = JSON.parse(event.body ?? "{}");
    if (!owner || !repo || !path) {
      return safeJson(400, { error: "Missing owner, repo, or path." });
    }

    const { githubToken, tokenSource, repoScope } = await authorizeGitHubRepoAction({
      functionName: "github-contents-delete",
      action: "delete_contents",
      owner,
      repo,
      directToken: token,
      supabaseAccessToken: supabase_access_token,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const logPrefix = `[github-contents-delete] ${owner}/${repo}:${path}`;

    const url = new URL(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);
    if (branch) {
      url.searchParams.set("ref", branch);
    }

    const readResponse = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    if (readResponse.status === 404) {
      console.log(`${logPrefix} missing`, { branch });
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleted: false })
      };
    }

    if (!readResponse.ok) {
      const readPayload = (await readResponse.json().catch(() => ({}))) as {
        message?: string;
      };
      console.log(`${logPrefix} read failed`, {
        status: readResponse.status,
        message: readPayload?.message,
        branch
      });
      const rawMessage = readPayload?.message ?? "Failed to read file for delete.";
      return {
        statusCode: readResponse.status,
        body: JSON.stringify({
          error: mapGitHubApiFailureToActionableAuthMessage({
            tokenSource,
            repoScope,
            owner,
            repo,
            statusCode: readResponse.status,
            message: rawMessage
          })
        })
      };
    }

    const readPayload = (await readResponse.json().catch(() => ({}))) as {
      sha?: string;
    };
    const sha = readPayload?.sha;

    const deleteResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message ?? `Delete ${path}`,
        sha,
        branch
      })
    });

    const deletePayload = (await deleteResponse.json().catch(() => ({}))) as {
      message?: string;
    };
    console.log(`${logPrefix} delete`, {
      status: deleteResponse.status,
      message: deletePayload?.message,
      branch
    });

    if (!deleteResponse.ok) {
      const rawMessage = deletePayload?.message ?? "Failed to delete file.";
      return {
        statusCode: deleteResponse.status,
        body: JSON.stringify({
          error: mapGitHubApiFailureToActionableAuthMessage({
            tokenSource,
            repoScope,
            owner,
            repo,
            statusCode: deleteResponse.status,
            message: rawMessage
          })
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deleted: true })
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
