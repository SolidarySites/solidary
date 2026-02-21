import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { resolveGitHubTokenForUser } from "./github-auth-broker";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";

type BranchBody = {
  token?: string;
  supabase_access_token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const resolveGitHubToken = async ({
  body
}: {
  body: BranchBody;
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
    const body = (JSON.parse(event.body ?? "{}") ?? {}) as BranchBody;
    const owner = body.owner?.trim() ?? "";
    const repo = body.repo?.trim() ?? "";
    const branch = body.branch?.trim() ?? "";

    if (!owner || !repo || !branch) {
      return safeJson(400, { error: "Missing owner, repo, or branch." });
    }

    const resolvedToken = await resolveGitHubToken({ body });
    if (!resolvedToken) {
      return safeJson(412, {
        error: "GitHub authorization missing. Connect your GitHub App from account menu, then retry."
      });
    }

    const response = await fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
      {
        headers: {
          Authorization: `Bearer ${resolvedToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      commit?: { sha?: string };
    };
    if (!response.ok) {
      return safeJson(response.status, {
        error: payload.message?.trim() || "Failed to read branch."
      });
    }

    return safeJson(200, { sha: payload.commit?.sha ?? "" });
  } catch (error) {
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
