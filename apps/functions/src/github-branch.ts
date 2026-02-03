import type { Handler } from "@netlify/functions";

const GITHUB_API = "https://api.github.com";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, owner, repo, branch } = JSON.parse(event.body ?? "{}");
    if (!token || !owner || !repo || !branch) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing parameters." }) };
    }

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/branches/${branch}`, {
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
        body: JSON.stringify({ error: payload?.message ?? "Failed to read branch." })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha: payload?.commit?.sha })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })
    };
  }
};
