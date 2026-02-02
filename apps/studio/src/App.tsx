import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import type { Archive } from "@solidary/protocol";
import "./App.css";

const emptyArchives: Archive[] = [];

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
  const [archives, setArchives] = useState<Archive[]>(emptyArchives);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSlug, setDraftSlug] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

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
      setArchives(emptyArchives);
      setSelectedArchiveId(null);
      return;
    }

    const loadArchives = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("archives")
        .select(
          "id, owner_user_id, slug, title, canonical_url, availability_window_days, default_ui_depth, max_ui_depth, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else if (data) {
        setArchives(data as Archive[]);
        setSelectedArchiveId(data[0]?.id ?? null);
      }

      setLoading(false);
    };

    loadArchives();
  }, [session]);

  const handleGitHubLogin = async () => {
    setError(null);
    const { error: loginError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin
      }
    });

    if (loginError) {
      setError(loginError.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleCreateArchive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;

    const title = draftTitle.trim();
    const slug = computedSlug;
    if (!title || !slug) return;

    setLoading(true);
    setError(null);

    const { data, error: insertError } = await supabase
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

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setArchives((current) => [data as Archive, ...current]);
      setSelectedArchiveId(data.id);
      setDraftTitle("");
      setDraftSlug("");
    }

    setLoading(false);
  };

  const handleIngest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIngestMessage(null);

    if (!selectedArchiveId || !siteUrl.trim()) {
      setError("Select an archive and provide a site URL.");
      return;
    }

    setLoading(true);
    const response = await fetch("/.netlify/functions/ingest-site", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        archive_id: selectedArchiveId,
        site_url: siteUrl.trim()
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload.error ?? "Ingestion failed.");
    } else {
      setIngestMessage(payload.message ?? "Ingestion started.");
      setSiteUrl("");
    }

    setLoading(false);
  };

  return (
    <div className="app-shell">
      <div className="hero-card">
        <span className="eyebrow">Solidary Links Studio</span>
        <h1>
          Build archives that map
          <span>the living web of sites.</span>
        </h1>
        <p>
          Authenticate with GitHub, register an archive, then ingest sites by URL
          to build the shared graph.
        </p>
        <div className="hero-actions">
          {!session ? (
            <button className="primary" onClick={handleGitHubLogin}>
              Sign in with GitHub
            </button>
          ) : (
            <button className="ghost" onClick={handleLogout}>
              Sign out
            </button>
          )}
          <div className="status-pill">
            {session ? "Signed in" : "Signed out"}
          </div>
        </div>
        {!isSupabaseConfigured() && (
          <div className="warning">
            Add <code>VITE_SUPABASE_URL</code> and
            <code>VITE_SUPABASE_ANON_KEY</code> to
            <code>apps/studio/.env</code> before signing in.
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {ingestMessage && <div className="notice">{ingestMessage}</div>}
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>New archive</h2>
          <form onSubmit={handleCreateArchive}>
            <label>
              Title
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Mutual Aid Index"
              />
            </label>
            <label>
              Slug
              <input
                value={draftSlug}
                onChange={(event) => setDraftSlug(event.target.value)}
                placeholder="mutual-aid-index"
              />
              <span className="helper">Final: {computedSlug || "—"}</span>
            </label>
            <button className="primary" type="submit" disabled={!session || loading}>
              {loading ? "Saving..." : "Create archive"}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Ingest site</h2>
          <form onSubmit={handleIngest}>
            <label>
              Archive
              <select
                value={selectedArchiveId ?? ""}
                onChange={(event) => setSelectedArchiveId(event.target.value || null)}
              >
                <option value="">Select archive</option>
                {archives.map((archive) => (
                  <option key={archive.id} value={archive.id}>
                    {archive.title} ({archive.slug})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Site URL
              <input
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <button className="primary" type="submit" disabled={!session || loading}>
              {loading ? "Submitting..." : "Add site"}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Your archives</h2>
          {!session && <p>Sign in to see your archives.</p>}
          {session && loading && <p>Loading archives...</p>}
          {session && !loading && archives.length === 0 && (
            <p>You have not created an archive yet.</p>
          )}
          {archives.length > 0 && (
            <ul>
              {archives.map((archive) => (
                <li key={archive.id}>
                  <div>
                    <strong>{archive.title}</strong>
                    <span>/{archive.slug}</span>
                  </div>
                  <small>{new Date(archive.created_at).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
