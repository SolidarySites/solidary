import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import "./App.css";
import templateIndex from "./templates/jekyll/index.md?raw";
import templateConfig from "./templates/jekyll/_config.yml?raw";
import templateSolidary from "./templates/jekyll/.well-known/solidary-links.json?raw";

type Flow = "choose" | "site" | "index" | "provisioning" | "editor";

type NoticeKind = "error" | "notice" | null;

type SiteDraft = {
  id: string;
  title: string;
  imageUrl: string;
  imagePath: string;
  description: string;
  slug: string;
  repoFullName: string;
  repoHtmlUrl: string;
  defaultBranch: string;
  siteUrl: string;
  siteUrlRoot: string;
  baseUrl: string;
};

type RepoFileSet = {
  index: string;
  config: string;
  solidary: string;
  readme: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function htmlFromIndexMarkdown(markdown: string) {
  const split = markdown.split("---");
  if (split.length < 3) return markdown;
  return split.slice(2).join("---").trim();
}

function buildIndexMarkdown(html: string) {
  return `---\nlayout: default\ntitle: Home\n---\n\n${html.trim()}\n`;
}

function toBase64(data: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(data);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function githubRequest<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? "GitHub request failed.");
  }

  return payload as T;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [flow, setFlow] = useState<Flow>("choose");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [provisionStep, setProvisionStep] = useState("Preparing your site...");

  const [siteTitle, setSiteTitle] = useState("");
  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [siteDescription, setSiteDescription] = useState("");
  const [siteLoading, setSiteLoading] = useState(false);
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [repoFiles, setRepoFiles] = useState<RepoFileSet | null>(null);
  const [contentHtml, setContentHtml] = useState<string>("");
  const editorRef = useRef<HTMLDivElement | null>(null);

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
        scopes: "repo"
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

    const providerToken = (session as { provider_token?: string }).provider_token;
    if (!providerToken) {
      setNotice("GitHub token missing. Please sign in again.");
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
    const slug = computedSlug || `site-${Date.now()}`;
    const imagePath = `assets/images/sl-image-${slug}.jpg`;
    const imageUrl = `/${imagePath}`;
    const siteId = crypto.randomUUID();

    setSiteLoading(true);
    setFlow("provisioning");

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
        description: normalizedDescription,
        private: false
      });

      const repo = repoResponse.repo;
      const ownerLogin = repo.owner.login;
      const pagesRootUrl = `https://${ownerLogin}.github.io`;
      const isUserSite = repo.name.toLowerCase() === `${ownerLogin.toLowerCase()}.github.io`;
      const baseUrl = isUserSite ? "" : `/${repo.name}`;
      const initialSiteUrl = isUserSite ? pagesRootUrl : `${pagesRootUrl}${baseUrl}`;

      const draft: SiteDraft = {
        id: siteId,
        title: normalizedTitle,
        description: normalizedDescription,
        imagePath,
        imageUrl,
        slug,
        repoFullName: repo.full_name,
        repoHtmlUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        siteUrl: initialSiteUrl,
        siteUrlRoot: pagesRootUrl,
        baseUrl
      };

      setProvisionStep("Uploading starter files...");
      const imageBase64 = toBase64(await siteImage.arrayBuffer());
      await githubRequest("/.netlify/functions/github-contents-write", {
        token: providerToken,
        owner: ownerLogin,
        repo: repo.name,
        path: imagePath,
        message: "Add site header image",
        content: imageBase64,
        branch: repo.default_branch
      });

      const indexHtml = renderTemplate(templateIndex, draft);
      const indexMarkdown = buildIndexMarkdown(indexHtml);
      const rawConfigContent = renderTemplate(templateConfig, draft);
      const configContent = rawConfigContent
        .replace(/^baseurl:.*$/m, `baseurl: "${draft.baseUrl}"`)
        .replace(/^url:.*$/m, `url: "${draft.siteUrlRoot}"`);

      await writeTextFile(providerToken, ownerLogin, repo.name, "index.md", indexMarkdown, repo.default_branch);
      await writeTextFile(providerToken, ownerLogin, repo.name, "_config.yml", configContent, repo.default_branch);

      setProvisionStep("Enabling GitHub Pages...");
      let siteUrl = initialSiteUrl;
      try {
        const enableResponse = await githubRequest<{ pagesUrl?: string }>(
          "/.netlify/functions/github-enable-pages",
          {
            token: providerToken,
            owner: ownerLogin,
            repo: repo.name,
            branch: repo.default_branch
          }
        );
        if (enableResponse?.pagesUrl) {
          siteUrl = enableResponse.pagesUrl;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to enable GitHub Pages.";
        const isBranchPending = message.toLowerCase().includes("branch must exist");
        setNotice(
          isBranchPending
            ? "GitHub Pages is still provisioning. We'll keep going, but you may need to retry in a minute."
            : `GitHub Pages couldn't be enabled yet: ${message}`
        );
        setNoticeKind(isBranchPending ? "notice" : "error");
      }

      setProvisionStep("Saving site metadata...");
      const { error: siteInsertError } = await supabase.from("sites").insert({
        id: siteId,
        canonical_url: siteUrl,
        title: normalizedTitle,
        description: normalizedDescription,
        image_url: imageUrl,
        meta: {
          completion: "complete",
          source: "studio"
        }
      });

      if (siteInsertError) {
        throw new Error(siteInsertError.message);
      }

      const finalizedDraft: SiteDraft = {
        ...draft,
        siteUrl
      };

      const solidaryContent = renderTemplate(templateSolidary, finalizedDraft);
      await writeTextFile(
        providerToken,
        ownerLogin,
        repo.name,
        ".well-known/solidary-links.json",
        solidaryContent,
        repo.default_branch
      );

      setProvisionStep("Fetching repo content...");
      const [indexFile, configFile, solidaryFile, readmeFile] = await Promise.all([
        readTextFile(providerToken, ownerLogin, repo.name, "index.md", repo.default_branch),
        readTextFile(providerToken, ownerLogin, repo.name, "_config.yml", repo.default_branch),
        readTextFile(providerToken, ownerLogin, repo.name, ".well-known/solidary-links.json", repo.default_branch),
        readTextFile(providerToken, ownerLogin, repo.name, "README.md", repo.default_branch, true)
      ]);

      const files: RepoFileSet = {
        index: indexFile ?? indexMarkdown,
        config: configFile ?? configContent,
        solidary: solidaryFile ?? solidaryContent,
        readme: readmeFile ?? ""
      };

      const branchInfo = await githubRequest<{ sha: string }>("/.netlify/functions/github-branch", {
        token: providerToken,
        owner: repo.owner.login,
        repo: repo.name,
        branch: repo.default_branch
      });

      await supabase.from("site_drafts").upsert(
        {
          owner_user_id: session.user.id,
          repo_full_name: repo.full_name,
          branch: repo.default_branch,
          commit_sha: branchInfo.sha,
          files
        },
        { onConflict: "owner_user_id,repo_full_name" }
      );

      setSiteDraft(finalizedDraft);
      setRepoFiles(files);
      setContentHtml(htmlFromIndexMarkdown(files.index));
      setFlow("editor");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      setNotice(message);
      setNoticeKind("error");
      setFlow("site");
    } finally {
      setSiteLoading(false);
    }
  };

  const renderTemplate = (template: string, site: SiteDraft) =>
    template
      .replaceAll("{{SITE_ID}}", site.id)
      .replaceAll("{{TITLE}}", site.title)
      .replaceAll("{{IMAGE_URL}}", site.imageUrl)
      .replaceAll("{{IMAGE_PATH}}", site.imagePath)
      .replaceAll("{{DESCRIPTION}}", site.description)
      .replaceAll("{{SITE_URL}}", site.siteUrl)
      .replaceAll("{{SITE_URL_ROOT}}", site.siteUrlRoot)
      .replaceAll("{{BASEURL}}", site.baseUrl);

  const readTextFile = async (
    token: string,
    owner: string,
    repo: string,
    path: string,
    branch: string,
    allowMissing = false
  ) => {
    try {
      const result = await githubRequest<{ content: string; encoding: string }>(
        "/.netlify/functions/github-contents-read",
        { token, owner, repo, path, branch }
      );
      if (result?.encoding === "base64") {
        return atob(result.content.replace(/\n/g, ""));
      }
      return result.content ?? "";
    } catch (error) {
      if (allowMissing) return null;
      throw error;
    }
  };

  const writeTextFile = async (
    token: string,
    owner: string,
    repo: string,
    path: string,
    content: string,
    branch: string
  ) => {
    let sha: string | undefined;
    try {
      const existing = await githubRequest<{ sha: string }>(
        "/.netlify/functions/github-contents-read",
        { token, owner, repo, path, branch }
      );
      sha = existing.sha;
    } catch {
      sha = undefined;
    }

    await githubRequest("/.netlify/functions/github-contents-write", {
      token,
      owner,
      repo,
      path,
      message: `Update ${path}`,
      content: toBase64(new TextEncoder().encode(content).buffer),
      sha,
      branch
    });
  };

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    setContentHtml(editorRef.current.innerHTML);
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleEditorInput();
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

        {flow === "provisioning" && (
          <section className="provisioning">
            <div className="spinner" />
            <h2>Setting up your site</h2>
            <p>{provisionStep}</p>
          </section>
        )}

        {flow === "editor" && siteDraft && (
          <section className="editor">
            <div className="section-header">
              <h2>Site editor</h2>
              <p>Editing {siteDraft.repoFullName}</p>
            </div>
            <div className="editor-toolbar">
              <button type="button" className="ghost" onClick={() => execCommand("bold")}>
                Bold
              </button>
              <button type="button" className="ghost" onClick={() => execCommand("italic")}>
                Italic
              </button>
              <button type="button" className="ghost" onClick={() => execCommand("insertUnorderedList")}>
                List
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const url = window.prompt("Link URL");
                  if (url) execCommand("createLink", url);
                }}
              >
                Link
              </button>
            </div>
            <div className="editor-shell">
              <div
                ref={editorRef}
                className="editor-canvas"
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            </div>
            <div className="editor-actions">
              <button className="primary" disabled>
                Push changes (coming soon)
              </button>
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
            {repoFiles && (
              <div className="editor-meta">
                <div>Config: {repoFiles.config.length} chars</div>
                <div>Solidary link: {repoFiles.solidary.length} chars</div>
              </div>
            )}
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
