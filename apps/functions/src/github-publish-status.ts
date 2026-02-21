import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { resolveGitHubTokenForUser } from "./github-auth-broker";

const GITHUB_API = "https://api.github.com";
const SESSION_LOOKBACK_BUFFER_MS = 30_000;
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_DELETE_REPO_SECRET_KEY ?? process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";

type GitHubWorkflowRun = {
  id: number;
  html_url?: string;
  status?: string;
  conclusion?: string | null;
  path?: string;
  created_at?: string;
  head_branch?: string;
};

type GitHubErrorPayload = {
  message?: string;
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
});

const parseFailureMessage = (conclusion: string | null | undefined) => {
  switch (conclusion) {
    case "cancelled":
      return "Latest GitHub Actions run was cancelled.";
    case "timed_out":
      return "GitHub Actions deployment timed out.";
    case "action_required":
      return "GitHub Actions deployment needs manual action.";
    case "failure":
      return "GitHub Actions deployment failed.";
    default:
      return "GitHub Actions deployment did not complete successfully.";
  }
};

const findWorkflowRunsByBranch = async (
  token: string,
  owner: string,
  repo: string,
  branch: string,
  workflow: string
) => {
  const workflowRunsUrl = new URL(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs`
  );
  workflowRunsUrl.searchParams.set("event", "push");
  workflowRunsUrl.searchParams.set("branch", branch);
  workflowRunsUrl.searchParams.set("per_page", "30");

  const workflowResponse = await fetch(workflowRunsUrl.toString(), {
    headers: githubHeaders(token)
  });
  const workflowPayload = await workflowResponse.json().catch(() => ({}));

  if (workflowResponse.ok) {
    const workflowRuns = Array.isArray((workflowPayload as { workflow_runs?: unknown[] }).workflow_runs)
      ? ((workflowPayload as { workflow_runs: GitHubWorkflowRun[] }).workflow_runs ?? [])
      : [];
    return workflowRuns;
  }

  if (workflowResponse.status !== 404) {
    const errorMessage =
      (workflowPayload as GitHubErrorPayload).message ??
      "Failed to read GitHub Actions workflow runs.";
    throw new Error(errorMessage);
  }

  // Fallback for repos where the workflow filename differs from deploy.yml.
  const allRunsUrl = new URL(`${GITHUB_API}/repos/${owner}/${repo}/actions/runs`);
  allRunsUrl.searchParams.set("event", "push");
  allRunsUrl.searchParams.set("branch", branch);
  allRunsUrl.searchParams.set("per_page", "50");

  const allRunsResponse = await fetch(allRunsUrl.toString(), {
    headers: githubHeaders(token)
  });
  const allRunsPayload = await allRunsResponse.json().catch(() => ({}));
  if (!allRunsResponse.ok) {
    const errorMessage =
      (allRunsPayload as GitHubErrorPayload).message ??
      "Failed to read GitHub Actions runs.";
    throw new Error(errorMessage);
  }

  const allRuns = Array.isArray((allRunsPayload as { workflow_runs?: unknown[] }).workflow_runs)
    ? ((allRunsPayload as { workflow_runs: GitHubWorkflowRun[] }).workflow_runs ?? [])
    : [];
  const workflowSuffix = `/${workflow}`.toLowerCase();

  const matchingRun = allRuns.find((run) => {
    const path = typeof run.path === "string" ? run.path.toLowerCase() : "";
    return path.endsWith(workflowSuffix);
  });

  return matchingRun ? [matchingRun] : allRuns;
};

const findWorkflowRunsByHeadSha = async (
  token: string,
  owner: string,
  repo: string,
  headSha: string,
  workflow: string
) => {
  const workflowRunsUrl = new URL(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs`
  );
  workflowRunsUrl.searchParams.set("event", "push");
  workflowRunsUrl.searchParams.set("head_sha", headSha);
  workflowRunsUrl.searchParams.set("per_page", "20");

  const workflowResponse = await fetch(workflowRunsUrl.toString(), {
    headers: githubHeaders(token)
  });
  const workflowPayload = await workflowResponse.json().catch(() => ({}));

  if (workflowResponse.ok) {
    const workflowRuns = Array.isArray((workflowPayload as { workflow_runs?: unknown[] }).workflow_runs)
      ? ((workflowPayload as { workflow_runs: GitHubWorkflowRun[] }).workflow_runs ?? [])
      : [];
    return workflowRuns;
  }

  if (workflowResponse.status !== 404) {
    const errorMessage =
      (workflowPayload as GitHubErrorPayload).message ??
      "Failed to read GitHub Actions workflow runs.";
    throw new Error(errorMessage);
  }

  const allRunsUrl = new URL(`${GITHUB_API}/repos/${owner}/${repo}/actions/runs`);
  allRunsUrl.searchParams.set("event", "push");
  allRunsUrl.searchParams.set("head_sha", headSha);
  allRunsUrl.searchParams.set("per_page", "50");

  const allRunsResponse = await fetch(allRunsUrl.toString(), {
    headers: githubHeaders(token)
  });
  const allRunsPayload = await allRunsResponse.json().catch(() => ({}));
  if (!allRunsResponse.ok) {
    const errorMessage =
      (allRunsPayload as GitHubErrorPayload).message ??
      "Failed to read GitHub Actions runs.";
    throw new Error(errorMessage);
  }

  const allRuns = Array.isArray((allRunsPayload as { workflow_runs?: unknown[] }).workflow_runs)
    ? ((allRunsPayload as { workflow_runs: GitHubWorkflowRun[] }).workflow_runs ?? [])
    : [];
  const workflowSuffix = `/${workflow}`.toLowerCase();

  const matchingRuns = allRuns.filter((run) => {
    const path = typeof run.path === "string" ? run.path.toLowerCase() : "";
    return path.endsWith(workflowSuffix);
  });

  return matchingRuns.length ? matchingRuns : allRuns;
};

const fetchPagesMetadata = async (token: string, owner: string, repo: string) => {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
    headers: githubHeaders(token)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return null;
  }
  return payload as { html_url?: string; status?: string };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const {
      token,
      supabase_access_token,
      owner,
      repo,
      headSha,
      branch,
      publishStartedAt,
      workflow = "deploy.yml"
    } = JSON.parse(event.body ?? "{}");

    const parsedHeadSha = typeof headSha === "string" ? headSha.trim() : "";
    const parsedBranch = typeof branch === "string" ? branch.trim() : "";
    const parsedPublishStartedAt = typeof publishStartedAt === "string" ? publishStartedAt.trim() : "";
    const directToken = typeof token === "string" ? token.trim() : "";
    const supabaseAccessToken =
      typeof supabase_access_token === "string" ? supabase_access_token.trim() : "";

    if (!owner || !repo || (!parsedHeadSha && (!parsedBranch || !parsedPublishStartedAt))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing parameters." })
      };
    }

    let requestToken = directToken;
    if (!requestToken && supabaseAccessToken && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser(supabaseAccessToken);
      if (userError || !user) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: "Invalid Supabase session." })
        };
      }
      const resolved = await resolveGitHubTokenForUser({
        supabase,
        userId: user.id,
        fallbackToken: directToken
      });
      requestToken = resolved?.token ?? "";
    }

    if (!requestToken) {
      return {
        statusCode: 412,
        body: JSON.stringify({
          error: "GitHub authorization missing. Connect your GitHub App from account menu, then retry."
        })
      };
    }

    const [runs, pages] = await Promise.all([
      parsedHeadSha
        ? findWorkflowRunsByHeadSha(requestToken, owner, repo, parsedHeadSha, workflow)
        : findWorkflowRunsByBranch(requestToken, owner, repo, parsedBranch, workflow),
      fetchPagesMetadata(requestToken, owner, repo)
    ]);

    const pagesUrl = pages?.html_url;
    const pagesStatus = pages?.status;

    let candidateRuns = runs
      .slice()
      .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));

    if (!parsedHeadSha) {
      const publishStartedAtMs = Date.parse(parsedPublishStartedAt);
      if (Number.isNaN(publishStartedAtMs)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid publishStartedAt value." })
        };
      }

      const sessionThresholdMs = publishStartedAtMs - SESSION_LOOKBACK_BUFFER_MS;
      candidateRuns = candidateRuns.filter((run) => {
        const createdAtMs = Date.parse(run.created_at ?? "");
        if (Number.isNaN(createdAtMs)) return false;
        return createdAtMs >= sessionThresholdMs;
      });
    }

    if (!candidateRuns.length) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phase: "pending",
          message: "Waiting for GitHub Actions to start deployment.",
          publishStartedAt: parsedPublishStartedAt || undefined,
          branch: parsedBranch || undefined,
          headSha: parsedHeadSha || undefined,
          pagesUrl,
          pagesStatus
        })
      };
    }

    const activeRun = candidateRuns.find((run) => (run.status ?? "queued") !== "completed");
    const run = activeRun ?? candidateRuns[0];
    const runStatus = run.status ?? "queued";
    const runConclusion = run.conclusion ?? null;

    if (runStatus !== "completed") {
      const phase = runStatus === "in_progress" ? "in_progress" : "queued";
      const message =
        phase === "in_progress"
          ? "GitHub Actions is building your site."
          : "GitHub Actions queued your deployment.";

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phase,
          message,
          publishStartedAt: parsedPublishStartedAt || undefined,
          branch: parsedBranch || undefined,
          headSha: parsedHeadSha || undefined,
          runId: run.id,
          runUrl: run.html_url,
          runStatus,
          runConclusion,
          pagesUrl,
          pagesStatus
        })
      };
    }

    if (runConclusion !== "success") {
      if (runConclusion === "cancelled") {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            phase: "queued",
            message: "Latest run was cancelled. Waiting for the next deployment run.",
            publishStartedAt: parsedPublishStartedAt || undefined,
            branch: parsedBranch || undefined,
            headSha: parsedHeadSha || undefined,
            runId: run.id,
            runUrl: run.html_url,
            runStatus,
            runConclusion,
            pagesUrl,
            pagesStatus
          })
        };
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phase: "failed",
          message: parseFailureMessage(runConclusion),
          publishStartedAt: parsedPublishStartedAt || undefined,
          branch: parsedBranch || undefined,
          headSha: parsedHeadSha || undefined,
          runId: run.id,
          runUrl: run.html_url,
          runStatus,
          runConclusion,
          pagesUrl,
          pagesStatus
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phase: "deployed",
        message: "GitHub Pages deployment completed.",
        publishStartedAt: parsedPublishStartedAt || undefined,
        branch: parsedBranch || undefined,
        headSha: parsedHeadSha || undefined,
        runId: run.id,
        runUrl: run.html_url,
        runStatus,
        runConclusion,
        pagesUrl,
        pagesStatus
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};
