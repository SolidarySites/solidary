import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { supabase } from "../lib/supabase";
import type { NoticeKind, RepoFileSet } from "../studio/types";
import templateSolidary from "../templates/astro/solidary-links.json?raw";
import headerTemplate from "../../../../templates/astro-baseline/src/components/Header.astro?raw";
import indexTemplate from "../../../../templates/astro-baseline/src/pages/index.astro?raw";
import tokensTemplate from "../templates/astro/tokens.css?raw";
import { buildSiteTs, type AstroPageDraft } from "../studio/astro";
import { githubRequest, writeTextFile } from "../studio/github";
import { slugify, toBase64 } from "../studio/utils";

const FILE_KEYS = {
  site: "src/content/site.ts",
  tokens: "src/styles/partials/tokens.css",
  header: "src/components/Header.astro",
  index: "src/pages/index.astro",
  solidary: "public/.well-known/solidary-links.json"
};


export default function SiteCreatePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState("Preparing your site...");

  const [siteTitle, setSiteTitle] = useState("New Astro Site");
  const [siteTagline, setSiteTagline] = useState("A calm, static home on the web.");
  const [siteDescription, setSiteDescription] = useState("Describe your site in a sentence or two.");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteLocale] = useState("en");

  const [authorName] = useState("");
  const [authorEmail] = useState("");
  const [authorUrl] = useState("");

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

  const buildSettingsPayload = (imageUrl: string, urlOverride?: string) => ({
    title: siteTitle.trim(),
    tagline: siteTagline.trim(),
    description: siteDescription.trim(),
    siteUrl: urlOverride || siteUrl,
    locale: siteLocale,
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

    return files;
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
      const solidaryFile = buildSolidaryFile(siteId, imageUrl, siteUrlResolved);

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
          id: siteId,
          owner_user_id: session.user.id,
          repo_full_name: repo.full_name,
          branch: repo.default_branch,
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
          tagline: siteTagline.trim(),
          description: siteDescription.trim(),
          siteUrl: siteUrlResolved,
          locale: siteLocale,
          author: {
            name: authorName.trim() || "",
            email: authorEmail.trim() || "",
            url: authorUrl.trim() || ""
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

      navigate(`/site-builder?draftId=${siteId}`);
    } catch (caught) {
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
              <p>Enter the main site metadata and hero text.</p>
            </div>
            <div className="form-grid">
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
