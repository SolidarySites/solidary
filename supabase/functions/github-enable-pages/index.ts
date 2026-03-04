import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  HttpError,
  authorizeGitHubRepoAction,
  mapGitHubApiFailureToActionableAuthMessage,
  safeJson
} from "../_shared/github-repo-guardrails.ts";

const GITHUB_API = "https://api.github.com";
const RETRY_DELAYS_MS = [0, 1000, 2000, 4000];

type EnablePagesBody = {
  token?: string;
  supabase_access_token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = (JSON.parse(event.body ?? "{}") ?? {}) as EnablePagesBody;
    const owner = body.owner?.trim() ?? "";
    const repo = body.repo?.trim() ?? "";
    const branch = body.branch?.trim() ?? "";

    if (!owner || !repo || !branch) {
      return safeJson(400, { error: "Missing owner, repo, or branch." });
    }

    const { githubToken, tokenSource, repoScope } = await authorizeGitHubRepoAction({
      functionName: "github-enable-pages",
      action: "enable_pages",
      owner,
      repo,
      directToken: body.token,
      supabaseAccessToken: body.supabase_access_token,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const headers = {
      Authorization: `Bearer ${githubToken}`,
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
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      const pagesResult = await pagesResponse.json().catch(() => ({}));
      if (!pagesResponse.ok) {
        return null;
      }
      return pagesResult as Record<string, unknown>;
    };

    const updatePages = async () => {
      const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
        method: "PUT",
        headers,
        body: JSON.stringify(pagesPayload)
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    };

    let lastStatus = 0;
    let lastPayload: Record<string, unknown> = {};

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay > 0) {
        await sleep(delay);
      }

      const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
        method: "POST",
        headers,
        body: JSON.stringify(pagesPayload)
      });

      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) {
        await updatePages();
        const pages = await fetchPages();
        return safeJson(200, {
          status: "already_enabled",
          pages,
          pagesUrl: (pages as { html_url?: string } | null)?.html_url
        });
      }

      if (response.ok) {
        await updatePages();
        const pages = (payload as { html_url?: string })?.html_url ? payload : await fetchPages();
        const pagesData = pages ?? payload;
        return safeJson(200, {
          status: "enabled",
          pages: pagesData,
          pagesUrl: (pagesData as { html_url?: string })?.html_url
        });
      }

      lastStatus = response.status;
      lastPayload = payload as Record<string, unknown>;

      if (response.status === 422) {
        const branchResponse = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
          { headers }
        );

        if (branchResponse.ok && attempt < RETRY_DELAYS_MS.length - 1) {
          continue;
        }
      }

      break;
    }

    return safeJson(lastStatus || 500, {
      error: mapGitHubApiFailureToActionableAuthMessage({
        tokenSource,
        repoScope,
        owner,
        repo,
        statusCode: lastStatus || 500,
        message: (lastPayload as { message?: string })?.message ?? "Failed to enable Pages."
      })
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return safeJson(error.statusCode, { error: error.message });
    }
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};


Deno.serve((request) => runHandler(request, handler));
