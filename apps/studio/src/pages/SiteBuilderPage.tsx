import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import type { NoticeKind, RepoFileSet } from "../studio/types";
import templateSolidary from "../templates/astro/solidary-links.json?raw";
import homeTemplate from "../../../../templates/astro-baseline/src/content/pages/home.md?raw";
import tokensTemplate from "../templates/astro/tokens.css?raw";
import { buildPageMarkdown, buildSiteTs, type AstroPageDraft } from "../studio/astro";
import { deleteTextFile, githubRequest, listDirectory, writeTextFile } from "../studio/github";
import { parseSolidaryJson, slugify, toBase64 } from "../studio/utils";

const FILE_KEYS = {
  site: "src/content/site.ts",
  tokens: "src/styles/partials/tokens.css",
  solidary: "public/.well-known/solidary-links.json"
};

const PAGE_PATH_PREFIX = "src/content/pages/";
const PAGE_PATH_SUFFIX = ".md";

type BuilderPage = AstroPageDraft & {
  id?: string;
  position?: number | null;
  isHome?: boolean;
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

  const [siteTitle, setSiteTitle] = useState("New Astro Site");
  const [siteTagline, setSiteTagline] = useState("A calm, static home on the web.");
  const [siteDescription, setSiteDescription] = useState("Describe your site in a sentence or two.");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteLocale, setSiteLocale] = useState("en");
  const [themeColor, setThemeColor] = useState("#fbfbf9");

  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [authorUrl, setAuthorUrl] = useState("");
  const [authorGithub, setAuthorGithub] = useState("");
  const [authorX, setAuthorX] = useState("");
  const [authorLinkedin, setAuthorLinkedin] = useState("");

  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);

  const [pages, setPages] = useState<BuilderPage[]>([]);
  const [draftPageSlugs, setDraftPageSlugs] = useState<string[]>([]);

  const [tokensCss, setTokensCss] = useState(tokensTemplate);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const pageTitleRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    const draftId = searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId;
    if (!draftId || !session) return;

    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("site_drafts")
        .select("id, repo_full_name, branch, files")
        .eq("id", draftId)
        .maybeSingle();

      if (!mounted || error || !data) return;

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
        supabase.from("site_draft_settings").select("settings, styles").eq("draft_id", data.id).maybeSingle()
      ]);

      const draftPages = (pagesData ?? []).map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        body: page.content ?? "",
        showInNav: page.show_in_nav ?? true,
        position: page.position,
        isHome: page.is_home ?? false
      }));
      setPages(draftPages);
      setDraftPageSlugs(draftPages.map((page) => page.slug));

      const settings = (settingsData?.settings as Record<string, unknown>) ?? {};
      const styles = (settingsData?.styles as Record<string, unknown>) ?? {};

      if (typeof settings.title === "string") setSiteTitle(settings.title);
      else if (solidary?.title) setSiteTitle(solidary.title);

      if (typeof settings.tagline === "string") setSiteTagline(settings.tagline);

      if (typeof settings.description === "string") setSiteDescription(settings.description);
      else if (solidary?.description) setSiteDescription(solidary.description);

      if (typeof settings.siteUrl === "string") setSiteUrl(settings.siteUrl);
      else if (solidary?.site_url) setSiteUrl(solidary.site_url);

      if (typeof settings.locale === "string") setSiteLocale(settings.locale);
      if (typeof settings.themeColor === "string") setThemeColor(settings.themeColor);

      const author = settings.author as Record<string, unknown> | undefined;
      if (author?.name && typeof author.name === "string") setAuthorName(author.name);
      if (author?.email && typeof author.email === "string") setAuthorEmail(author.email);
      if (author?.url && typeof author.url === "string") setAuthorUrl(author.url);
      if (author?.github && typeof author.github === "string") setAuthorGithub(author.github);
      if (author?.x && typeof author.x === "string") setAuthorX(author.x);
      if (author?.linkedin && typeof author.linkedin === "string") setAuthorLinkedin(author.linkedin);

      if (typeof styles.tokensCss === "string") setTokensCss(styles.tokensCss);

      if (solidary?.image_url) {
        setSiteImagePreview(solidary.image_url);
        setDraftImageUrl(solidary.image_url);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [location.state, searchParams, session]);

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
    const slug = slugify("new-page") || `page-${Date.now()}`;
    setPages((items) => [
      ...items,
      {
        title: "New page",
        slug,
        body: "Write your page content here.",
        showInNav: true,
        position: items.length
      }
    ]);
    setActiveSection("pages");
    requestAnimationFrame(() => pageTitleRef.current?.focus());
  };

  const updatePage = (index: number, updates: Partial<BuilderPage>) => {
    setPages((items) => items.map((item, idx) => (idx === index ? { ...item, ...updates } : item)));
  };

  const removePage = (index: number) => {
    setPages((items) => items.filter((_, idx) => idx !== index || items[idx]?.isHome));
  };

  const buildSettingsPayload = (imageUrl: string, urlOverride?: string) => ({
    title: siteTitle.trim(),
    tagline: siteTagline.trim(),
    description: siteDescription.trim(),
    siteUrl: (urlOverride ?? siteUrl).trim(),
    locale: siteLocale.trim() || "en",
    author: {
      name: authorName.trim() || "",
      email: authorEmail.trim() || "",
      url: authorUrl.trim() || "",
      github: authorGithub.trim() || "",
      x: authorX.trim() || "",
      linkedin: authorLinkedin.trim() || ""
    },
    themeColor: themeColor.trim() || "#fbfbf9",
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
      [FILE_KEYS.solidary]: buildSolidaryFile(siteId, imageUrl, urlOverride)
    };

    pages.forEach((page, index) => {
      const safeSlug = slugify(page.slug || page.title) || `page-${index + 1}`;
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
      slug: slugify(page.slug || page.title) || `page-${index + 1}`,
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
          const safeSlug = slugify(page.slug || page.title) || `page-${index + 1}`;
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

      setNotice("Site published. Your GitHub Pages site will update shortly.");
      setNoticeKind("notice");
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

  return (
    <div className="app-shell builder-shell">
      <SiteHeader
        session={session}
        showAuthActions
        onSignIn={handleGitHubLogin}
        onSignOut={handleLogout}
      />

      <div className="builder-body">
        <aside className="builder-sidebar">
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
          <button className="ghost" onClick={() => navigate("/studio")}>Back to Studio</button>
        </aside>

        <section className="builder-panel">
          <header className="builder-panel-header">
            <div>
              <h1>Site Builder</h1>
              <p>Astro template editor</p>
            </div>
            <div className="builder-actions">
              <button className="ghost" onClick={handleSaveDraft} disabled={!draftState || savingDraft}>
                {savingDraft ? "Saving..." : "Save draft"}
              </button>
              <button className="primary" onClick={handlePublish} disabled={isProvisioning || !draftState}>
                {isProvisioning ? "Publishing..." : "Publish"}
              </button>
            </div>
          </header>

          {isProvisioning && (
            <div className="provisioning">
              <div className="spinner" />
              <h2>Publishing your site</h2>
              <p>{provisionStep}</p>
            </div>
          )}

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
                Tagline
                <input value={siteTagline} onChange={(event) => setSiteTagline(event.target.value)} />
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
                <p>Add pages that will show up in the navigation.</p>
              </div>
              <button className="primary" type="button" onClick={addPage}>
                Add page
              </button>
              <div className="builder-page-list">
                {pages.map((page, index) => (
                  <div key={page.id ?? page.slug} className="builder-page-card">
                    <label>
                      Title
                      <input
                        ref={index === pages.length - 1 ? pageTitleRef : null}
                        value={page.title}
                        onChange={(event) =>
                          updatePage(index, {
                            title: event.target.value,
                            slug: slugify(event.target.value || page.slug)
                          })
                        }
                        disabled={page.isHome}
                      />
                    </label>
                    <label>
                      Slug
                      <input
                        value={page.slug}
                        onChange={(event) => updatePage(index, { slug: slugify(event.target.value) })}
                        disabled={page.isHome}
                      />
                    </label>
                    <label>
                      Content
                      <textarea
                        value={page.body}
                        onChange={(event) => updatePage(index, { body: event.target.value })}
                        rows={4}
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
                rows={16}
              />
            </div>
          )}

          {!isProvisioning && activeSection === "settings" && (
            <div className="builder-section">
              <div className="section-header">
                <h2>Settings</h2>
                <p>Configure your canonical URL, locale, author, and SEO settings.</p>
              </div>
              <label>
                Site URL
                <input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} />
              </label>
              <label>
                Locale
                <input value={siteLocale} onChange={(event) => setSiteLocale(event.target.value)} />
              </label>
              <label>
                Theme color
                <input value={themeColor} onChange={(event) => setThemeColor(event.target.value)} />
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
                <label>
                  GitHub
                  <input value={authorGithub} onChange={(event) => setAuthorGithub(event.target.value)} />
                </label>
                <label>
                  X
                  <input value={authorX} onChange={(event) => setAuthorX(event.target.value)} />
                </label>
                <label>
                  LinkedIn
                  <input value={authorLinkedin} onChange={(event) => setAuthorLinkedin(event.target.value)} />
                </label>
              </div>
            </div>
          )}
        </section>
      </div>

      <SiteFooter notice={notice} noticeKind={noticeKind} />
    </div>
  );
}
