import type { Handler } from "@netlify/functions";

const GITHUB_API = "https://api.github.com";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, owner, repo, path, message, content, sha, branch } = JSON.parse(event.body ?? "{}");
    if (!token || !owner || !repo || !path || !message || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing parameters." }) };
    }

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
      } else if (readResponse.status !== 404) {
        const readPayload = await readResponse.json().catch(() => ({}));
        return {
          statusCode: readResponse.status,
          body: JSON.stringify({ error: readPayload?.message ?? "Failed to read file for sha." })
        };
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
        response = await writeOnce(readPayload?.sha);
        payload = await response.json().catch(() => ({}));
      }
    }

    if (!response.ok) {
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
