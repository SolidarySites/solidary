import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  HttpError,
  authorizeGitHubRepoAction
} from "../_shared/github-repo-guardrails.ts";

const GITHUB_API = "https://api.github.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SOLIDARY_SECRET_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

const requireEnv = () => {
  if (!SUPABASE_URL || !SOLIDARY_SECRET_KEY) {
    return "Missing SUPABASE_URL or Supabase service key.";
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

const safeErrorMessage = (payload: unknown, fallback: string) => {
  const value = payload as { message?: string };
  return typeof value?.message === "string" && value.message.trim() ? value.message.trim() : fallback;
};

type DraftRow = {
  id: string;
  site_id: string;
  owner_user_id: string;
  draft_type: "owner" | "editor";
  repo_full_name: string;
  branch: string;
  editor_branch: string | null;
  touched_sections: string[] | null;
  touched_page_slugs: string[] | null;
};

type PullPayload = {
  number?: number;
  html_url?: string;
  state?: string;
  title?: string;
  body?: string;
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

  const draftId = typeof payload.draftId === "string" ? payload.draftId.trim() : "";
  const githubToken = typeof payload.githubToken === "string" ? payload.githubToken.trim() : "";
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Studio collaboration update";
  const body = typeof payload.body === "string" ? payload.body : "";

  if (!draftId) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing draftId." })
    };
  }

  const supabase = createClient(SUPABASE_URL, SOLIDARY_SECRET_KEY, {
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

  const { data: draft, error: draftError } = await supabase
    .from("site_drafts")
    .select(
      "id, site_id, owner_user_id, draft_type, repo_full_name, branch, editor_branch, touched_sections, touched_page_slugs"
    )
    .eq("id", draftId)
    .maybeSingle();

  if (draftError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: draftError.message })
    };
  }
  if (!draft) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Draft not found." })
    };
  }

  const typedDraft = draft as DraftRow;
  if (typedDraft.draft_type !== "editor") {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Only editor drafts can be submitted as pull requests." })
    };
  }
  if (typedDraft.owner_user_id !== user.id) {
    return {
      statusCode: 403,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "You do not own this editor draft." })
    };
  }

  const { data: ownerDraft, error: ownerDraftError } = await supabase
    .from("site_drafts")
    .select("id, branch")
    .eq("site_id", typedDraft.site_id)
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

  const [owner, repo] = typedDraft.repo_full_name.split("/");
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
      functionName: "github-upsert-collaboration-pr",
      action: "upsert_collaboration_pr",
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

  const headBranch = (typedDraft.editor_branch ?? typedDraft.branch ?? "").trim();
  const baseBranch = (ownerDraft.branch ?? "").trim();
  if (!headBranch || !baseBranch) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Draft is missing branch information." })
    };
  }

  const { data: existingOpenPr, error: openPrError } = await supabase
    .from("site_collaboration_pull_requests")
    .select("id, github_pr_number")
    .eq("site_id", typedDraft.site_id)
    .eq("editor_user_id", user.id)
    .eq("status", "open")
    .maybeSingle();

  if (openPrError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: openPrError.message })
    };
  }

  let pull: PullPayload | null = null;
  const patchPull = async (number: number) => {
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}`, {
      method: "PATCH",
      headers: githubHeaders(authorizedGitHubToken),
      body: JSON.stringify({
        title,
        body
      })
    });
    const data = (await response.json().catch(() => ({}))) as PullPayload;
    if (!response.ok) {
      throw new Error(safeErrorMessage(data, "Failed to update pull request."));
    }
    return data;
  };

  try {
    if (existingOpenPr?.github_pr_number) {
      pull = await patchPull(existingOpenPr.github_pr_number);
    } else {
      const createResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
        method: "POST",
        headers: githubHeaders(authorizedGitHubToken),
        body: JSON.stringify({
          title,
          body,
          head: headBranch,
          base: baseBranch
        })
      });

      if (createResponse.ok) {
        pull = (await createResponse.json().catch(() => ({}))) as PullPayload;
      } else {
        const createPayload = (await createResponse.json().catch(() => ({}))) as {
          message?: string;
        };
        if (createResponse.status !== 422) {
          return {
            statusCode: createResponse.status,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              error: safeErrorMessage(createPayload, "Failed to create pull request.")
            })
          };
        }

        const listResponse = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${headBranch}`)}&base=${encodeURIComponent(baseBranch)}&per_page=1`,
          {
            method: "GET",
            headers: githubHeaders(authorizedGitHubToken)
          }
        );
        const listPayload = (await listResponse.json().catch(() => [])) as PullPayload[];
        if (!listResponse.ok || !Array.isArray(listPayload) || !listPayload.length) {
          return {
            statusCode: createResponse.status,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              error: safeErrorMessage(
                createPayload,
                "A matching pull request already exists, but it could not be loaded."
              )
            })
          };
        }
        pull = await patchPull(Number(listPayload[0]?.number ?? 0));
      }
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to upsert pull request."
      })
    };
  }

  const prNumber = typeof pull?.number === "number" ? pull.number : null;
  const prUrl = typeof pull?.html_url === "string" ? pull.html_url : "";
  const prState = typeof pull?.state === "string" ? pull.state : "open";
  if (!prNumber || !prUrl) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "GitHub did not return pull request details." })
    };
  }

  const touchedSections = (typedDraft.touched_sections ?? []).filter((entry) => typeof entry === "string");
  const touchedPageSlugs = (typedDraft.touched_page_slugs ?? []).filter(
    (entry) => typeof entry === "string"
  );

  const { error: upsertPrError } = await supabase
    .from("site_collaboration_pull_requests")
    .upsert(
      {
        site_id: typedDraft.site_id,
        editor_user_id: user.id,
        editor_draft_id: typedDraft.id,
        owner_draft_id: ownerDraft.id,
        repo_full_name: typedDraft.repo_full_name,
        base_branch: baseBranch,
        head_branch: headBranch,
        github_pr_number: prNumber,
        github_pr_url: prUrl,
        github_pr_state: prState === "closed" ? "closed" : "open",
        status: prState === "closed" ? "closed" : "open",
        title,
        body,
        touched_sections: touchedSections,
        touched_page_slugs: touchedPageSlugs
      },
      { onConflict: "site_id,github_pr_number" }
    );

  if (upsertPrError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: upsertPrError.message })
    };
  }

  const { error: draftUpdateError } = await supabase
    .from("site_drafts")
    .update({
      last_pull_request_number: prNumber,
      last_pull_request_url: prUrl,
      last_pull_request_state: prState
    })
    .eq("id", typedDraft.id)
    .eq("owner_user_id", user.id)
    .eq("draft_type", "editor");

  if (draftUpdateError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: draftUpdateError.message })
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      pullRequest: {
        number: prNumber,
        url: prUrl,
        state: prState,
        baseBranch,
        headBranch
      }
    })
  };
};


Deno.serve((request) => runHandler(request, handler));
