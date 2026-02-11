import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import type { AstroTemplatePreviewHandle } from "../components/studio/AstroTemplatePreview";
import BuilderPreviewPanel from "../components/studio/site-builder/BuilderPreviewPanel";
import BuilderSidebar from "../components/studio/site-builder/BuilderSidebar";
import BuilderTopbar from "../components/studio/site-builder/BuilderTopbar";
import {
  buildFiles,
  buildSettingsPayload,
  buildSolidaryFile
} from "../components/studio/site-builder/build-files";
import {
  FILE_KEYS,
  PAGE_PATH_PREFIX,
  PAGE_PATH_SUFFIX
} from "../components/studio/site-builder/constants";
import { loadDraftById } from "../components/studio/site-builder/load-draft";
import type {
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  DraftState,
  PublishFeedback
} from "../components/studio/site-builder/types";
import { usePublishStatusTracking } from "../components/studio/site-builder/usePublishStatusTracking";
import {
  getPageSafeSlug,
  formatFooterCustomLinks,
  makeUniquePageSlug,
  parseFooterCustomLinks,
  stripFrontmatter
} from "../components/studio/site-builder/utils";
import type { NoticeKind } from "../studio/types";
import templateSolidary from "../templates/astro/solidary-links.json?raw";
import homeTemplate from "../../../../templates/astro-baseline/src/content/pages/home.md?raw";
import headerTemplate from "../../../../templates/astro-baseline/src/components/Header.astro?raw";
import footerTemplate from "../../../../templates/astro-baseline/src/components/Footer.astro?raw";
import indexTemplate from "../../../../templates/astro-baseline/src/pages/index.astro?raw";
import tokensTemplate from "../templates/astro/tokens.css?raw";
import { deleteTextFile, githubRequest, listDirectory, writeTextFile } from "../studio/github";
import { slugify, toBase64 } from "../studio/utils";

const defaultHomeContent = stripFrontmatter(homeTemplate);

export default function SiteBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [activeSection, setActiveSection] = useState<BuilderSection>("menu");
  const [activeSettingsSection, setActiveSettingsSection] = useState<BuilderSettingsSection>("pages");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState("Preparing your updates...");
  const [sessionResolved, setSessionResolved] = useState(false);

  const [siteTitle, setSiteTitle] = useState("New Astro Site");
  const [siteDescription, setSiteDescription] = useState("Describe your site in a sentence or two.");
  const [siteUrl, setSiteUrl] = useState("");

  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);

  const [pages, setPages] = useState<BuilderPage[]>([]);
  const [draftPageSlugs, setDraftPageSlugs] = useState<string[]>([]);
  const [activePreviewSlug, setActivePreviewSlug] = useState("home");
  const [headerDisabled, setHeaderDisabled] = useState(false);
  const [headerFixed, setHeaderFixed] = useState(false);
  const [headerBrandText, setHeaderBrandText] = useState("New Astro Site");
  const [headerBrandDisabled, setHeaderBrandDisabled] = useState(false);

  const [footerDisabled, setFooterDisabled] = useState(false);
  const [footerFixed, setFooterFixed] = useState(false);
  const [footerCopyrightDisabled, setFooterCopyrightDisabled] = useState(false);
  const [footerCopyrightName, setFooterCopyrightName] = useState("New Astro Site");
  const [footerCustomText, setFooterCustomText] = useState("");
  const [footerCustomLinksInput, setFooterCustomLinksInput] = useState("");

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
  const hasInitializedHeaderBrand = useRef(false);

  const draftId = useMemo(
    () => searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId ?? null,
    [location.state, searchParams]
  );
  const computedSlug = useMemo(() => slugify(siteTitle), [siteTitle]);
  const shouldLoadDraft = Boolean(draftId);
  const footerCustomLinks = useMemo(
    () => parseFooterCustomLinks(footerCustomLinksInput),
    [footerCustomLinksInput]
  );

  const { startPublishStatusTracking, cancelPublishStatusTracking } = usePublishStatusTracking({
    onPublishFeedback: setPublishFeedback,
    onPublishError: (message) => {
      setNotice(message);
      setNoticeKind("error");
    },
    onPublishSuccess: (message) => {
      setNotice(message);
      setNoticeKind("notice");
    }
  });

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
        const loaded = await loadDraftById({
          draftId,
          defaultHomeContent
        });

        if (!mounted) return;

        setDraftState(loaded.draftState);
        setPages(loaded.pages);
        setDraftPageSlugs(loaded.draftPageSlugs);
        if (loaded.initialActivePreviewSlug) {
          setActivePreviewSlug(loaded.initialActivePreviewSlug);
        }

        if (loaded.siteTitle) {
          setSiteTitle(loaded.siteTitle);
        }
        if (loaded.header) {
          setHeaderDisabled(loaded.header.disabled);
          setHeaderFixed(loaded.header.fixed);
          setHeaderBrandDisabled(loaded.header.disableBrand);
          setHeaderBrandText(
            loaded.header.brandText?.trim() || loaded.siteTitle?.trim() || "New Astro Site"
          );
          hasInitializedHeaderBrand.current = true;
        } else if (!hasInitializedHeaderBrand.current) {
          setHeaderBrandText(loaded.siteTitle?.trim() || "New Astro Site");
          hasInitializedHeaderBrand.current = true;
        }

        if (typeof loaded.siteDescription === "string") setSiteDescription(loaded.siteDescription);
        if (typeof loaded.siteUrl === "string") setSiteUrl(loaded.siteUrl);
        if (typeof loaded.tokensCss === "string") setTokensCss(loaded.tokensCss);
        if (typeof loaded.siteImagePreview === "string") setSiteImagePreview(loaded.siteImagePreview);
        if (typeof loaded.draftImageUrl === "string") setDraftImageUrl(loaded.draftImageUrl);
        if (loaded.footer) {
          setFooterDisabled(loaded.footer.disabled);
          setFooterFixed(loaded.footer.fixed);
          setFooterCopyrightDisabled(loaded.footer.disableCopyright);
          setFooterCopyrightName(
            loaded.footer.copyrightName?.trim() || loaded.siteTitle?.trim() || "New Astro Site"
          );
          setFooterCustomText(loaded.footer.customText);
          setFooterCustomLinksInput(formatFooterCustomLinks(loaded.footer.customLinks));
        } else {
          setFooterCopyrightName(loaded.siteTitle?.trim() || "New Astro Site");
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
    setActiveSection("settings");
    setActiveSettingsSection("pages");
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

  const siteSettingsInput = {
    siteTitle,
    siteDescription,
    siteUrl,
    header: {
      disabled: headerDisabled,
      fixed: headerFixed,
      brandText: headerBrandText,
      disableBrand: headerBrandDisabled
    },
    footer: {
      disabled: footerDisabled,
      fixed: footerFixed,
      disableCopyright: footerCopyrightDisabled,
      copyrightName: footerCopyrightName,
      customText: footerCustomText,
      customLinks: footerCustomLinks
    }
  };

  const updateDraftSolidaryFile = (baseDraft: DraftState, solidaryFile: string) => {
    setDraftState({
      ...baseDraft,
      files: {
        [FILE_KEYS.solidary]: solidaryFile
      }
    });
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
      settings: buildSettingsPayload(siteSettingsInput, imageUrl),
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
    cancelPublishStatusTracking();

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
      const solidaryFile = buildSolidaryFile({
        templateSolidary,
        siteId: draftState.id,
        imageUrl,
        settingsInput: siteSettingsInput,
        urlOverride: siteUrl
      });

      setProvisionStep("Saving draft...");
      await saveDraftState(draftState, solidaryFile, imageUrl);
      updateDraftSolidaryFile(draftState, solidaryFile);

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

      const files = buildFiles({
        siteId: draftState.id,
        imageUrl,
        settingsInput: siteSettingsInput,
        tokensCss,
        headerTemplate,
        footerTemplate,
        indexTemplate,
        templateSolidary,
        pages,
        defaultHomeContent,
        urlOverride: siteUrl
      });

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
      const { error: siteError } = await supabase.from("sites").upsert({
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
      if (siteError) {
        throw new Error(siteError.message);
      }

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
      const imageUrl = siteImage
        ? draftImageUrl || "/images/og/og-default.jpg"
        : siteImagePreview || draftImageUrl || "/images/og/og-default.jpg";
      const solidaryFile = buildSolidaryFile({
        templateSolidary,
        siteId: draftState.id,
        imageUrl,
        settingsInput: siteSettingsInput,
        urlOverride: siteUrl
      });
      await saveDraftState(draftState, solidaryFile, imageUrl);
      updateDraftSolidaryFile(draftState, solidaryFile);
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

  const runPreviewCommand = (command: string, value?: string) => {
    previewRef.current?.execCommand(command, value);
  };

  const runPreviewLink = () => {
    const url = window.prompt("Link URL");
    if (!url) return;
    previewRef.current?.execCommand("createLink", url);
  };

  const handlePageTitleChange = (index: number, nextTitle: string) => {
    const page = pages[index];
    if (!page) return;
    if (page.isHome) {
      updatePage(index, { title: nextTitle });
      return;
    }

    updatePage(index, {
      title: nextTitle,
      slug: makeUniquePageSlug(nextTitle || page.slug || "page", pages, index)
    });
  };

  const handlePageSlugChange = (index: number, nextSlug: string) => {
    const page = pages[index];
    if (!page || page.isHome) return;
    updatePage(index, {
      slug: makeUniquePageSlug(nextSlug || "page", pages, index)
    });
  };

  const headerNavItems = useMemo(
    () =>
      pages
        .map((page, index) => ({
          page,
          safeSlug: getPageSafeSlug(page, index)
        }))
        .filter(({ page }) => page.showInNav !== false)
        .map(({ page, safeSlug }) => ({
          slug: safeSlug,
          label: page.title.trim() || "Untitled page"
        })),
    [pages]
  );

  const moveHeaderNavItem = (slug: string, direction: -1 | 1) => {
    setPages((items) => {
      const navIndices = items
        .map((page, index) => ({
          index,
          slug: getPageSafeSlug(page, index),
          showInNav: page.showInNav !== false
        }))
        .filter((item) => item.showInNav);
      const currentNavIndex = navIndices.findIndex((item) => item.slug === slug);
      if (currentNavIndex === -1) return items;
      const targetNavIndex = currentNavIndex + direction;
      if (targetNavIndex < 0 || targetNavIndex >= navIndices.length) return items;

      const fromIndex = navIndices[currentNavIndex].index;
      const toIndex = navIndices[targetNavIndex].index;
      const next = [...items];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
  };

  const canFormatText = !(shouldLoadDraft && isDraftLoading) && !draftLoadError;
  const canSaveDraft = Boolean(draftState) && !savingDraft;
  const canPublish = !isProvisioning && Boolean(draftState) && publishFeedback?.kind !== "progress";

  const handleSidebarBack = () => {
    if (activeSection !== "menu") {
      setActiveSection("menu");
      return;
    }
    navigate("/studio");
  };

  return (
    <div className="app-shell builder-shell">
      <SiteHeader
        session={session}
        showAuthActions
        onSignIn={handleGitHubLogin}
        onSignOut={handleLogout}
      />

      <BuilderTopbar
        savingDraft={savingDraft}
        isProvisioning={isProvisioning}
        provisionStep={provisionStep}
        canSaveDraft={canSaveDraft}
        canPublish={canPublish}
        publishFeedback={publishFeedback}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
      />

      <div className="builder-body">
        <BuilderSidebar
          activeSection={activeSection}
          activeSettingsSection={activeSettingsSection}
          siteTitle={siteTitle}
          siteDescription={siteDescription}
          siteImagePreview={siteImagePreview}
          pages={pages}
          activePreviewSlug={activePreviewSlug}
          pageTitleRef={pageTitleRef}
          tokensCss={tokensCss}
          siteUrl={siteUrl}
          headerDisabled={headerDisabled}
          headerFixed={headerFixed}
          headerBrandText={headerBrandText}
          headerBrandDisabled={headerBrandDisabled}
          headerNavItems={headerNavItems}
          footerDisabled={footerDisabled}
          footerFixed={footerFixed}
          footerCopyrightDisabled={footerCopyrightDisabled}
          footerCopyrightName={footerCopyrightName}
          footerCustomText={footerCustomText}
          footerCustomLinksInput={footerCustomLinksInput}
          onBack={handleSidebarBack}
          onSectionChange={setActiveSection}
          onSettingsSectionChange={setActiveSettingsSection}
          onSiteTitleChange={setSiteTitle}
          onSiteDescriptionChange={setSiteDescription}
          onSiteImageChange={setSiteImage}
          onAddPage={addPage}
          onActivePreviewSlugChange={setActivePreviewSlug}
          onPageTitleChange={handlePageTitleChange}
          onPageSlugChange={handlePageSlugChange}
          onPageShowInNavChange={(index, checked) => updatePage(index, { showInNav: checked })}
          onRemovePage={removePage}
          onTokensCssChange={setTokensCss}
          onSiteUrlChange={setSiteUrl}
          onHeaderDisabledChange={setHeaderDisabled}
          onHeaderFixedChange={setHeaderFixed}
          onHeaderBrandTextChange={setHeaderBrandText}
          onHeaderBrandDisabledChange={setHeaderBrandDisabled}
          onMoveHeaderNavItemUp={(slug) => moveHeaderNavItem(slug, -1)}
          onMoveHeaderNavItemDown={(slug) => moveHeaderNavItem(slug, 1)}
          onFooterDisabledChange={setFooterDisabled}
          onFooterFixedChange={setFooterFixed}
          onFooterCopyrightDisabledChange={setFooterCopyrightDisabled}
          onFooterCopyrightNameChange={setFooterCopyrightName}
          onFooterCustomTextChange={setFooterCustomText}
          onFooterCustomLinksInputChange={setFooterCustomLinksInput}
          canFormatText={canFormatText}
          onRunFormatCommand={runPreviewCommand}
          onRunFormatLink={runPreviewLink}
        />

        <BuilderPreviewPanel
          shouldLoadDraft={shouldLoadDraft}
          isDraftLoading={isDraftLoading}
          draftLoadError={draftLoadError}
          previewRef={previewRef}
          previewBrand={siteTitle}
          pages={pages}
          tokensCss={tokensCss}
          homeFallbackBody={defaultHomeContent}
          activePreviewSlug={activePreviewSlug}
          header={{
            disabled: headerDisabled,
            fixed: headerFixed,
            brandText: headerBrandText,
            disableBrand: headerBrandDisabled
          }}
          footer={{
            disabled: footerDisabled,
            fixed: footerFixed,
            disableCopyright: footerCopyrightDisabled,
            copyrightName: footerCopyrightName,
            customText: footerCustomText,
            customLinks: footerCustomLinks
          }}
          onActivePreviewSlugChange={setActivePreviewSlug}
          onPageBodyChange={updatePageBody}
        />
      </div>

      <SiteFooter notice={notice} noticeKind={noticeKind} />
    </div>
  );
}
