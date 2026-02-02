import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import type { Archive } from "@solidary/protocol";
import "./App.css";
import templateIndex from "./templates/jekyll/index.md?raw";
import templateLayout from "./templates/jekyll/_layouts/default.html?raw";
import templateStyle from "./templates/jekyll/assets/css/style.css?raw";
import templateConfig from "./templates/jekyll/_config.yml?raw";
import templateSolidary from "./templates/jekyll/.well-known/solidary-links.json?raw";

const emptyIndexes: Archive[] = [];

type Page = "home" | "contact";

type NoticeKind = "error" | "notice" | null;
type SiteDraft = {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
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
  const [indexes, setIndexes] = useState<Archive[]>(emptyIndexes);
  const [selectedIndexId, setSelectedIndexId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [activePage, setActivePage] = useState<Page>("home");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSlug, setDraftSlug] = useState("");
  const [siteTitle, setSiteTitle] = useState("");
  const [siteImage, setSiteImage] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  const [siteLoading, setSiteLoading] = useState(false);
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const computedSlug = useMemo(() => slugify(draftSlug || draftTitle), [draftSlug, draftTitle]);

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
    if (!session) {
      setIndexes(emptyIndexes);
      setSelectedIndexId(null);
      return;
    }

    const loadIndexes = async () => {
      setLoading(true);
      setNotice(null);
      setNoticeKind(null);

      const { data, error } = await supabase
        .from("archives")
        .select(
          "id, owner_user_id, slug, title, canonical_url, availability_window_days, default_ui_depth, max_ui_depth, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        setNotice(error.message);
        setNoticeKind("error");
      } else if (data) {
        setIndexes(data as Archive[]);
        setSelectedIndexId(data[0]?.id ?? null);
      }

      setLoading(false);
    };

    loadIndexes();
  }, [session]);

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

  const handleCreateIndex = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;

    const title = draftTitle.trim();
    const slug = computedSlug;
    if (!title || !slug) return;

    setLoading(true);
    setNotice(null);
    setNoticeKind(null);

    const { data, error } = await supabase
      .from("archives")
      .insert({
        owner_user_id: session.user.id,
        title,
        slug
      })
      .select(
        "id, owner_user_id, slug, title, canonical_url, availability_window_days, default_ui_depth, max_ui_depth, created_at, updated_at"
      )
      .single();

    if (error) {
      setNotice(error.message);
      setNoticeKind("error");
    } else if (data) {
      setIndexes((current) => [data as Archive, ...current]);
      setSelectedIndexId(data.id);
      setDraftTitle("");
      setDraftSlug("");
      setNotice("Index created.");
      setNoticeKind("notice");
    }

    setLoading(false);
  };

  const handleCreateSite = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!siteTitle.trim() || !siteImage.trim() || !siteDescription.trim()) {
      setNotice("Title, image, and description are required for a complete Solidary Link.");
      setNoticeKind("error");
      return;
    }

    if (!session) {
      setNotice("Sign in to create a site.");
      setNoticeKind("error");
      return;
    }

    setSiteLoading(true);
    setNotice(null);
    setNoticeKind(null);

    const siteId = crypto.randomUUID();
    const normalizedTitle = siteTitle.trim();
    const normalizedImage = siteImage.trim();
    const normalizedDescription = siteDescription.trim();
    const { error } = await supabase.from("sites").insert({
      id: siteId,
      canonical_url: null,
      title: normalizedTitle,
      description: normalizedDescription,
      image_url: normalizedImage,
      meta: {
        completion: "complete",
        source: "studio"
      }
    });

    if (error) {
      setNotice(error.message);
      setNoticeKind("error");
    } else {
      setNotice(
        "Site details saved. Next step: we will generate a Jekyll starter and connect it to GitHub."
      );
      setNoticeKind("notice");
      setSiteTitle("");
      setSiteImage("");
      setSiteDescription("");
      setSiteDraft({
        id: siteId,
        title: normalizedTitle,
        imageUrl: normalizedImage,
        description: normalizedDescription
      });
    }

    setSiteLoading(false);
  };

  const renderTemplate = (template: string, site: SiteDraft) =>
    template
      .replaceAll("{{SITE_ID}}", site.id)
      .replaceAll("{{TITLE}}", site.title)
      .replaceAll("{{IMAGE_URL}}", site.imageUrl)
      .replaceAll("{{DESCRIPTION}}", site.description);

  const handleDownloadStarter = async () => {
    if (!siteDraft) return;

    setDownloadLoading(true);
    const zip = new JSZip();
    zip.file("index.md", renderTemplate(templateIndex, siteDraft));
    zip.file("_config.yml", renderTemplate(templateConfig, siteDraft));
    zip.file("_layouts/default.html", templateLayout);
    zip.file("assets/css/style.css", templateStyle);
    zip.file(".well-known/solidary-links.json", renderTemplate(templateSolidary, siteDraft));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `solidary-site-${slugify(siteDraft.title) || "starter"}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloadLoading(false);
  };

  const handleJumpToStudio = () => {
    setActivePage("home");
    const studio = document.getElementById("studio");
    studio?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">●</span>
          <div>
            <div className="brand-title">Solidary Links</div>
            <div className="brand-subtitle">Indexing the human web.</div>
          </div>
        </div>
        <nav className="menu">
          <button
            className={activePage === "home" ? "menu-link active" : "menu-link"}
            onClick={() => setActivePage("home")}
          >
            Home
          </button>
          <button
            className={activePage === "contact" ? "menu-link active" : "menu-link"}
            onClick={() => setActivePage("contact")}
          >
            Contact
          </button>
        </nav>
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
        {activePage === "home" && (
          <section className="intro">
            <div className="intro-text">
              <h1>Solidary Links is a shared protocol for web indexes.</h1>
              <p>
                Build a public index that connects independent sites, or spin up a site that
                lives on your own GitHub account. The protocol is simple, portable, and meant
                to keep link culture alive.
              </p>
              <p>
                Indexes are lightweight and limited on the free tier. Sites are unlimited and
                fully owned by the people who publish them.
              </p>
              <div className="cta-row">
                {!session ? (
                  <button className="primary" onClick={handleGitHubLogin}>
                    Get started
                  </button>
                ) : (
                  <button className="primary" onClick={handleJumpToStudio}>
                    Go to studio
                  </button>
                )}
                <span className="status-text">{session ? "Signed in" : "Signed out"}</span>
              </div>
            </div>
            <div className="intro-panel">
              <div className="panel-block">
                <h2>What is an index?</h2>
                <p>
                  An index is a curated map of sites. On the free plan it is capped to keep
                  the shared database sustainable.
                </p>
              </div>
              <div className="panel-block">
                <h2>What is a site?</h2>
                <p>
                  A site is a static Jekyll page hosted on your GitHub. You keep full control,
                  and the metadata stays portable.
                </p>
              </div>
              <div className="panel-block">
                <h2>Required metadata</h2>
                <p>
                  Each Solidary Link needs a title, image, and description. If any is missing,
                  the link is marked as incomplete.
                </p>
              </div>
            </div>
          </section>
        )}

        {activePage === "contact" && (
          <section className="contact">
            <h1>Contact</h1>
            <p>
              Solidary Links is a slow web project. Send a note with ideas, partnerships, or
              questions.
            </p>
            <p>Contact details are shared upon request.</p>
          </section>
        )}

        {session && activePage === "home" && (
          <section className="studio" id="studio">
            <div className="studio-header">
              <h2>Studio</h2>
              <p>Create an index or spin up a site.</p>
            </div>

            <div className="studio-grid">
              <div className="studio-card">
                <h3>Create an index</h3>
                <p>Free indexes have a cap on sites to protect the shared Postgres instance.</p>
                <form onSubmit={handleCreateIndex} className="form-grid">
                  <label>
                    Index title
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      placeholder="Mutual Aid Index"
                    />
                  </label>
                  <label>
                    Index slug
                    <input
                      value={draftSlug}
                      onChange={(event) => setDraftSlug(event.target.value)}
                      placeholder="mutual-aid-index"
                    />
                    <span className="helper">Final: {computedSlug || "—"}</span>
                  </label>
                  <button className="primary" type="submit" disabled={loading || !session}>
                    {loading ? "Saving..." : "Create index"}
                  </button>
                </form>
              </div>

              <div className="studio-card">
                <h3>Create a site</h3>
                <p>
                  Provide the three required metadata fields. You can edit the site later,
                  but these values define the Solidary Link.
                </p>
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
                    Image URL
                    <input
                      value={siteImage}
                      onChange={(event) => setSiteImage(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={siteDescription}
                      onChange={(event) => setSiteDescription(event.target.value)}
                      placeholder="Short description"
                      rows={4}
                    />
                  </label>
                  <button className="primary" type="submit" disabled={!session || siteLoading}>
                    {siteLoading ? "Saving..." : "Save site details"}
                  </button>
                </form>
                {siteDraft && (
                  <div className="starter-block">
                    <p>
                      Download a Jekyll starter with your metadata. Upload it to GitHub Pages
                      and you will have a live site.
                    </p>
                    <button
                      className="ghost"
                      type="button"
                      onClick={handleDownloadStarter}
                      disabled={downloadLoading}
                    >
                      {downloadLoading ? "Preparing..." : "Download Jekyll starter"}
                    </button>
                  </div>
                )}
              </div>

              <div className="studio-card">
                <h3>Your indexes</h3>
                {!session && <p>Sign in to see your indexes.</p>}
                {session && loading && <p>Loading indexes...</p>}
                {session && !loading && indexes.length === 0 && (
                  <p>You have not created an index yet.</p>
                )}
                {indexes.length > 0 && (
                  <ul className="item-list">
                    {indexes.map((index) => (
                      <li key={index.id}>
                        <div>
                          <strong>{index.title}</strong>
                          <span>/{index.slug}</span>
                        </div>
                        <small>{new Date(index.created_at).toLocaleDateString()}</small>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedIndexId && (
                  <p className="helper">Active index: {selectedIndexId}</p>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div>Solidary Links Protocol · v1.0</div>
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
