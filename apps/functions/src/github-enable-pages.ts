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

    const pagesPayload = {
      build_type: "workflow",
      source: {
        branch,
        path: "/"
      }
    };

    const fetchPages = async () => {
      const pagesResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      const pagesPayload = await pagesResponse.json().catch(() => ({}));
      if (!pagesResponse.ok) {
        console.log("[github-enable-pages] pages fetch failed", {
          status: pagesResponse.status,
          message: (pagesPayload as { message?: string })?.message
        });
        return null;
      }
      return pagesPayload as Record<string, unknown>;
    };

    const updatePages = async () => {
      const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
        method: "PUT",
        headers,
        body: JSON.stringify(pagesPayload)
      });
      const payload = await response.json().catch(() => ({}));
      console.log("[github-enable-pages] pages update", {
        status: response.status,
        statusText: response.statusText,
        message: (payload as { message?: string })?.message,
        documentation_url: (payload as { documentation_url?: string })?.documentation_url,
        errors: (payload as { errors?: unknown })?.errors
      });
      return { response, payload };
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
        body: JSON.stringify(pagesPayload)
      });

      const payload = await response.json().catch(() => ({}));
      console.log("[github-enable-pages] github response", {
        status: response.status,
        statusText: response.statusText,
        message: (payload as { message?: string })?.message,
        documentation_url: (payload as { documentation_url?: string })?.documentation_url,
        errors: (payload as { errors?: unknown })?.errors
      });

      if (response.status === 409) {
        await updatePages();
        const pages = await fetchPages();
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "already_enabled",
            pages,
            pagesUrl: (pages as { html_url?: string } | null)?.html_url
          })
        };
      }

      if (response.ok) {
        await updatePages();
        const pages = (payload as { html_url?: string })?.html_url ? payload : await fetchPages();
        const pagesData = pages ?? payload;
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "enabled",
            pages: pagesData,
            pagesUrl: (pagesData as { html_url?: string })?.html_url
          })
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

        if (attempt < RETRY_DELAYS_MS.length - 1) {
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
