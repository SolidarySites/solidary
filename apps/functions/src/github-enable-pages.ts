import type { Handler } from "@netlify/functions";

const GITHUB_API = "https://api.github.com";
const RETRY_DELAYS_MS = [0, 1000, 2000, 4000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, owner, repo, branch } = JSON.parse(event.body ?? "{}");
    if (!token || !owner || !repo || !branch) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing parameters." }) };
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    };

    let lastStatus = 0;
    let lastPayload: Record<string, unknown> = {};

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (RETRY_DELAYS_MS[attempt] > 0) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }

      const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          source: {
            branch,
            path: "/"
          }
        })
      });

      const payload = await response.json().catch(() => ({}));
      console.log("[github-enable-pages] github response", {
        status: response.status,
        statusText: response.statusText,
        message: (payload as { message?: string })?.message,
        documentation_url: (payload as { documentation_url?: string })?.documentation_url
      });

      if (response.status === 409) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "already_enabled" })
        };
      }

      if (response.ok) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "enabled", pages: payload })
        };
      }

      lastStatus = response.status;
      lastPayload = payload as Record<string, unknown>;

      if (response.status === 422) {
        const branchResponse = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
          { headers }
        );
        console.log("[github-enable-pages] branch check", {
          branch,
          status: branchResponse.status
        });
        if (branchResponse.status === 404) {
          continue;
        }
      }

      break;
    }

    return {
      statusCode: lastStatus || 500,
      body: JSON.stringify({ error: (lastPayload as { message?: string })?.message ?? "Failed to enable Pages." })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })
    };
  }
};
