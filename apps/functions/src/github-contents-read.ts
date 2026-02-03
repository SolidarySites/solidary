import type { Handler } from "@netlify/functions";

const GITHUB_API = "https://api.github.com";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, owner, repo, path, branch } = JSON.parse(event.body ?? "{}");
    if (!token || !owner || !repo || !path) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing parameters." }) };
    }

    const url = new URL(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);
    if (branch) {
      url.searchParams.set("ref", branch);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: payload?.message ?? "Failed to read file." })
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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })
    };
  }
};
