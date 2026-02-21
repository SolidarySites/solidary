import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { resolveGitHubTokenForUser } from "./github-auth-broker";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
const RETRY_DELAYS_MS = [0, 1000, 2000, 4000];

type EnablePagesBody = {
  token?: string;
  supabase_access_token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const resolveGitHubToken = async ({
  body
}: {
  body: EnablePagesBody;
}): Promise<string | null> => {
  const directToken = body.token?.trim() ?? "";
  const supabaseAccessToken = body.supabase_access_token?.trim() ?? "";

  if (!supabaseAccessToken) {
    return directToken || null;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return directToken || null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(supabaseAccessToken);
  if (userError || !user) {
    throw new Error("Invalid Supabase session.");
  }

  const resolved = await resolveGitHubTokenForUser({
    supabase,
    userId: user.id,
    fallbackToken: directToken
  });

  return resolved?.token ?? null;
};

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

    const token = await resolveGitHubToken({ body });
    if (!token) {
      return safeJson(412, {
        error: "GitHub authorization missing. Connect your GitHub App from account menu, then retry."
      });
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
      error: (lastPayload as { message?: string })?.message ?? "Failed to enable Pages."
    });
  } catch (error) {
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
