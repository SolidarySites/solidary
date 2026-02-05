import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import type { NoticeKind, RepoFileSet } from "../studio/types";
import templateSolidary from "../templates/astro/solidary-links.json?raw";
import tokensTemplate from "../templates/astro/tokens.css?raw";
import { buildPageMarkdown, buildSiteTs, type AstroPageDraft } from "../studio/astro";
import { githubRequest, writeTextFile } from "../studio/github";
import { parseSolidaryJson, slugify, toBase64 } from "../studio/utils";

const FILE_KEYS = {
  site: "src/content/site.ts",
  tokens: "src/styles/partials/tokens.css",
  solidary: "public/.well-known/solidary-links.json"
};

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
  const [provisionStep, setProvisionStep] = useState("Preparing your site...");

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

  const [pages, setPages] = useState<AstroPageDraft[]>([
    { title: "About", slug: "about", body: "Write about your project here.", showInNav: true },
    { title: "Contact", slug: "contact", body: "Add contact details here.", showInNav: true },
    { title: "Legal", slug: "legal", body: "Add legal or policy details here.", showInNav: true }
  ]);

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
    supabase
      .from("site_drafts")
      .select("id, repo_full_name, branch, files")
      .eq("id", draftId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted || error || !data) return;
        const files = data.files as RepoFileSet;
        const siteRaw = files[FILE_KEYS.site] ?? "";
        const solidaryRaw = files[FILE_KEYS.solidary] ?? files[".well-known/solidary-links.json"] ?? "";
        const solidary = parseSolidaryJson(solidaryRaw);

        setDraftState({
          id: data.id,
          repoFullName: data.repo_full_name,
          branch: data.branch,
          files
        });

        if (solidary?.title) setSiteTitle(solidary.title);
        if (solidary?.description) setSiteDescription(solidary.description);
        if (solidary?.site_url) setSiteUrl(solidary.site_url);
        if (solidary?.image_url) setSiteImagePreview(solidary.image_url);

        if (siteRaw.includes("tagline:")) {
          const match = siteRaw.match(/tagline:\s*"([^"]*)"/);
          if (match) setSiteTagline(match[1]);
        }
      });

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
      { title: "New page", slug, body: "Write your page content here.", showInNav: true }
    ]);
    setActiveSection("pages");
    requestAnimationFrame(() => pageTitleRef.current?.focus());
  };

  const updatePage = (index: number, updates: Partial<AstroPageDraft>) => {
    setPages((items) => items.map((item, idx) => (idx === index ? { ...item, ...updates } : item)));
  };

  const removePage = (index: number) => {
    setPages((items) => items.filter((_, idx) => idx !== index));
  };

  const buildFiles = (siteId: string, imageUrl: string, urlOverride?: string) => {
    const settings = {
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
    };

    const files: RepoFileSet = {
      [FILE_KEYS.site]: buildSiteTs(settings),
      [FILE_KEYS.tokens]: tokensCss,
      [FILE_KEYS.solidary]: templateSolidary
        .replaceAll("{{SITE_ID}}", siteId)
        .replaceAll("{{TITLE}}", settings.title)
        .replaceAll("{{DESCRIPTION}}", settings.description)
        .replaceAll("{{SITE_URL}}", settings.siteUrl)
        .replaceAll("{{IMAGE_URL}}", imageUrl)
    };

    pages.forEach((page) => {
      const safeSlug = slugify(page.slug || page.title) || `page-${Date.now()}`;
      files[`src/content/pages/${safeSlug}.md`] = buildPageMarkdown({
        ...page,
        slug: safeSlug
      });
    });

    return files;
  };

  const saveDraftFiles = async (files: RepoFileSet, repoInfo: DraftState) => {
    const { error } = await supabase.from("site_drafts").upsert(
      {
        id: repoInfo.id,
        owner_user_id: session?.user.id,
        repo_full_name: repoInfo.repoFullName,
        branch: repoInfo.branch,
        commit_sha: "",
        files
      },
      { onConflict: "owner_user_id,repo_full_name" }
    );

    if (error) {
      throw new Error(error.message);
    }
  };

  const handleProvision = async () => {
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

    const normalizedTitle = siteTitle.trim();
    const slug = computedSlug || `site-${Date.now()}`;
    const imagePath = siteImage ? `public/images/site-image-${slug}.jpg` : "public/images/og/og-default.jpg";
    const imageUrl = siteImage ? `/${imagePath.replace(/^public\//, "")}` : "/images/og/og-default.jpg";
    const siteId = crypto.randomUUID();

    setIsProvisioning(true);

    try {
      setProvisionStep("Creating your GitHub repository...");
      const repoResponse = await githubRequest<{
        repo: {
          full_name: string;
          name: string;
          owner: { login: string };
          html_url: string;
          default_branch: string;
        };
      }>("/.netlify/functions/github-create-repo", {
        token: providerToken,
        name: slug,
        description: siteDescription.trim(),
        private: false
      });

      const repo = repoResponse.repo;
      const ownerLogin = repo.owner.login;
      const pagesRootUrl = `https://${ownerLogin}.github.io`;
      const isUserSite = repo.name.toLowerCase() === `${ownerLogin.toLowerCase()}.github.io`;
      const baseUrl = isUserSite ? "" : `/${repo.name}`;
      const siteUrlResolved = isUserSite ? pagesRootUrl : `${pagesRootUrl}${baseUrl}`;

      setSiteUrl(siteUrlResolved);

      const files = buildFiles(siteId, imageUrl, siteUrlResolved);

      setProvisionStep("Uploading site image...");
      if (siteImage) {
        const imageBase64 = toBase64(await siteImage.arrayBuffer());
        await githubRequest("/.netlify/functions/github-contents-write", {
          token: providerToken,
          owner: ownerLogin,
          repo: repo.name,
          path: imagePath,
          message: "Add site image",
          content: imageBase64,
          branch: repo.default_branch
        });
      }

      setProvisionStep("Writing content files...");
      for (const [path, content] of Object.entries(files)) {
        await writeTextFile(providerToken, ownerLogin, repo.name, path, content, repo.default_branch);
      }

      setProvisionStep("Enabling GitHub Pages...");
      try {
        await githubRequest("/.netlify/functions/github-enable-pages", {
          token: providerToken,
          owner: ownerLogin,
          repo: repo.name,
          branch: repo.default_branch
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to enable GitHub Pages.";
        setNotice(`GitHub Pages couldn't be enabled yet: ${message}`);
        setNoticeKind("notice");
      }

      setProvisionStep("Saving site metadata...");
      await supabase.from("sites").insert({
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

      const { error: draftError } = await supabase.from("site_drafts").upsert(
        {
          owner_user_id: session.user.id,
          repo_full_name: repo.full_name,
          branch: repo.default_branch,
          commit_sha: "",
          files
        },
        { onConflict: "owner_user_id,repo_full_name" }
      );

      if (draftError) {
        throw new Error(draftError.message);
      }

      setDraftState({
        id: siteId,
        repoFullName: repo.full_name,
        branch: repo.default_branch,
        files
      });

      setNotice("Site created. You can keep editing before publishing changes.");
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
      const imageUrl = siteImagePreview || "/images/og/og-default.jpg";
      const files = buildFiles(draftState.id, imageUrl, siteUrl);
      await saveDraftFiles(files, draftState);
      setDraftState({ ...draftState, files });
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
            Content
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
              <button className="primary" onClick={handleProvision} disabled={isProvisioning}>
                {isProvisioning ? "Creating..." : "Create site"}
              </button>
            </div>
          </header>

          {isProvisioning && (
            <div className="provisioning">
              <div className="spinner" />
              <h2>Setting up your site</h2>
              <p>{provisionStep}</p>
            </div>
          )}

          {!isProvisioning && activeSection === "content" && (
            <div className="builder-section">
              <div className="section-header">
                <h2>Content</h2>
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
                  <div key={page.slug} className="builder-page-card">
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
                      />
                    </label>
                    <label>
                      Slug
                      <input
                        value={page.slug}
                        onChange={(event) => updatePage(index, { slug: slugify(event.target.value) })}
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
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={page.showInNav}
                        onChange={(event) => updatePage(index, { showInNav: event.target.checked })}
                      />
                      Show in navigation
                    </label>
                    <button className="ghost" type="button" onClick={() => removePage(index)}>
                      Remove page
                    </button>
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
