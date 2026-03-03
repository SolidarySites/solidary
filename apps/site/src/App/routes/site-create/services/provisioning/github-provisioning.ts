import { githubRequest } from "../../../../services/github";
import { resolveSiteUrlFromRepo } from "./content";
import type {
  CreateRepoResponse,
  CreateRepoStartResponse,
  CreateRepoStatusResponse,
  GitHubPublishStatusResponse,
  ProvisionedRepository
} from "./types";

const BRANCH_READY_RETRY_DELAYS_MS = [0, 800, 1600, 3200, 6400, 10000];

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const getPublishPollDelayMs = (attempt: number) => {
  if (attempt < 3) return 15000;
  if (attempt < 15) return 5000;
  if (attempt < 35) return 12000;
  if (attempt < 50) return 20000;
  return null;
};

const getPublishStep = (status: GitHubPublishStatusResponse) => {
  if (status.phase === "in_progress") {
    return "GitHub Actions is building your site...";
  }
  if (status.phase === "queued") {
    return "GitHub Actions queued your deployment...";
  }
  if (status.phase === "pending") {
    return "Waiting for GitHub Actions to start deployment...";
  }
  return status.message?.trim() || "Checking GitHub Pages deployment...";
};

const waitForRepoProvisioningJob = async ({
  jobId,
  supabaseAccessToken,
  onStep
}: {
  jobId: string;
  supabaseAccessToken: string;
  onStep: (value: string) => void;
}): Promise<CreateRepoResponse["repo"]> => {
  let lastErrorMessage = "";

  for (let attempt = 0; attempt < 180; attempt += 1) {
    let statusPayload: CreateRepoStatusResponse | null = null;
    try {
      statusPayload = await githubRequest<CreateRepoStatusResponse>(
        "github-create-repo-status",
        {
          job_id: jobId,
          supabase_access_token: supabaseAccessToken
        }
      );
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : "Failed to read provisioning status.";
      onStep("Checking repository provisioning status...");
      const delay = attempt < 6 ? 1000 : attempt < 30 ? 2000 : 4000;
      await sleep(delay);
      continue;
    }

    const job = statusPayload.job;
    if (!job) {
      lastErrorMessage = "Missing job status payload.";
    } else {
      const step = job.step?.trim();
      if (step) {
        onStep(step);
      }

      const status = job.status?.trim();
      if (status === "succeeded") {
        if (job.repo) return job.repo;
        throw new Error("Repository provisioning completed without repo payload.");
      }

      if (status === "failed") {
        throw new Error(job.error?.trim() || "Repository provisioning failed.");
      }
    }

    const delay = attempt < 6 ? 1000 : attempt < 30 ? 2000 : 4000;
    await sleep(delay);
  }

  throw new Error(
    `Timed out while waiting for repository provisioning to finish${lastErrorMessage ? `: ${lastErrorMessage}` : "."}`
  );
};

const waitForBranchAvailability = async ({
  supabaseAccessToken,
  owner,
  repo,
  branch,
  onStep
}: {
  supabaseAccessToken: string;
  owner: string;
  repo: string;
  branch: string;
  onStep: (value: string) => void;
}) => {
  let lastErrorMessage = "";

  for (let attempt = 0; attempt < BRANCH_READY_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = BRANCH_READY_RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      await sleep(delay);
    }

    onStep("Checking repository branch...");
    try {
      const branchPayload = await githubRequest<{ sha?: string }>("github-branch", {
        supabase_access_token: supabaseAccessToken,
        owner,
        repo,
        branch
      });
      if (typeof branchPayload?.sha === "string" && branchPayload.sha.length > 0) {
        return branchPayload.sha;
      }
      lastErrorMessage = "Branch did not return a commit SHA yet.";
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : "Branch has not propagated yet.";
    }
  }

  throw new Error(`Repository branch is not ready yet: ${lastErrorMessage || "unknown error"}`);
};

const waitForInitialDeployment = async ({
  supabaseAccessToken,
  owner,
  repo,
  branch,
  publishStartedAt,
  onStep
}: {
  supabaseAccessToken: string;
  owner: string;
  repo: string;
  branch: string;
  publishStartedAt: string;
  onStep: (value: string) => void;
}) => {
  let lastRunUrl = "";

  for (let attempt = 0; ; attempt += 1) {
    let status: GitHubPublishStatusResponse | null = null;
    let requestError: unknown = null;

    try {
      status = await githubRequest<GitHubPublishStatusResponse>("github-publish-status", {
        supabase_access_token: supabaseAccessToken,
        owner,
        repo,
        branch,
        publishStartedAt,
        workflow: "deploy.yml"
      });
    } catch (error) {
      requestError = error;
    }

    if (status) {
      if (status.runUrl?.trim()) {
        lastRunUrl = status.runUrl.trim();
      }

      if (status.phase === "failed") {
        const failedMessage =
          status.message?.trim() ||
          "GitHub Actions deployment failed. Open GitHub Actions and inspect deploy.yml.";
        throw new Error(failedMessage);
      }

      if (status.phase === "deployed") {
        return status;
      }

      onStep(getPublishStep(status));
    }

    const delay = getPublishPollDelayMs(attempt + 1);
    if (delay === null) {
      if (requestError instanceof Error) {
        throw new Error(
          `${requestError.message} Open GitHub Actions to confirm deployment${lastRunUrl ? `: ${lastRunUrl}` : "."}`
        );
      }
      throw new Error(
        `Could not confirm deployment completion yet. Open GitHub Actions${lastRunUrl ? `: ${lastRunUrl}` : "."}`
      );
    }

    if (!status && requestError instanceof Error) {
      onStep("Retrying deployment status check...");
    }

    await sleep(delay);
  }
};

export const provisionGitHubRepository = async ({
  supabaseAccessToken,
  siteId,
  siteTitle,
  siteDescription,
  slug,
  siteImagePath,
  siteImageContentB64,
  siteImageThumbPath,
  siteImageThumbContentB64,
  ogImagePath,
  ogImageContentB64,
  onStep
}: {
  supabaseAccessToken: string;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  slug: string;
  siteImagePath?: string;
  siteImageContentB64?: string;
  siteImageThumbPath?: string;
  siteImageThumbContentB64?: string;
  ogImagePath?: string;
  ogImageContentB64?: string;
  onStep: (value: string) => void;
}): Promise<ProvisionedRepository> => {
  onStep("Queueing repository provisioning...");
  const startResponse = await githubRequest<CreateRepoStartResponse>("github-create-repo", {
    name: slug,
    description: siteDescription.trim(),
    private: false,
    supabase_access_token: supabaseAccessToken,
    site_id: siteId,
    site_title: siteTitle.trim(),
    site_description: siteDescription.trim(),
    site_image_path: siteImagePath,
    site_image_content_b64: siteImageContentB64,
    site_image_thumb_path: siteImageThumbPath,
    site_image_thumb_content_b64: siteImageThumbContentB64,
    og_image_path: ogImagePath,
    og_image_content_b64: ogImageContentB64
  });

  const jobId = startResponse.job?.id?.trim() ?? "";
  if (!jobId) {
    throw new Error("Failed to start repository provisioning job.");
  }

  const repo = await waitForRepoProvisioningJob({
    jobId,
    supabaseAccessToken,
    onStep
  });

  const ownerLogin = repo?.owner?.login?.trim() ?? "";
  const repoName = repo?.name?.trim() ?? "";
  const defaultBranch = repo?.default_branch?.trim() ?? "";
  const repoFullName = repo?.full_name?.trim() ?? "";

  if (!ownerLogin || !repoName || !defaultBranch || !repoFullName) {
    throw new Error("GitHub returned an incomplete repository payload.");
  }

  const siteUrlResolved = resolveSiteUrlFromRepo({ ownerLogin, repoName });

  await waitForBranchAvailability({
    supabaseAccessToken,
    owner: ownerLogin,
    repo: repoName,
    branch: defaultBranch,
    onStep
  });

  onStep("Enabling GitHub Pages...");
  await githubRequest("github-enable-pages", {
    supabase_access_token: supabaseAccessToken,
    owner: ownerLogin,
    repo: repoName,
    branch: defaultBranch
  });

  onStep("Waiting for GitHub Pages deployment...");
  await waitForInitialDeployment({
    supabaseAccessToken,
    owner: ownerLogin,
    repo: repoName,
    branch: defaultBranch,
    publishStartedAt: new Date().toISOString(),
    onStep
  });

  return {
    ownerLogin,
    repoName,
    defaultBranch,
    repoFullName,
    siteUrlResolved
  };
};
