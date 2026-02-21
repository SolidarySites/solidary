import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import {
  HttpError,
  authorizeGitHubRepoAction
} from "./github-repo-guardrails";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_DELETE_REPO_SECRET_KEY = process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? "";

const requireEnv = () => {
  if (!SUPABASE_URL || !SUPABASE_DELETE_REPO_SECRET_KEY) {
    return "Missing SUPABASE_URL or SUPABASE_DELETE_REPO_SECRET_KEY.";
  }
  return null;
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
});

const safeError = (payload: unknown, fallback: string) => {
  const value = payload as { message?: string };
  return typeof value?.message === "string" && value.message.trim() ? value.message.trim() : fallback;
};

type PullRequestRow = {
  id: string;
  editor_draft_id: string;
  editor_user_id: string;
  github_pr_url: string;
  status: "open" | "closed" | "merged";
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const envError = requireEnv();
  if (envError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: envError })
    };
  }

  const accessToken = parseBearerToken(
    event.headers.authorization ?? event.headers.Authorization
  );
  if (!accessToken) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing bearer token." })
    };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON payload." })
    };
  }

  const siteId = typeof payload.siteId === "string" ? payload.siteId.trim() : "";
  const pullRequestNumber = Number(payload.pullRequestNumber);
  const githubToken = typeof payload.githubToken === "string" ? payload.githubToken.trim() : "";
  const commitTitle =
    typeof payload.commitTitle === "string" && payload.commitTitle.trim()
      ? payload.commitTitle.trim()
      : "Merge collaboration changes";
  const commitMessage = typeof payload.commitMessage === "string" ? payload.commitMessage.trim() : "";

  if (!siteId || !Number.isFinite(pullRequestNumber) || pullRequestNumber < 1) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing siteId or pullRequestNumber." })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_DELETE_REPO_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized." })
    };
  }

  const { data: ownerDraft, error: ownerDraftError } = await supabase
    .from("site_drafts")
    .select("id, owner_user_id, repo_full_name, branch, files, commit_sha")
    .eq("site_id", siteId)
    .eq("draft_type", "owner")
    .limit(1)
    .maybeSingle();

  if (ownerDraftError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: ownerDraftError.message })
    };
  }
  if (!ownerDraft) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Owner draft not found for this site." })
    };
  }

  let hasMergePermission = ownerDraft.owner_user_id === user.id;
  if (!hasMergePermission) {
    const { data: adminMembership, error: adminError } = await supabase
      .from("site_admins")
      .select("role")
      .eq("site_id", siteId)
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (adminError) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: adminError.message })
      };
    }
    hasMergePermission = Boolean(adminMembership);
  }

  if (!hasMergePermission) {
    return {
      statusCode: 403,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Only owners and admins can merge collaboration pull requests." })
    };
  }

  const [owner, repo] = ownerDraft.repo_full_name.split("/");
  if (!owner || !repo) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Draft repo_full_name is invalid." })
    };
  }

  let authorizedGitHubToken = githubToken;
  try {
    const authorized = await authorizeGitHubRepoAction({
      functionName: "github-merge-collaboration-pr",
      action: "merge_collaboration_pr",
      owner,
      repo,
      directToken: githubToken,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });
    authorizedGitHubToken = authorized.githubToken;
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        statusCode: error.statusCode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: error.message })
      };
    }
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Could not authorize GitHub access."
      })
    };
  }

  const { data: prRow, error: prRowError } = await supabase
    .from("site_collaboration_pull_requests")
    .select("id, editor_draft_id, editor_user_id, github_pr_url, status")
    .eq("site_id", siteId)
    .eq("github_pr_number", pullRequestNumber)
    .maybeSingle();

  if (prRowError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: prRowError.message })
    };
  }

  if (!prRow) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Collaboration pull request record not found." })
    };
  }

  const typedPrRow = prRow as PullRequestRow;
  if (typedPrRow.status === "merged") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        alreadyMerged: true,
        pullRequest: {
          number: pullRequestNumber,
          url: typedPrRow.github_pr_url
        }
      })
    };
  }

  const mergeResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullRequestNumber}/merge`,
    {
      method: "PUT",
      headers: githubHeaders(authorizedGitHubToken),
      body: JSON.stringify({
        commit_title: commitTitle,
        ...(commitMessage ? { commit_message: commitMessage } : {})
      })
    }
  );
  const mergePayload = (await mergeResponse.json().catch(() => ({}))) as {
    merged?: boolean;
    sha?: string;
    message?: string;
  };

  if (!mergeResponse.ok || !mergePayload.merged) {
    return {
      statusCode: mergeResponse.status,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: safeError(mergePayload, "Failed to merge pull request.")
      })
    };
  }

  const nowIso = new Date().toISOString();

  const { error: updatePrError } = await supabase
    .from("site_collaboration_pull_requests")
    .update({
      status: "merged",
      github_pr_state: "merged",
      merged_at: nowIso,
      merged_by_user_id: user.id
    })
    .eq("site_id", siteId)
    .eq("github_pr_number", pullRequestNumber);

  if (updatePrError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: updatePrError.message })
    };
  }

  const { error: syncEditorDraftError } = await supabase
    .from("site_drafts")
    .update({
      files: ownerDraft.files,
      commit_sha: ownerDraft.commit_sha,
      touched_sections: [],
      touched_page_slugs: [],
      deleted_page_slugs: [],
      last_pull_request_state: "merged"
    })
    .eq("id", typedPrRow.editor_draft_id)
    .eq("draft_type", "editor");

  if (syncEditorDraftError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: syncEditorDraftError.message })
    };
  }

  const { error: deleteEditorPagesError } = await supabase
    .from("site_draft_pages")
    .delete()
    .eq("draft_id", typedPrRow.editor_draft_id);
  if (deleteEditorPagesError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: deleteEditorPagesError.message })
    };
  }

  const { data: ownerPages, error: ownerPagesError } = await supabase
    .from("site_draft_pages")
    .select("slug, title, content, show_in_nav, position, is_home")
    .eq("draft_id", ownerDraft.id);
  if (ownerPagesError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: ownerPagesError.message })
    };
  }

  if ((ownerPages ?? []).length) {
    const { error: insertEditorPagesError } = await supabase.from("site_draft_pages").insert(
      (ownerPages ?? []).map((page) => ({
        draft_id: typedPrRow.editor_draft_id,
        slug: page.slug,
        title: page.title,
        content: page.content,
        show_in_nav: page.show_in_nav,
        position: page.position,
        is_home: page.is_home
      }))
    );
    if (insertEditorPagesError) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: insertEditorPagesError.message })
      };
    }
  }

  const { data: ownerSettings, error: ownerSettingsError } = await supabase
    .from("site_draft_settings")
    .select("settings, styles")
    .eq("draft_id", ownerDraft.id)
    .maybeSingle();
  if (ownerSettingsError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: ownerSettingsError.message })
    };
  }

  const { error: upsertEditorSettingsError } = await supabase.from("site_draft_settings").upsert({
    draft_id: typedPrRow.editor_draft_id,
    settings: ownerSettings?.settings ?? {},
    styles: ownerSettings?.styles ?? {}
  });
  if (upsertEditorSettingsError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: upsertEditorSettingsError.message })
    };
  }

  const { error: clearEditorImagesError } = await supabase
    .from("site_draft_images")
    .delete()
    .eq("draft_id", typedPrRow.editor_draft_id);
  if (clearEditorImagesError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: clearEditorImagesError.message })
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      pullRequest: {
        number: pullRequestNumber,
        url: typedPrRow.github_pr_url,
        mergedSha: mergePayload.sha ?? null
      }
    })
  };
};
