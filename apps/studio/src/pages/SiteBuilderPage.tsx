import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import AstroTemplatePreview, { type AstroTemplatePreviewHandle } from "../components/studio/AstroTemplatePreview";
import type { NoticeKind, RepoFileSet } from "../studio/types";
import templateSolidary from "../templates/astro/solidary-links.json?raw";
import homeTemplate from "../../../../templates/astro-baseline/src/content/pages/home.md?raw";
import headerTemplate from "../../../../templates/astro-baseline/src/components/Header.astro?raw";
import indexTemplate from "../../../../templates/astro-baseline/src/pages/index.astro?raw";
import tokensTemplate from "../templates/astro/tokens.css?raw";
import { buildPageMarkdown, buildSiteTs, type AstroPageDraft } from "../studio/astro";
import { deleteTextFile, githubRequest, listDirectory, writeTextFile } from "../studio/github";
import { parseSolidaryJson, slugify, toBase64 } from "../studio/utils";

const FILE_KEYS = {
  site: "src/content/site.ts",
  tokens: "src/styles/partials/tokens.css",
  header: "src/components/Header.astro",
  index: "src/pages/index.astro",
  solidary: "public/.well-known/solidary-links.json"
};

const PAGE_PATH_PREFIX = "src/content/pages/";
const PAGE_PATH_SUFFIX = ".md";

const resolveImagePreviewUrl = (imageUrl: string, canonicalUrl: string) => {
  const trimmedImageUrl = imageUrl.trim();
  if (!trimmedImageUrl) return imageUrl;

  const lower = trimmedImageUrl.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    trimmedImageUrl.startsWith("//")
  ) {
    return imageUrl;
  }

  const base = canonicalUrl.trim().replace(/\/$/, "");
  if (!base) return imageUrl;
  if (trimmedImageUrl.startsWith("/")) {
    return `${base}${trimmedImageUrl}`;
  }

  return `${base}/${trimmedImageUrl}`;
};

type BuilderPage = AstroPageDraft & {
  id?: string;
  position?: number | null;
  isHome?: boolean;
};

const normalizePageSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "");

const getPageSafeSlug = (page: BuilderPage, index: number) =>
  page.isHome ? "home" : normalizePageSlug(page.slug || page.title) || `page-${index + 1}`;

const makeUniquePageSlug = (value: string, pages: BuilderPage[], currentIndex?: number) => {
  const base = normalizePageSlug(value) || "page";
  const existing = new Set(
    pages.flatMap((page, index) => {
      if (index === currentIndex) return [];
      return [getPageSafeSlug(page, index)];
    })
  );
  if (!existing.has(base)) return base;

  let suffix = 1;
  let candidate = `${base}_${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  return candidate;
};

const stripFrontmatter = (content: string) => {
  const match = content.match(/^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*[\r\n]*([\s\S]*)$/);
  if (!match) return content.trim();
  return (match[2] ?? "").trim();
};

const defaultHomeContent = stripFrontmatter(homeTemplate);

type BuilderSection = "content" | "pages" | "styles" | "settings";

type DraftState = {
  id: string;
  repoFullName: string;
  branch: string;
  files: RepoFileSet;
};

type GitHubPublishPhase = "pending" | "queued" | "in_progress" | "deployed" | "failed";

type GitHubPublishStatusResponse = {
  phase: GitHubPublishPhase;
  message?: string;
  runUrl?: string;
  pagesUrl?: string;
  runStatus?: string;
  runConclusion?: string | null;
};

type PublishFeedback = {
  kind: "progress" | "success" | "error";
  text: string;
  runUrl?: string;
  pagesUrl?: string;
};

const getPublishPollDelayMs = (attempt: number) => {
  // Start slow, then accelerate, then slow down again for long-running deploys.
  if (attempt < 3) return 15000;
  if (attempt < 15) return 5000;
  if (attempt < 35) return 12000;
  if (attempt < 50) return 20000;
  return null;
};

export default function SiteBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [activeSection, setActiveSection] = useState<BuilderSection>("content");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState("Preparing your updates...");
  const [sessionResolved, setSessionResolved] = useState(false);

  const [siteTitle, setSiteTitle] = useState("New Astro Site");
  const [siteDescription, setSiteDescription] = useState("Describe your site in a sentence or two.");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteLocale, setSiteLocale] = useState("en");

  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [authorUrl, setAuthorUrl] = useState("");

  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);

  const [pages, setPages] = useState<BuilderPage[]>([]);
  const [draftPageSlugs, setDraftPageSlugs] = useState<string[]>([]);
  const [activePreviewSlug, setActivePreviewSlug] = useState("home");
  const [previewBrand, setPreviewBrand] = useState("New Astro Site");

  const [tokensCss, setTokensCss] = useState(tokensTemplate);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [isDraftLoading, setIsDraftLoading] = useState(() => {
    const initialDraftId =
      searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId;
    return Boolean(initialDraftId);
  });
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<PublishFeedback | null>(null);

  const pageTitleRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<AstroTemplatePreviewHandle | null>(null);
  const hasInitializedPreviewBrand = useRef(false);
  const publishPollTimeoutRef = useRef<number | null>(null);
  const publishPollTokenRef = useRef(0);

  const draftId = useMemo(
    () => searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId ?? null,
    [location.state, searchParams]
  );
  const computedSlug = useMemo(() => slugify(siteTitle), [siteTitle]);
  const shouldLoadDraft = Boolean(draftId);

  const clearPublishPollTimeout = () => {
    if (publishPollTimeoutRef.current === null) return;
    window.clearTimeout(publishPollTimeoutRef.current);
    publishPollTimeoutRef.current = null;
  };

  useEffect(
    () => () => {
      publishPollTokenRef.current += 1;
      if (publishPollTimeoutRef.current !== null) {
        window.clearTimeout(publishPollTimeoutRef.current);
        publishPollTimeoutRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setSessionResolved(true);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setSessionResolved(true);
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

  useEffect(() => {
    if (!draftId) {
      setIsDraftLoading(false);
      setDraftLoadError(null);
      return;
    }

    if (!sessionResolved) {
      setIsDraftLoading(true);
      setDraftLoadError(null);
      return;
    }

    if (!session) {
      setIsDraftLoading(false);
      setDraftLoadError("Sign in to load this draft.");
      return;
    }

    let mounted = true;
    setIsDraftLoading(true);
    setDraftLoadError(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("site_drafts")
          .select("id, repo_full_name, branch, files")
          .eq("id", draftId)
          .maybeSingle();

        if (!mounted) return;
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Draft not found.");

        const files = data.files as RepoFileSet;
        const solidaryRaw = files[FILE_KEYS.solidary] ?? files[".well-known/solidary-links.json"] ?? "";
        const solidary = parseSolidaryJson(solidaryRaw);

        setDraftState({
          id: data.id,
          repoFullName: data.repo_full_name,
          branch: data.branch,
          files
        });

        const [{ data: pagesData }, { data: settingsData }] = await Promise.all([
          supabase
            .from("site_draft_pages")
            .select("id, slug, title, content, show_in_nav, position, is_home")
            .eq("draft_id", data.id)
            .order("position", { ascending: true }),
          supabase
            .from("site_draft_settings")
            .select("settings, styles")
            .eq("draft_id", data.id)
            .maybeSingle()
        ]);

        const draftPages = (pagesData ?? []).map((page) => ({
          id: page.id,
          slug: page.slug,
          title: page.title,
          body: page.is_home && !page.content?.trim() ? defaultHomeContent : page.content ?? "",
          showInNav: page.show_in_nav ?? true,
          position: page.position,
          isHome: page.is_home ?? false
        }));
        setPages(draftPages);
        setDraftPageSlugs(draftPages.map((page) => page.slug));
        const initialPage = draftPages.find((page) => page.isHome) ?? draftPages[0];
        if (initialPage) {
          const initialIndex = draftPages.indexOf(initialPage);
          setActivePreviewSlug(getPageSafeSlug(initialPage, initialIndex));
        }

        const settings = (settingsData?.settings as Record<string, unknown>) ?? {};
        const styles = (settingsData?.styles as Record<string, unknown>) ?? {};

        const initialSiteTitle =
          typeof settings.title === "string" ? settings.title : (solidary?.title ?? "");
        if (initialSiteTitle) {
          setSiteTitle(initialSiteTitle);
        }
        if (!hasInitializedPreviewBrand.current) {
          const resolvedBrand = initialSiteTitle.trim() || "New Astro Site";
          setPreviewBrand(resolvedBrand);
          hasInitializedPreviewBrand.current = true;
        }

        if (typeof settings.description === "string") setSiteDescription(settings.description);
        else if (solidary?.description) setSiteDescription(solidary.description);

        if (typeof settings.siteUrl === "string") setSiteUrl(settings.siteUrl);
        else if (solidary?.site_url) setSiteUrl(solidary.site_url);

        if (typeof settings.locale === "string") setSiteLocale(settings.locale);

        const author = settings.author as Record<string, unknown> | undefined;
        if (author?.name && typeof author.name === "string") setAuthorName(author.name);
        if (author?.email && typeof author.email === "string") setAuthorEmail(author.email);
        if (author?.url && typeof author.url === "string") setAuthorUrl(author.url);

        if (typeof styles.tokensCss === "string") setTokensCss(styles.tokensCss);

        if (solidary?.image_url) {
          const canonicalUrl = solidary.site_url ?? "";
          const resolvedImageUrl = resolveImagePreviewUrl(solidary.image_url, canonicalUrl);
          setSiteImagePreview(resolvedImageUrl);
          setDraftImageUrl(solidary.image_url);
        }
      } catch (caught) {
        if (!mounted) return;
        const message = caught instanceof Error ? caught.message : "Failed to load draft.";
        setDraftLoadError(message);
      } finally {
        if (mounted) {
          setIsDraftLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [draftId, session, sessionResolved]);

  const handleGitHubLogin = async () => {
    setNotice(null);
    setNoticeKind(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
        scopes: "repo delete_repo"
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

  const resetNotices = () => {
    setNotice(null);
    setNoticeKind(null);
  };

  const startPublishStatusTracking = ({
    token,
    owner,
    repo,
    branch,
    publishStartedAt
  }: {
    token: string;
    owner: string;
    repo: string;
    branch: string;
    publishStartedAt: string;
  }) => {
    publishPollTokenRef.current += 1;
    const pollToken = publishPollTokenRef.current;
    clearPublishPollTimeout();

    const actionsUrl = `https://github.com/${owner}/${repo}/actions/workflows/deploy.yml`;
    setPublishFeedback({
      kind: "progress",
      text: "GitHub is building your page.",
      runUrl: actionsUrl
    });
    let latestRunUrl: string | undefined;
    let latestPagesUrl: string | undefined;

    const poll = async (attempt: number) => {
      if (publishPollTokenRef.current !== pollToken) return;

      let status: GitHubPublishStatusResponse;
      try {
        status = await githubRequest<GitHubPublishStatusResponse>(
          "/.netlify/functions/github-publish-status",
          {
            token,
            owner,
            repo,
            branch,
            publishStartedAt,
            workflow: "deploy.yml"
          }
        );
      } catch (error) {
        if (publishPollTokenRef.current !== pollToken) return;
        const delay = getPublishPollDelayMs(attempt + 1);
        if (delay === null) {
          const fallbackMessage =
            error instanceof Error
              ? `${error.message} Open GitHub Actions to confirm deployment.`
              : "Unable to confirm deployment status. Open GitHub Actions for details.";
          setPublishFeedback({
            kind: "error",
            text: fallbackMessage,
            runUrl: latestRunUrl ?? actionsUrl,
            pagesUrl: latestPagesUrl
          });
          setNotice(fallbackMessage);
          setNoticeKind("error");
          clearPublishPollTimeout();
          return;
        }
        publishPollTimeoutRef.current = window.setTimeout(() => {
          void poll(attempt + 1);
        }, delay);
        return;
      }

      if (publishPollTokenRef.current !== pollToken) return;

      const runUrl = status.runUrl?.trim() || undefined;
      const pagesUrl = status.pagesUrl?.trim() || undefined;
      if (runUrl) latestRunUrl = runUrl;
      if (pagesUrl) latestPagesUrl = pagesUrl;

      if (status.phase === "failed") {
        const message = status.message?.trim() || "GitHub Actions deployment failed.";
        setPublishFeedback({
          kind: "error",
          text: message,
          runUrl: latestRunUrl ?? actionsUrl,
          pagesUrl: latestPagesUrl
        });
        setNotice(message);
        setNoticeKind("error");
        clearPublishPollTimeout();
        return;
      }

      if (status.phase === "deployed") {
        const message = "Site is live.";
        setPublishFeedback({
          kind: "success",
          text: message,
          runUrl: latestRunUrl ?? actionsUrl,
          pagesUrl: latestPagesUrl
        });
        setNotice(message);
        setNoticeKind("notice");
        clearPublishPollTimeout();
        return;
      }

      setPublishFeedback({
        kind: "progress",
        text: "GitHub is building your page.",
        runUrl: actionsUrl,
        pagesUrl: latestPagesUrl
      });

      const delay = getPublishPollDelayMs(attempt + 1);
      if (delay === null) {
        const timeoutMessage = "Could not confirm deployment completion yet. Open GitHub Actions.";
        setPublishFeedback({
          kind: "error",
          text: timeoutMessage,
          runUrl: latestRunUrl ?? actionsUrl,
          pagesUrl: latestPagesUrl
        });
        setNotice(timeoutMessage);
        setNoticeKind("error");
        clearPublishPollTimeout();
        return;
      }

      publishPollTimeoutRef.current = window.setTimeout(() => {
        void poll(attempt + 1);
      }, delay);
    };

    void poll(0);
  };

  const addPage = () => {
    const slug = makeUniquePageSlug("new-page", pages);
    setPages((items) => [
      ...items,
      {
        id: `new-${crypto.randomUUID()}`,
        title: "New page",
        slug,
        body: "<p>Write your page content here.</p>",
        showInNav: true,
        position: items.length
      }
    ]);
    setActivePreviewSlug(slug);
    setActiveSection("pages");
    requestAnimationFrame(() => pageTitleRef.current?.focus());
  };

  const updatePage = (index: number, updates: Partial<BuilderPage>) => {
    const existing = pages[index];
    if (existing && !existing.isHome) {
      const previousSlug = getPageSafeSlug(existing, index);
      const nextSlug = getPageSafeSlug({ ...existing, ...updates }, index);
      if (previousSlug !== nextSlug && activePreviewSlug === previousSlug) {
        setActivePreviewSlug(nextSlug);
      }
    }
    setPages((items) => items.map((item, idx) => (idx === index ? { ...item, ...updates } : item)));
  };

  const removePage = (index: number) => {
    const page = pages[index];
    if (!page || page.isHome) return;

    const removedSlug = getPageSafeSlug(page, index);
    setPages((items) => items.filter((_, idx) => idx !== index || items[idx]?.isHome));
    if (activePreviewSlug === removedSlug) {
      setActivePreviewSlug("home");
    }
  };

  const updatePageBody = (safeSlug: string, body: string) => {
    setPages((items) =>
      items.map((item, index) =>
        getPageSafeSlug(item, index) === safeSlug ? { ...item, body } : item
      )
    );
  };

  const buildSettingsPayload = (imageUrl: string, urlOverride?: string) => ({
    title: siteTitle.trim(),
    tagline: siteTitle.trim(),
    description: siteDescription.trim(),
    siteUrl: (urlOverride ?? siteUrl).trim(),
    locale: siteLocale.trim() || "en",
    author: {
      name: authorName.trim() || "",
      email: authorEmail.trim() || "",
      url: authorUrl.trim() || ""
    },
    ogImage: imageUrl
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

  const buildFiles = (siteId: string, imageUrl: string, urlOverride?: string) => {
    const settings = buildSettingsPayload(imageUrl, urlOverride);
    const files: RepoFileSet = {
      [FILE_KEYS.site]: buildSiteTs(settings),
      [FILE_KEYS.tokens]: tokensCss,
      [FILE_KEYS.header]: headerTemplate,
      [FILE_KEYS.index]: indexTemplate,
      [FILE_KEYS.solidary]: buildSolidaryFile(siteId, imageUrl, urlOverride)
    };

    pages.forEach((page, index) => {
      const safeSlug = getPageSafeSlug(page, index);
      const body = page.isHome && !page.body?.trim() ? defaultHomeContent : page.body ?? "";
      files[`src/content/pages/${safeSlug}.md`] = buildPageMarkdown({
        ...page,
        slug: safeSlug,
        body
      });
    });

    return files;
  };

  const saveDraftState = async (repoInfo: DraftState, solidaryFile: string, imageUrl: string) => {
    const { error } = await supabase.from("site_drafts").upsert(
      {
        id: repoInfo.id,
        owner_user_id: session?.user.id,
        repo_full_name: repoInfo.repoFullName,
        branch: repoInfo.branch,
        commit_sha: "",
        files: {
          [FILE_KEYS.solidary]: solidaryFile
        }
      },
      { onConflict: "owner_user_id,repo_full_name" }
    );

    if (error) {
      throw new Error(error.message);
    }

    const { error: settingsError } = await supabase.from("site_draft_settings").upsert({
      draft_id: repoInfo.id,
      settings: buildSettingsPayload(imageUrl),
      styles: {
        tokensCss
      }
    });

    if (settingsError) {
      throw new Error(settingsError.message);
    }

    const pageRows = pages.map((page, index) => ({
      draft_id: repoInfo.id,
      slug: getPageSafeSlug(page, index),
      title: page.title.trim() || page.slug || `Page ${index + 1}`,
      content: page.body ?? "",
      show_in_nav: page.showInNav ?? true,
      position: index,
      is_home: Boolean(page.isHome)
    }));
    const currentSlugs = pageRows.map((page) => page.slug);
    const deletedSlugs = draftPageSlugs.filter((slug) => !currentSlugs.includes(slug));

    if (deletedSlugs.length) {
      const { error: deleteError } = await supabase
        .from("site_draft_pages")
        .delete()
        .eq("draft_id", repoInfo.id)
        .in("slug", deletedSlugs);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    const { error: pagesError } = await supabase
      .from("site_draft_pages")
      .upsert(pageRows, { onConflict: "draft_id,slug" });

    if (pagesError) {
      throw new Error(pagesError.message);
    }

    setDraftPageSlugs(pageRows.map((page) => page.slug));
  };

  const handlePublish = async () => {
    resetNotices();
    setPublishFeedback(null);
    publishPollTokenRef.current += 1;
    clearPublishPollTimeout();

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

    if (!siteTitle.trim() || !siteDescription.trim()) {
      setNotice("Title and description are required.");
      setNoticeKind("error");
      return;
    }

    setIsProvisioning(true);
    const publishStartedAt = new Date().toISOString();

    try {
      if (!draftState) {
        throw new Error("Missing site draft. Create a site first.");
      }

      const normalizedTitle = siteTitle.trim();
      const [ownerLogin, repoName] = draftState.repoFullName.split("/");
      if (!ownerLogin || !repoName) {
        throw new Error("Invalid repository name.");
      }

      const slug = computedSlug || `site-${Date.now()}`;
      const imagePath = siteImage ? `public/images/site-image-${slug}.jpg` : "public/images/og/og-default.jpg";
      const imageUrl = siteImage
        ? `/${imagePath.replace(/^public\//, "")}`
        : draftImageUrl || siteImagePreview || "/images/og/og-default.jpg";
      const solidaryFile = buildSolidaryFile(draftState.id, imageUrl, siteUrl);

      setProvisionStep("Saving draft...");
      await saveDraftState(draftState, solidaryFile, imageUrl);
      setDraftState({
        ...draftState,
        files: {
          [FILE_KEYS.solidary]: solidaryFile
        }
      });

      if (siteImage) {
        setProvisionStep("Uploading site image...");
        const imageBase64 = toBase64(await siteImage.arrayBuffer());
        await githubRequest("/.netlify/functions/github-contents-write", {
          token: providerToken,
          owner: ownerLogin,
          repo: repoName,
          path: imagePath,
          message: "Update site image",
          content: imageBase64,
          branch: draftState.branch
        });
      }

      const files = buildFiles(draftState.id, imageUrl, siteUrl);

      setProvisionStep("Removing deleted pages...");
      const repoEntries = await listDirectory(
        providerToken,
        ownerLogin,
        repoName,
        PAGE_PATH_PREFIX.replace(/\/$/, ""),
        draftState.branch
      ).catch(() => []);
      const desiredPagePaths = new Set(
        pages.map((page, index) => {
          const safeSlug = getPageSafeSlug(page, index);
          return `${PAGE_PATH_PREFIX}${safeSlug}${PAGE_PATH_SUFFIX}`;
        })
      );
      for (const entry of repoEntries) {
        if (entry.type !== "file" || !entry.path?.endsWith(PAGE_PATH_SUFFIX)) continue;
        if (!desiredPagePaths.has(entry.path)) {
          await deleteTextFile(providerToken, ownerLogin, repoName, entry.path, draftState.branch);
        }
      }

      setProvisionStep("Publishing content files...");
      for (const [path, content] of Object.entries(files)) {
        await writeTextFile(providerToken, ownerLogin, repoName, path, content, draftState.branch);
      }

      setProvisionStep("Updating site metadata...");
      await supabase.from("sites").upsert({
        id: draftState.id,
        canonical_url: siteUrl.trim(),
        title: normalizedTitle,
        description: siteDescription.trim(),
        image_url: imageUrl,
        meta: {
          completion: "complete",
          source: "studio"
        }
      });

      setDraftImageUrl(imageUrl);
      setProvisionStep("Starting deployment status checks...");
      startPublishStatusTracking({
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        branch: draftState.branch,
        publishStartedAt
      });
      setNotice(null);
      setNoticeKind(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draftState || savingDraft) return;
    setSavingDraft(true);
    try {
      const imageUrl = siteImage ? draftImageUrl || "/images/og/og-default.jpg" : siteImagePreview || draftImageUrl || "/images/og/og-default.jpg";
      const solidaryFile = buildSolidaryFile(draftState.id, imageUrl, siteUrl);
      await saveDraftState(draftState, solidaryFile, imageUrl);
      setDraftState({
        ...draftState,
        files: {
          [FILE_KEYS.solidary]: solidaryFile
        }
      });
      setNotice("Draft saved locally.");
      setNoticeKind("notice");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setSavingDraft(false);
    }
  };

  const runPreviewCommand = (
    event: MouseEvent<HTMLButtonElement>,
    command: string,
    value?: string
  ) => {
    event.preventDefault();
    previewRef.current?.execCommand(command, value);
  };

  const runPreviewLink = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const url = window.prompt("Link URL");
    if (!url) return;
    previewRef.current?.execCommand("createLink", url);
  };

  return (
    <div className="app-shell builder-shell">
      <SiteHeader
        session={session}
        showAuthActions
        onSignIn={handleGitHubLogin}
        onSignOut={handleLogout}
      />

      <div className="builder-topbar">
        <div className="builder-topbar-main">
          <h1>Site Builder</h1>
          <p>Live Astro template preview</p>
          {!(shouldLoadDraft && isDraftLoading) && !draftLoadError && (
            <div className="builder-editor-toolbar" role="toolbar" aria-label="Formatting tools">
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "formatBlock", "p")}>
                P
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "formatBlock", "h1")}>
                H1
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "formatBlock", "h2")}>
                H2
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "formatBlock", "h3")}>
                H3
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "bold")}>
                Bold
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "italic")}>
                Italic
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "underline")}>
                Underline
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "justifyLeft")}>
                Left
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "justifyCenter")}>
                Center
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "justifyRight")}>
                Right
              </button>
              <button
                type="button"
                onMouseDown={(event) => runPreviewCommand(event, "insertUnorderedList")}
              >
                Bullets
              </button>
              <button type="button" onMouseDown={(event) => runPreviewCommand(event, "insertOrderedList")}>
                Numbered
              </button>
              <button
                type="button"
                onMouseDown={(event) => runPreviewCommand(event, "formatBlock", "blockquote")}
              >
                Quote
              </button>
              <button type="button" onMouseDown={runPreviewLink}>
                Link
              </button>
              <button
                type="button"
                onMouseDown={(event) => runPreviewCommand(event, "clearAllFormatting")}
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <div className="builder-actions">
          <div className="builder-actions-buttons">
            <button className="ghost" onClick={handleSaveDraft} disabled={!draftState || savingDraft}>
              {savingDraft ? "Saving..." : "Save draft"}
            </button>
            <button
              className="primary"
              onClick={handlePublish}
              disabled={isProvisioning || !draftState || publishFeedback?.kind === "progress"}
            >
              {isProvisioning ? "Publishing..." : publishFeedback?.kind === "progress" ? "Building..." : "Publish"}
            </button>
          </div>
          {(isProvisioning || publishFeedback) && (
            <div className="builder-actions-feedback">
              <div
                className={`builder-publish-feedback ${
                  isProvisioning
                    ? ""
                    : publishFeedback?.kind === "error"
                    ? "is-error"
                    : publishFeedback?.kind === "success"
                      ? "is-success"
                      : ""
                }`}
              >
                <span>{isProvisioning ? "Publishing your site..." : publishFeedback?.text}</span>
                {isProvisioning && <span>{provisionStep}</span>}
                {!isProvisioning && publishFeedback?.runUrl && (
                  <a href={publishFeedback.runUrl} target="_blank" rel="noopener noreferrer">
                    {publishFeedback.kind === "progress" ? "View actions" : "View build"}
                  </a>
                )}
                {!isProvisioning &&
                  publishFeedback?.pagesUrl &&
                  publishFeedback.kind === "success" && (
                  <a href={publishFeedback.pagesUrl} target="_blank" rel="noopener noreferrer">
                    Open site
                  </a>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="builder-body">
        <aside className="builder-sidebar">
          <button className="ghost" type="button" onClick={() => navigate("/studio")}>
            BACK
          </button>

          <div className="builder-sidebar-nav">
            <button
              className={activeSection === "content" ? "primary" : "ghost"}
              onClick={() => setActiveSection("content")}
            >
              Solidary Metadata
            </button>
            <button
              className={activeSection === "pages" ? "primary" : "ghost"}
              onClick={() => setActiveSection("pages")}
            >
              Pages
            </button>
            <button
              className={activeSection === "styles" ? "primary" : "ghost"}
              onClick={() => setActiveSection("styles")}
            >
              Styles
            </button>
            <button
              className={activeSection === "settings" ? "primary" : "ghost"}
              onClick={() => setActiveSection("settings")}
            >
              Settings
            </button>
          </div>

          {!isProvisioning && activeSection === "content" && (
            <div className="builder-section">
              <div className="section-header">
                <h2>Solidary Metadata</h2>
                <p>Update the main site metadata and hero text.</p>
              </div>
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
          )}

          {!isProvisioning && activeSection === "pages" && (
            <div className="builder-section">
              <div className="section-header">
                <h2>Pages</h2>
                <p>Add pages and choose which page is active in the builder panel editor.</p>
              </div>
              <button className="primary" type="button" onClick={addPage}>
                Add page
              </button>
              <div className="builder-page-list">
                {pages.map((page, index) => (
                  <div key={page.id ?? `new-${index}`} className="builder-page-card">
                    <button
                      type="button"
                      className={activePreviewSlug === getPageSafeSlug(page, index) ? "primary" : "ghost"}
                      onClick={() => setActivePreviewSlug(getPageSafeSlug(page, index))}
                    >
                      {activePreviewSlug === getPageSafeSlug(page, index)
                        ? "Editing in panel"
                        : "Edit in panel"}
                    </button>
                    <label>
                      Title
                      <input
                        ref={index === pages.length - 1 ? pageTitleRef : null}
                        value={page.title}
                        onChange={(event) => {
                          const nextTitle = event.target.value;
                          if (page.isHome) {
                            updatePage(index, { title: nextTitle });
                            return;
                          }

                          updatePage(index, {
                            title: nextTitle,
                            slug: makeUniquePageSlug(nextTitle || page.slug || "page", pages, index)
                          });
                        }}
                        disabled={page.isHome}
                      />
                    </label>
                    <label>
                      Slug
                      <input
                        value={page.slug}
                        onChange={(event) =>
                          updatePage(index, {
                            slug: makeUniquePageSlug(event.target.value || "page", pages, index)
                          })
                        }
                        disabled={page.isHome}
                      />
                    </label>
                    {!page.isHome && (
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={page.showInNav}
                          onChange={(event) => updatePage(index, { showInNav: event.target.checked })}
                        />
                        Show in navigation
                      </label>
                    )}
                    {!page.isHome && (
                      <button className="ghost" type="button" onClick={() => removePage(index)}>
                        Remove page
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isProvisioning && activeSection === "styles" && (
            <div className="builder-section">
              <div className="section-header">
                <h2>Styles</h2>
                <p>Edit design tokens to adjust colors, spacing, and typography.</p>
              </div>
              <textarea
                className="code-block"
                value={tokensCss}
                onChange={(event) => setTokensCss(event.target.value)}
                rows={20}
              />
            </div>
          )}

          {!isProvisioning && activeSection === "settings" && (
            <div className="builder-section">
              <div className="section-header">
                <h2>Settings</h2>
                <p>Configure your canonical URL, locale, and author settings.</p>
              </div>
              <label>
                Site URL
                <input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} />
              </label>
              <label>
                Locale
                <input value={siteLocale} onChange={(event) => setSiteLocale(event.target.value)} />
              </label>
              <div className="builder-grid">
                <label>
                  Author name
                  <input value={authorName} onChange={(event) => setAuthorName(event.target.value)} />
                </label>
                <label>
                  Author email
                  <input value={authorEmail} onChange={(event) => setAuthorEmail(event.target.value)} />
                </label>
                <label>
                  Author URL
                  <input value={authorUrl} onChange={(event) => setAuthorUrl(event.target.value)} />
                </label>
              </div>
            </div>
          )}
        </aside>

        <section className="builder-panel">
          {shouldLoadDraft && isDraftLoading && (
            <div className="provisioning">
              <div className="spinner" />
              <h2>Loading draft preview</h2>
              <p>Preparing your saved site content...</p>
            </div>
          )}

          {!isDraftLoading && draftLoadError && (
            <div className="provisioning">
              <h2>Unable to load draft</h2>
              <p>{draftLoadError}</p>
            </div>
          )}

          {!isDraftLoading && !draftLoadError && (
            <AstroTemplatePreview
              ref={previewRef}
              previewBrand={previewBrand}
              pages={pages}
              author={{
                name: authorName,
                email: authorEmail,
                url: authorUrl
              }}
              tokensCss={tokensCss}
              homeFallbackBody={defaultHomeContent}
              activePageSlug={activePreviewSlug}
              onActivePageChange={setActivePreviewSlug}
              onPageBodyChange={updatePageBody}
            />
          )}
        </section>
      </div>

      <SiteFooter notice={notice} noticeKind={noticeKind} />
    </div>
  );
}
