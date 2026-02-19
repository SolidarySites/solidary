import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import type { AstroPageDraft, AstroSettings } from "../../../features/site-draft/types";
import { githubRequest } from "../../../services/github";
import { toBase64 } from "../../../lib/base64";

const FILE_KEYS = {
  solidary: "public/.well-known/solidary-links.json"
} as const;

const SOLIDARY_MEDIA_IMAGE_ROOT = "public/solidary-media/images";
const DEFAULT_OG_IMAGE_PATH = `${SOLIDARY_MEDIA_IMAGE_ROOT}/og/og-default.jpg`;
const DEFAULT_OG_IMAGE_URL = `/${DEFAULT_OG_IMAGE_PATH.replace(/^public\//, "")}`;
const BRANCH_READY_RETRY_DELAYS_MS = [0, 800, 1600, 3200, 6400, 10000];

type CreateRepoResponse = {
  repo?: {
    full_name?: string;
    name?: string;
    owner?: { login?: string };
    html_url?: string;
    default_branch?: string;
  };
};

type CreateRepoStartResponse = {
  job?: {
    id?: string;
    status?: string;
    step?: string;
  };
};

type CreateRepoStatusResponse = {
  job?: {
    id?: string;
    status?: string;
    step?: string;
    error?: string | null;
    repo?: CreateRepoResponse["repo"];
  };
};

type GitHubPublishStatusResponse = {
  phase: "pending" | "queued" | "in_progress" | "deployed" | "failed";
  message?: string;
  runUrl?: string;
  pagesUrl?: string;
};

type ProvisionSiteDraftParams = {
  session: Session;
  providerToken: string;
  supabaseAccessToken: string;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  computedSlug: string;
  siteImage: File | null;
  templateSolidary: string;
  tokensCss: string;
  pages: AstroPageDraft[];
  onStep: (value: string) => void;
  onSiteUrlResolved: (value: string) => void;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizeSiteUrl = (value: string) => value.trim().replace(/\/+$/, "");

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

async function waitForRepoProvisioningJob({
  jobId,
  supabaseAccessToken,
  onStep
}: {
  jobId: string;
  supabaseAccessToken: string;
  onStep: (value: string) => void;
}): Promise<CreateRepoResponse["repo"]> {
  let lastErrorMessage = "";

  for (let attempt = 0; attempt < 180; attempt += 1) {
    let statusPayload: CreateRepoStatusResponse | null = null;
    try {
      statusPayload = await githubRequest<CreateRepoStatusResponse>(
        "/.netlify/functions/github-create-repo-status",
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
}

async function waitForBranchAvailability({
  token,
  owner,
  repo,
  branch,
  onStep
}: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  onStep: (value: string) => void;
}) {
  let lastErrorMessage = "";

  for (let attempt = 0; attempt < BRANCH_READY_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = BRANCH_READY_RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      await sleep(delay);
    }

    onStep("Checking repository branch...");
    try {
      const branchPayload = await githubRequest<{ sha?: string }>("/.netlify/functions/github-branch", {
        token,
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
}

async function waitForInitialDeployment({
  token,
  owner,
  repo,
  branch,
  publishStartedAt,
  onStep
}: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  publishStartedAt: string;
  onStep: (value: string) => void;
}) {
  let lastRunUrl = "";

  for (let attempt = 0; ; attempt += 1) {
    let status: GitHubPublishStatusResponse | null = null;
    let requestError: unknown = null;

    try {
      status = await githubRequest<GitHubPublishStatusResponse>("/.netlify/functions/github-publish-status", {
        token,
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
}

const buildSettingsPayload = ({
  siteTitle,
  siteDescription,
  siteUrl,
  imageUrl,
  urlOverride
}: {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  imageUrl: string;
  urlOverride?: string;
}): AstroSettings => ({
  title: siteTitle.trim(),
  description: siteDescription.trim(),
  siteUrl: urlOverride || siteUrl,
  ogImage: imageUrl,
  header: {
    disabled: false,
    fixed: false,
    brandText: siteTitle.trim(),
    disableBrand: false
  },
  footer: {
    disabled: false,
    fixed: false,
    modules: [
      { content: "%copyright%", alignment: "left" },
      { content: "", alignment: "center" },
      { content: "", alignment: "right" }
    ]
  }
});

const buildSolidaryFile = ({
  templateSolidary,
  siteId,
  siteTitle,
  siteDescription,
  siteUrl,
  imageUrl,
  urlOverride
}: {
  templateSolidary: string;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  imageUrl: string;
  urlOverride?: string;
}) => {
  const settings = buildSettingsPayload({
    siteTitle,
    siteDescription,
    siteUrl,
    imageUrl,
    urlOverride
  });
  return templateSolidary
    .replaceAll("{{SITE_ID}}", siteId)
    .replaceAll("{{TITLE}}", settings.title)
    .replaceAll("{{DESCRIPTION}}", settings.description)
    .replaceAll("{{SITE_URL}}", settings.siteUrl)
    .replaceAll("{{IMAGE_URL}}", imageUrl);
};

export const provisionSiteDraft = async ({
  session,
  providerToken,
  supabaseAccessToken,
  siteId,
  siteTitle,
  siteDescription,
  siteUrl,
  computedSlug,
  siteImage,
  templateSolidary,
  tokensCss,
  pages,
  onStep,
  onSiteUrlResolved
}: ProvisionSiteDraftParams): Promise<string> => {
  const normalizedTitle = siteTitle.trim();
  const slug = computedSlug || `site-${Date.now()}`;
  const imagePath = siteImage
    ? `${SOLIDARY_MEDIA_IMAGE_ROOT}/site-image-${slug}.jpg`
    : DEFAULT_OG_IMAGE_PATH;
  const imageUrl = siteImage ? `/${imagePath.replace(/^public\//, "")}` : DEFAULT_OG_IMAGE_URL;
  const siteImageContentB64 = siteImage ? toBase64(await siteImage.arrayBuffer()) : undefined;
  const publishStartedAt = new Date().toISOString();

  onStep("Queueing repository provisioning...");
  const startResponse = await githubRequest<CreateRepoStartResponse>("/.netlify/functions/github-create-repo", {
    token: providerToken,
    name: slug,
    description: siteDescription.trim(),
    private: false,
    supabase_access_token: supabaseAccessToken,
    site_id: siteId,
    site_title: normalizedTitle,
    site_description: siteDescription.trim(),
    site_image_path: siteImage ? imagePath : undefined,
    site_image_content_b64: siteImageContentB64
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

  const pagesRootUrl = `https://${ownerLogin}.github.io`;
  const isUserSite = repoName.toLowerCase() === `${ownerLogin.toLowerCase()}.github.io`;
  const baseUrl = isUserSite ? "" : `/${repoName}`;
  const siteUrlResolved = normalizeSiteUrl(isUserSite ? pagesRootUrl : `${pagesRootUrl}${baseUrl}`);
  onSiteUrlResolved(siteUrlResolved);

  await waitForBranchAvailability({
    token: providerToken,
    owner: ownerLogin,
    repo: repoName,
    branch: defaultBranch,
    onStep
  });

  onStep("Enabling GitHub Pages...");
  await githubRequest("/.netlify/functions/github-enable-pages", {
    token: providerToken,
    owner: ownerLogin,
    repo: repoName,
    branch: defaultBranch
  });

  const solidaryFile = buildSolidaryFile({
    templateSolidary,
    siteId,
    siteTitle,
    siteDescription,
    siteUrl,
    imageUrl,
    urlOverride: siteUrlResolved
  });

  onStep("Waiting for GitHub Pages deployment...");
  await waitForInitialDeployment({
    token: providerToken,
    owner: ownerLogin,
    repo: repoName,
    branch: defaultBranch,
    publishStartedAt,
    onStep
  });

  onStep("Saving site metadata...");
  const { error: siteError } = await supabase.from("sites").insert({
    id: siteId,
    canonical_url: siteUrlResolved,
    title: normalizedTitle,
    description: siteDescription.trim(),
    image_url: imageUrl,
    meta: {
      completion: "complete",
      source: "studio"
    }
  });
  if (siteError) {
    throw new Error(siteError.message);
  }

  const { error: draftError } = await supabase.from("site_drafts").upsert(
    {
      id: siteId,
      site_id: siteId,
      owner_user_id: session.user.id,
      repo_full_name: repoFullName,
      branch: defaultBranch,
      commit_sha: "",
      files: {
        [FILE_KEYS.solidary]: solidaryFile
      },
      draft_type: "owner",
      source_owner_draft_id: null,
      touched_sections: [],
      touched_page_slugs: [],
      deleted_page_slugs: []
    },
    { onConflict: "owner_user_id,repo_full_name" }
  );

  if (draftError) {
    throw new Error(draftError.message);
  }

  const { error: settingsError } = await supabase.from("site_draft_settings").upsert({
    draft_id: siteId,
    settings: {
      title: siteTitle.trim(),
      description: siteDescription.trim(),
      siteUrl: siteUrlResolved,
      header: {
        disabled: false,
        fixed: false,
        brandText: siteTitle.trim(),
        disableBrand: false
      },
      footer: {
        disabled: false,
        fixed: false,
        modules: [
          { content: "%copyright%", alignment: "left" },
          { content: "", alignment: "center" },
          { content: "", alignment: "right" }
        ]
      }
    },
    styles: {
      tokensCss
    }
  });

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const { error: pagesError } = await supabase.from("site_draft_pages").insert(
    pages.map((page, index) => ({
      draft_id: siteId,
      slug: page.slug,
      title: page.title,
      content: page.body,
      show_in_nav: page.showInNav,
      position: index,
      is_home: page.slug === "home"
    }))
  );

  if (pagesError) {
    throw new Error(pagesError.message);
  }

  return siteId;
};
