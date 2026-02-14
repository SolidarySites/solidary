import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { getPublishPollDelayMs } from "../components/studio/site-builder/utils";
import { supabase } from "../lib/supabase";
import type { NoticeKind } from "../studio/types";
import templateSolidary from "../templates/astro/solidary-links.json?raw";
import tokensTemplate from "../templates/astro/tokens.css?raw";
import { type AstroPageDraft, type AstroSettings } from "../studio/astro";
import { githubRequest } from "../studio/github";
import { slugify } from "../studio/utils";

const FILE_KEYS = {
  solidary: "public/.well-known/solidary-links.json"
};
const SITE_DRAFT_IMAGES_BUCKET = "site-draft-images";
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

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizeSiteUrl = (value: string) => value.trim().replace(/\/+$/, "");

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
      lastErrorMessage =
        error instanceof Error ? error.message : "Branch has not propagated yet.";
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

export default function SiteCreatePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState("Preparing your site...");

  const [siteTitle, setSiteTitle] = useState("New Astro Site");
  const [siteDescription, setSiteDescription] = useState("Describe your site in a sentence or two.");
  const [siteUrl, setSiteUrl] = useState("");

  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);

  const [pages] = useState<AstroPageDraft[]>([
    {
      title: "Home",
      slug: "home",
      body: "",
      showInNav: false
    }
  ]);

  const [tokensCss] = useState(tokensTemplate);

  const computedSlug = useMemo(() => slugify(siteTitle), [siteTitle]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!siteImage) {
      setSiteImagePreview(null);
      return;
    }

    const url = URL.createObjectURL(siteImage);
    setSiteImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [siteImage]);

  const handleGitHubLogin = async () => {
    setNotice(null);
    setNoticeKind(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
        scopes: "repo delete_repo workflow"
      }
    });

    if (error) {
      setNotice(error.message);
      setNoticeKind("error");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const buildSettingsPayload = (imageUrl: string, urlOverride?: string): AstroSettings => ({
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

  const buildSolidaryFile = (siteId: string, imageUrl: string, urlOverride?: string) => {
    const settings = buildSettingsPayload(imageUrl, urlOverride);
    return templateSolidary
      .replaceAll("{{SITE_ID}}", siteId)
      .replaceAll("{{TITLE}}", settings.title)
      .replaceAll("{{DESCRIPTION}}", settings.description)
      .replaceAll("{{SITE_URL}}", settings.siteUrl)
      .replaceAll("{{IMAGE_URL}}", imageUrl);
  };

  const handleProvision = async () => {
    setNotice(null);
    setNoticeKind(null);

    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    const providerToken = (session as { provider_token?: string }).provider_token;
    if (!providerToken) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    const supabaseAccessToken = session.access_token?.trim();
    if (!supabaseAccessToken) {
      setNotice("Supabase session missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    if (!siteTitle.trim() || !siteDescription.trim()) {
      setNotice("Title and description are required.");
      setNoticeKind("error");
      return;
    }

    const normalizedTitle = siteTitle.trim();
    const slug = computedSlug || `site-${Date.now()}`;
    const imagePath = siteImage
      ? `${SOLIDARY_MEDIA_IMAGE_ROOT}/site-image-${slug}.jpg`
      : DEFAULT_OG_IMAGE_PATH;
    const imageUrl = siteImage ? `/${imagePath.replace(/^public\//, "")}` : DEFAULT_OG_IMAGE_URL;
    const siteId = crypto.randomUUID();

    setIsProvisioning(true);
    let stagedSiteImageStoragePath = "";
    let startedProvisioningJob = false;

    try {
      const publishStartedAt = new Date().toISOString();

      if (siteImage) {
        stagedSiteImageStoragePath = `${session.user.id}/create-site/${siteId}/site-image-${slug}.jpg`;
        setProvisionStep("Staging site image...");
        const { error: stageImageError } = await supabase.storage
          .from(SITE_DRAFT_IMAGES_BUCKET)
          .upload(stagedSiteImageStoragePath, siteImage, {
            upsert: true,
            contentType: siteImage.type || "image/jpeg"
          });

        if (stageImageError) {
          throw new Error(stageImageError.message);
        }
      }

      setProvisionStep("Queueing repository provisioning...");
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
        site_image_storage_path: stagedSiteImageStoragePath || undefined
      });

      const jobId = startResponse.job?.id?.trim() ?? "";
      if (!jobId) {
        throw new Error("Failed to start repository provisioning job.");
      }
      startedProvisioningJob = true;

      const repo = await waitForRepoProvisioningJob({
        jobId,
        supabaseAccessToken,
        onStep: setProvisionStep
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

      setSiteUrl(siteUrlResolved);
      await waitForBranchAvailability({
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        branch: defaultBranch,
        onStep: setProvisionStep
      });

      setProvisionStep("Enabling GitHub Pages...");
      await githubRequest("/.netlify/functions/github-enable-pages", {
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        branch: defaultBranch
      });

      const solidaryFile = buildSolidaryFile(siteId, imageUrl, siteUrlResolved);

      setProvisionStep("Waiting for GitHub Pages deployment...");
      await waitForInitialDeployment({
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        branch: defaultBranch,
        publishStartedAt,
        onStep: setProvisionStep
      });

      setProvisionStep("Saving site metadata...");
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
          owner_user_id: session.user.id,
          repo_full_name: repoFullName,
          branch: defaultBranch,
          commit_sha: "",
          files: {
            [FILE_KEYS.solidary]: solidaryFile
          }
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

      setProvisionStep("Opening your site builder...");
      navigate(`/site-builder?draftId=${siteId}`);
    } catch (caught) {
      if (!startedProvisioningJob && stagedSiteImageStoragePath) {
        await supabase.storage.from(SITE_DRAFT_IMAGES_BUCKET).remove([stagedSiteImageStoragePath]);
      }
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="app-shell">
      <SiteHeader
        session={session}
        showAuthActions
        onSignIn={handleGitHubLogin}
        onSignOut={handleLogout}
      />

      <main className="main-content">
        {isProvisioning ? (
          <section className="provisioning">
            <div className="spinner" />
            <h2>Setting up your site</h2>
            <p>{provisionStep}</p>
          </section>
        ) : (
          <section className="site-form">
            <div className="section-header">
              <h2>Create a site</h2>
              <p>Enter the main site metadata.</p>
            </div>
            <div className="form-grid">
              <label>
                Site title
                <input value={siteTitle} onChange={(event) => setSiteTitle(event.target.value)} />
              </label>
              <label>
                Description
                <textarea
                  value={siteDescription}
                  onChange={(event) => setSiteDescription(event.target.value)}
                  rows={4}
                />
              </label>
              <label>
                Site image (JPEG)
                <input
                  type="file"
                  accept="image/jpeg"
                  onChange={(event) => setSiteImage(event.target.files?.[0] ?? null)}
                />
              </label>
              {siteImagePreview && <img className="preview-image" src={siteImagePreview} alt="Preview" />}
            </div>
            <div className="form-actions">
              <button className="ghost" type="button" onClick={() => navigate("/studio")}>
                Back to Studio
              </button>
              <button className="primary" type="button" onClick={handleProvision} disabled={isProvisioning}>
                Create site
              </button>
            </div>
          </section>
        )}
      </main>

      <SiteFooter notice={notice} noticeKind={noticeKind} />
    </div>
  );
}
