import type { Handler } from "@netlify/functions";

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
    const { token, owner, repo, path, message, content, sha, branch } = JSON.parse(event.body ?? "{}");
    if (!token || !owner || !repo || !path || !message || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing parameters." }) };
    }

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
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (readResponse.ok) {
        const readPayload = await readResponse.json().catch(() => ({}));
        resolvedSha = readPayload?.sha;
        console.log(`${logPrefix} read sha`, { sha: resolvedSha, branch });
      } else if (readResponse.status !== 404) {
        const readPayload = await readResponse.json().catch(() => ({}));
        console.log(`${logPrefix} read failed`, {
          status: readResponse.status,
          message: readPayload?.message,
          branch
        });
        return {
          statusCode: readResponse.status,
          body: JSON.stringify({ error: readPayload?.message ?? "Failed to read file for sha." })
        };
      } else {
        console.log(`${logPrefix} read missing`, { branch });
      }
    }

    const writeOnce = async (shaOverride?: string) =>
      fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
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
    let payload = await response.json().catch(() => ({}));
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
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (readResponse.ok) {
        const readPayload = await readResponse.json().catch(() => ({}));
        console.log(`${logPrefix} retry read sha`, {
          sha: readPayload?.sha,
          branch
        });
        response = await writeOnce(readPayload?.sha);
        payload = await response.json().catch(() => ({}));
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
        payload = await response.json().catch(() => ({}));
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
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: payload?.message ?? "Failed to write file." })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: payload.content, commit: payload.commit })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })
    };
  }
};
