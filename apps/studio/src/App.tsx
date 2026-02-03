import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import "./App.css";
import templateIndex from "./templates/jekyll/index.md?raw";
import templateLayout from "./templates/jekyll/_layouts/default.html?raw";
import templateStyle from "./templates/jekyll/assets/css/style.css?raw";
import templateConfig from "./templates/jekyll/_config.yml?raw";
import templateSolidary from "./templates/jekyll/.well-known/solidary-links.json?raw";

type Flow = "choose" | "site" | "index" | "editor";

type NoticeKind = "error" | "notice" | null;

type SiteDraft = {
  id: string;
  title: string;
  imageUrl: string;
  imagePath: string;
  description: string;
  slug: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [flow, setFlow] = useState<Flow>("choose");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);

  const [siteTitle, setSiteTitle] = useState("");
  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [siteDescription, setSiteDescription] = useState("");
  const [siteLoading, setSiteLoading] = useState(false);
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [siteContent, setSiteContent] = useState<string>("");
  const [downloadLoading, setDownloadLoading] = useState(false);

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
        redirectTo: window.location.origin
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

  const handleChoose = (nextFlow: Flow) => {
    resetNotices();
    setFlow(nextFlow);
  };

  const handleCreateSite = async (event: React.FormEvent) => {
    event.preventDefault();
    resetNotices();

    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    if (!siteTitle.trim() || !siteImage || !siteDescription.trim()) {
      setNotice("Title, image, and description are required.");
      setNoticeKind("error");
      return;
    }

    if (siteImage.type !== "image/jpeg") {
      setNotice("Please upload a JPEG image (required for the Jekyll bundle).");
      setNoticeKind("error");
      return;
    }

    const normalizedTitle = siteTitle.trim();
    const normalizedDescription = siteDescription.trim();
    const slug = computedSlug || "site";
    const imagePath = `assets/images/sl-image-${slug}.jpg`;
    const imageUrl = `/${imagePath}`;
    const siteId = crypto.randomUUID();

    setSiteLoading(true);

    const { error } = await supabase.from("sites").insert({
      id: siteId,
      canonical_url: null,
      title: normalizedTitle,
      description: normalizedDescription,
      image_url: imageUrl,
      meta: {
        completion: "complete",
        source: "studio"
      }
    });

    if (error) {
      setNotice(error.message);
      setNoticeKind("error");
      setSiteLoading(false);
      return;
    }

    const draft: SiteDraft = {
      id: siteId,
      title: normalizedTitle,
      description: normalizedDescription,
      imagePath,
      imageUrl,
      slug
    };

    const initialContent = renderTemplate(templateIndex, draft);
    setSiteDraft(draft);
    setSiteContent(initialContent);
    setFlow("editor");
    setSiteLoading(false);
  };

  const renderTemplate = (template: string, site: SiteDraft) =>
    template
      .replaceAll("{{SITE_ID}}", site.id)
      .replaceAll("{{TITLE}}", site.title)
      .replaceAll("{{IMAGE_URL}}", site.imageUrl)
      .replaceAll("{{IMAGE_PATH}}", site.imagePath)
      .replaceAll("{{DESCRIPTION}}", site.description);

  const handleDownloadStarter = async () => {
    if (!siteDraft || !siteImage) return;

    setDownloadLoading(true);
    const zip = new JSZip();
    zip.file("index.md", siteContent || renderTemplate(templateIndex, siteDraft));
    zip.file("_config.yml", renderTemplate(templateConfig, siteDraft));
    zip.file("_layouts/default.html", templateLayout);
    zip.file("assets/css/style.css", templateStyle);
    zip.file(".well-known/solidary-links.json", renderTemplate(templateSolidary, siteDraft));
    zip.file(siteDraft.imagePath, await siteImage.arrayBuffer());

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `solidary-site-${siteDraft.slug || "starter"}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloadLoading(false);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">●</span>
          <div>
            <div className="brand-title">Solidary Links Studio</div>
            <div className="brand-subtitle">A slow web toolkit.</div>
          </div>
        </div>
        <div className="auth-actions">
          {!session ? (
            <button className="ghost" onClick={handleGitHubLogin}>
              Sign in with GitHub
            </button>
          ) : (
            <button className="ghost" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="main-content">
        {flow === "choose" && (
          <section className="choice">
            <h1>What do you want to create?</h1>
            <div className="choice-buttons">
              <button className="primary" onClick={() => handleChoose("site")}>
                A site
              </button>
              <button className="ghost" onClick={() => handleChoose("index")}>
                An index
              </button>
            </div>
          </section>
        )}

        {flow === "index" && (
          <section className="placeholder">
            <h2>Index creation</h2>
            <p>Index creation is next. For now, start with a site.</p>
            <button className="ghost" onClick={() => setFlow("choose")}>
              Back
            </button>
          </section>
        )}

        {flow === "site" && (
          <section className="site-form">
            <div className="section-header">
              <h2>Create a site</h2>
              <p>Provide the three required Solidary Link fields.</p>
            </div>
            <form onSubmit={handleCreateSite} className="form-grid">
              <label>
                Title
                <input
                  value={siteTitle}
                  onChange={(event) => setSiteTitle(event.target.value)}
                  placeholder="Site title"
                />
              </label>
              <label>
                Header image (JPEG)
                <input
                  type="file"
                  accept="image/jpeg"
                  onChange={(event) => setSiteImage(event.target.files?.[0] ?? null)}
                />
              </label>
              {siteImagePreview && (
                <img className="preview-image" src={siteImagePreview} alt="Preview" />
              )}
              <label>
                Description
                <textarea
                  value={siteDescription}
                  onChange={(event) => setSiteDescription(event.target.value)}
                  rows={5}
                  placeholder="Short description"
                />
              </label>
              <div className="form-actions">
                <button className="ghost" type="button" onClick={() => setFlow("choose")}>
                  Back
                </button>
                <button className="primary" type="submit" disabled={siteLoading}>
                  {siteLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </section>
        )}

        {flow === "editor" && siteDraft && (
          <section className="editor">
            <div className="section-header">
              <h2>Site editor</h2>
              <p>Preview and edit your site before pushing to GitHub.</p>
            </div>
            <div className="editor-grid">
              <div className="editor-panel">
                <h3>Content</h3>
                <MDEditor value={siteContent} onChange={(value) => setSiteContent(value ?? "")} />
                <div className="editor-actions">
                  <button className="primary" onClick={handleDownloadStarter} disabled={downloadLoading}>
                    {downloadLoading ? "Preparing..." : "Download Jekyll bundle"}
                  </button>
                  <button className="ghost" disabled>
                    Push to GitHub (coming soon)
                  </button>
                </div>
              </div>
              <div className="editor-panel">
                <h3>Live preview</h3>
                <div className="preview-shell">
                  <MDEditor.Markdown source={siteContent} />
                </div>
                <div className="settings-grid">
                  <button className="ghost" disabled>
                    Solidary Links settings
                  </button>
                  <button className="ghost" disabled>
                    Theme
                  </button>
                  <button className="ghost" disabled>
                    README
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        {!isSupabaseConfigured() && (
          <div className="warning">
            Add <code>VITE_SUPABASE_PROJECT_ID</code> and
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to
            <code>apps/studio/.env</code> before signing in.
          </div>
        )}
        {notice && (
          <div className={noticeKind === "error" ? "error" : "notice"}>{notice}</div>
        )}
      </footer>
    </div>
  );
}
