import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_DELETE_REPO_SECRET_KEY = process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? "";

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_DELETE_REPO_SECRET_KEY) {
    return "Missing SUPABASE_URL or SUPABASE_DELETE_REPO_SECRET_KEY.";
  }
  return null;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const envError = requireEnv();
    if (envError) {
      return { statusCode: 500, body: JSON.stringify({ error: envError }) };
    }

    const { token, owner, repo, supabase_access_token } = JSON.parse(event.body ?? "{}");
    if (!token || !owner || !repo || !supabase_access_token) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing parameters." }) };
    }

    const repoFullName = `${owner}/${repo}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_DELETE_REPO_SECRET_KEY, {
      auth: { persistSession: false }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(
      supabase_access_token
    );
    if (userError || !userData?.user) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid Supabase session." }) };
    }

    const { data: draftRow, error: draftError } = await supabase
      .from("site_drafts")
      .select("id")
      .eq("owner_user_id", userData.user.id)
      .eq("draft_type", "owner")
      .eq("repo_full_name", repoFullName)
      .maybeSingle();

    if (draftError) {
      return { statusCode: 500, body: JSON.stringify({ error: draftError.message }) };
    }

    if (!draftRow) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Repo not linked to this user." })
      };
    }

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      }
    });

    if (response.status === 204) {
      return { statusCode: 204, body: "" };
    }

    const payload = await response.json().catch(() => ({}));
    return {
      statusCode: response.status,
      body: JSON.stringify({ error: payload?.message ?? "Failed to delete repo." })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })
    };
  }
};
