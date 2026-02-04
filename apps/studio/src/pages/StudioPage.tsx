import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import templateIndex from "../templates/jekyll/index.md?raw";
import templateConfig from "../templates/jekyll/_config.yml?raw";
import templateSolidary from "../templates/jekyll/.well-known/solidary-links.json?raw";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import ChoiceSection from "../components/studio/ChoiceSection";
import IndexPlaceholderSection from "../components/studio/IndexPlaceholderSection";
import SiteFormSection from "../components/studio/SiteFormSection";
import ProvisioningSection from "../components/studio/ProvisioningSection";
import EditorSection from "../components/studio/EditorSection";
import SitesListSection from "../components/studio/SitesListSection";
import DeleteSiteDialog from "../components/studio/DeleteSiteDialog";
import type { Flow, NoticeKind, RepoFileSet, SiteDraft } from "../studio/types";
import {
  buildIndexMarkdown,
  htmlFromIndexMarkdown,
  parseSolidaryJson,
  renderTemplate,
  slugify,
  toBase64
} from "../studio/utils";
import { githubRequest, readTextFile, writeTextFile } from "../studio/github";

export default function StudioPage() {
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
  const [draftItems, setDraftItems] = useState<
    Array<{
      id: string;
      repo_full_name: string;
      branch: string;
      files: RepoFileSet;
      updated_at?: string;
    }>
  >([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    repoFullName: string;
    title: string;
  } | null>(null);
  const [deleteMode, setDeleteMode] = useState<"builder" | "github" | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
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
    if (!session) {
      setDraftItems([]);
      return;
    }

    let mounted = true;
    const loadDrafts = async () => {
      setDraftsLoading(true);
      try {
        const { data, error } = await supabase
          .from("site_drafts")
          .select("id, repo_full_name, branch, files, updated_at")
          .order("updated_at", { ascending: false });
        if (!mounted) return;
        if (error) {
          setNotice(error.message);
          setNoticeKind("error");
          return;
        }
        setDraftItems(
          (data ?? []).map((row) => ({
            id: row.id,
            repo_full_name: row.repo_full_name,
            branch: row.branch,
            files: row.files as RepoFileSet,
            updated_at: row.updated_at
          }))
        );
      } finally {
        if (mounted) setDraftsLoading(false);
      }
    };

    loadDrafts();

    return () => {
      mounted = false;
    };
  }, [session]);

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

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    setContentHtml(editorRef.current.innerHTML);
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const buildDraftFromFiles = (entry: { repo_full_name: string; branch: string; files: RepoFileSet }) => {
    const solidary = parseSolidaryJson(entry.files.solidary);
    const repoFullName = entry.repo_full_name;
    const repoName = repoFullName.split("/").pop() ?? repoFullName;
    const repoHtmlUrl = `https://github.com/${repoFullName}`;
    const siteUrl = solidary?.site_url ?? "";
    let siteUrlRoot = "";
    let baseUrl = "";
    if (siteUrl) {
      try {
        const url = new URL(siteUrl);
        siteUrlRoot = url.origin;
        baseUrl = url.pathname.replace(/\/$/, "");
      } catch {
        siteUrlRoot = "";
        baseUrl = "";
      }
    }
    const imageUrl = solidary?.image_url ?? "";
    let imagePath = imageUrl;
    if (imageUrl.startsWith("http")) {
      try {
        imagePath = new URL(imageUrl).pathname.replace(/^\//, "");
      } catch {
        imagePath = imageUrl;
      }
    } else {
      imagePath = imageUrl.replace(/^\//, "");
    }

    const draft: SiteDraft = {
      id: solidary?.site_id ?? crypto.randomUUID(),
      title: solidary?.title ?? repoName,
      imageUrl,
      imagePath,
      description: solidary?.description ?? "",
      slug: repoName,
      repoFullName,
      repoHtmlUrl,
      defaultBranch: entry.branch,
      siteUrl,
      siteUrlRoot,
      baseUrl
    };

    return draft;
  };

  const handleEditDraft = (id: string) => {
    const entry = draftItems.find((item) => item.id === id);
    if (!entry) return;
    const draft = buildDraftFromFiles(entry);
    setSiteDraft(draft);
    setRepoFiles(entry.files);
    setContentHtml(htmlFromIndexMarkdown(entry.files.index));
    setFlow("editor");
  };

  const handleDeleteDraft = async (
    item: {
      id: string;
      repoFullName: string;
    },
    mode: "builder" | "github"
  ) => {
    if (!session) return;
    if (mode === "builder") {
      const { error } = await supabase.from("site_drafts").delete().eq("id", item.id);
      if (error) {
        setNotice(error.message);
        setNoticeKind("error");
        return;
      }
      setDraftItems((items) => items.filter((entry) => entry.id !== item.id));
      return;
    }

    const providerToken = (session as { provider_token?: string }).provider_token;
    if (!providerToken) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    const [owner, repo] = item.repoFullName.split("/");
    if (!owner || !repo) {
      setNotice("Invalid repo name. Please try again.");
      setNoticeKind("error");
      return;
    }

    try {
      await githubRequest("/.netlify/functions/github-delete-repo", {
        token: providerToken,
        owner,
        repo,
        supabase_access_token: session.access_token
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete GitHub repo.";
      setNotice(message);
      setNoticeKind("error");
      return;
    }

    const { error } = await supabase.from("site_drafts").delete().eq("id", item.id);
    if (error) {
      setNotice(error.message);
      setNoticeKind("error");
      return;
    }
    setDraftItems((items) => items.filter((entry) => entry.id !== item.id));
  };

  const listItems = draftItems.map((item) => {
    const solidary = parseSolidaryJson(item.files.solidary);
    return {
      id: item.id,
      title: solidary?.title ?? item.repo_full_name,
      description: solidary?.description ?? "",
      repoFullName: item.repo_full_name,
      repoHtmlUrl: `https://github.com/${item.repo_full_name}`,
      siteUrl: solidary?.site_url ?? "",
      updatedAt: item.updated_at
    };
  });

  return (
    <div className="app-shell">
      <SiteHeader
        session={session}
        showAuthActions
        onSignIn={handleGitHubLogin}
        onSignOut={handleLogout}
      />
      <main className="main-content">
        {session && (
          <SitesListSection
            items={listItems}
            loading={draftsLoading}
            onEdit={handleEditDraft}
            onDelete={(item) => {
              setDeleteTarget({
                id: item.id,
                repoFullName: item.repoFullName,
                title: item.title
              });
              setDeleteMode(null);
              setDeleteConfirmText("");
            }}
          />
        )}

        {flow === "choose" && <ChoiceSection onChoose={handleChoose} />}

        {flow === "index" && <IndexPlaceholderSection onBack={() => setFlow("choose")} />}

        {flow === "site" && (
          <SiteFormSection
            siteTitle={siteTitle}
            siteImagePreview={siteImagePreview}
            siteDescription={siteDescription}
            siteLoading={siteLoading}
            onTitleChange={setSiteTitle}
            onImageChange={setSiteImage}
            onDescriptionChange={setSiteDescription}
            onSubmit={handleCreateSite}
            onBack={() => setFlow("choose")}
          />
        )}

        {flow === "provisioning" && <ProvisioningSection step={provisionStep} />}

        {flow === "editor" && siteDraft && (
          <EditorSection
            siteDraft={siteDraft}
            repoFiles={repoFiles}
            contentHtml={contentHtml}
            editorRef={editorRef}
            onInput={handleEditorInput}
            onExecCommand={execCommand}
          />
        )}
      </main>

      <SiteFooter notice={notice} noticeKind={noticeKind} />

      <DeleteSiteDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.title ?? ""}
        repoFullName={deleteTarget?.repoFullName ?? ""}
        mode={deleteMode}
        confirmText={deleteConfirmText}
        busy={deleteBusy}
        onModeChange={setDeleteMode}
        onConfirmTextChange={setDeleteConfirmText}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
          setDeleteMode(null);
          setDeleteConfirmText("");
        }}
        onConfirm={async () => {
          if (!deleteTarget || !deleteMode) return;
          if (deleteMode === "github" && deleteConfirmText.trim() !== deleteTarget.repoFullName) {
            setNotice("Repo name did not match. Deletion cancelled.");
            setNoticeKind("notice");
            return;
          }
          setDeleteBusy(true);
          try {
            await handleDeleteDraft(
              { id: deleteTarget.id, repoFullName: deleteTarget.repoFullName },
              deleteMode
            );
            setDeleteTarget(null);
            setDeleteMode(null);
            setDeleteConfirmText("");
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
    </div>
  );
}
