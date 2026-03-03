import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  HttpError,
  authorizeGitHubRepoAction,
  mapGitHubApiFailureToActionableAuthMessage,
  safeJson
} from "../_shared/github-repo-guardrails.ts";

const GITHUB_API = "https://api.github.com";
const GITHUB_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const getBase64ByteLength = (base64Content: string) => {
  const normalized = base64Content.replace(/\s/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
};

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
      content,
      sha,
      branch,
      supabase_access_token
    } = JSON.parse(event.body ?? "{}");
    if (!owner || !repo || !path || !message || !content) {
      return safeJson(400, { error: "Missing parameters." });
    }

    const { githubToken, tokenSource } = await authorizeGitHubRepoAction({
      functionName: "github-contents-write",
      action: "write_contents",
      owner,
      repo,
      directToken: token,
      supabaseAccessToken: supabase_access_token,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const byteLength = getBase64ByteLength(String(content));
    if (byteLength > GITHUB_MAX_FILE_SIZE_BYTES) {
      return {
        statusCode: 413,
        body: JSON.stringify({ error: "File is larger than GitHub's 100 MB per-file limit." })
      };
    }

    const logPrefix = `[github-contents-write] ${owner}/${repo}:${path}`;

    let resolvedSha = sha;
    if (!resolvedSha) {
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
      if (readResponse.ok) {
        const readPayload = (await readResponse.json().catch(() => ({}))) as {
          sha?: string;
          message?: string;
        };
        resolvedSha = readPayload?.sha;
        console.log(`${logPrefix} read sha`, { sha: resolvedSha, branch });
      } else if (readResponse.status !== 404) {
        const readPayload = (await readResponse.json().catch(() => ({}))) as {
          message?: string;
        };
        console.log(`${logPrefix} read failed`, {
          status: readResponse.status,
          message: readPayload?.message,
          branch
        });
        const rawMessage = readPayload?.message ?? "Failed to read file for sha.";
        return {
          statusCode: readResponse.status,
          body: JSON.stringify({
            error: mapGitHubApiFailureToActionableAuthMessage({
              tokenSource,
              owner,
              repo,
              statusCode: readResponse.status,
              message: rawMessage
            })
          })
        };
      } else {
        console.log(`${logPrefix} read missing`, { branch });
      }
    }

    const writeOnce = async (shaOverride?: string) =>
      fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          content,
          sha: shaOverride ?? resolvedSha,
          branch
        })
      });

    let response = await writeOnce();
    let payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      sha?: string;
      content?: unknown;
      commit?: unknown;
    };
    console.log(`${logPrefix} write attempt`, {
      status: response.status,
      message: payload?.message,
      sha: resolvedSha,
      branch
    });
    if (!response.ok && (response.status === 409 || response.status === 422)) {
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
      if (readResponse.ok) {
        const readPayload = (await readResponse.json().catch(() => ({}))) as {
          sha?: string;
        };
        console.log(`${logPrefix} retry read sha`, {
          sha: readPayload?.sha,
          branch
        });
        response = await writeOnce(readPayload?.sha);
        payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          sha?: string;
          content?: unknown;
          commit?: unknown;
        };
        console.log(`${logPrefix} retry write`, {
          status: response.status,
          message: payload?.message,
          branch
        });
      }
    }

    if (
      !response.ok &&
      response.status === 409 &&
      typeof payload?.message === "string" &&
      payload.message.includes("repository is empty")
    ) {
      for (let attempt = 0; attempt < 3 && !response.ok; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        response = await writeOnce();
        payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          content?: unknown;
          commit?: unknown;
        };
        console.log(`${logPrefix} empty-repo retry`, {
          attempt: attempt + 1,
          status: response.status,
          message: payload?.message,
          branch
        });
      }
    }

    if (!response.ok) {
      console.log(`${logPrefix} write failed`, {
        status: response.status,
        message: payload?.message,
        sha: resolvedSha,
        branch
      });
      const rawMessage = payload?.message ?? "Failed to write file.";
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: mapGitHubApiFailureToActionableAuthMessage({
            tokenSource,
            owner,
            repo,
            statusCode: response.status,
            message: rawMessage
          })
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: payload.content, commit: payload.commit })
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
