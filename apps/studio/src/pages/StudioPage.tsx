import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import SitesListSection from "../components/studio/SitesListSection";
import IndexesListSection from "../components/studio/IndexesListSection";
import DeleteSiteDialog from "../components/studio/DeleteSiteDialog";
import CollaborationPullRequestsSection from "../components/studio/CollaborationPullRequestsSection";
import type { NoticeKind, RepoFileSet } from "../studio/types";
import { parseSolidaryJson } from "../studio/utils";

type DraftItem = {
  id: string;
  site_id?: string;
  repo_full_name: string;
  branch: string;
  files: RepoFileSet;
  owner_user_id: string;
  access_role: "owner" | "admin" | "editor" | "viewer";
  updated_at?: string;
};

type PullRequestItem = {
  id: string;
  siteId: string;
  siteTitle: string;
  repoFullName: string;
  prNumber: number;
  prUrl: string;
  updatedAt?: string;
  editorUserId: string;
  touchedSections: string[];
  touchedPageSlugs: string[];
};

const findSolidary = (files: RepoFileSet) => {
  return (
    files["public/.well-known/solidary-links.json"] ??
    files[".well-known/solidary-links.json"] ??
    files["solidary"] ??
    ""
  );
};

export default function StudioPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);

  const [ownedDraftItems, setOwnedDraftItems] = useState<DraftItem[]>([]);
  const [sharedDraftItems, setSharedDraftItems] = useState<DraftItem[]>([]);
  const [pendingPullRequests, setPendingPullRequests] = useState<PullRequestItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [mergingPullRequestId, setMergingPullRequestId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    repoFullName: string;
    title: string;
  } | null>(null);
  const [deleteMode, setDeleteMode] = useState<"builder" | "github" | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

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
      setOwnedDraftItems([]);
      setSharedDraftItems([]);
      setPendingPullRequests([]);
      return;
    }

    let mounted = true;
    const loadDrafts = async () => {
      setDraftsLoading(true);
      try {
        const { data: ownedData, error: ownedError } = await supabase
          .from("site_drafts")
          .select("id, site_id, repo_full_name, branch, files, updated_at, owner_user_id")
          .eq("owner_user_id", session.user.id)
          .eq("draft_type", "owner")
          .order("updated_at", { ascending: false });

        if (!mounted) return;
        if (ownedError) {
          setNotice(ownedError.message);
          setNoticeKind("error");
          return;
        }

        const ownedItems = (ownedData ?? []).map((row) => ({
          id: (row.site_id as string | null) ?? row.id,
          site_id: (row.site_id as string | null) ?? row.id,
          repo_full_name: row.repo_full_name,
          branch: row.branch,
          files: row.files as RepoFileSet,
          owner_user_id: row.owner_user_id,
          access_role: "owner" as const,
          updated_at: row.updated_at
        }));
        setOwnedDraftItems(ownedItems);

        const { data: collaboratorMemberships, error: collaboratorError } = await supabase
          .from("site_admins")
          .select("site_id, role")
          .eq("user_id", session.user.id);

        if (!mounted) return;
        if (collaboratorError) {
          setNotice(collaboratorError.message);
          setNoticeKind("error");
          return;
        }

        const sharedMemberships = (collaboratorMemberships ?? []).filter((membership) =>
          membership.role === "admin" ||
          membership.role === "editor" ||
          membership.role === "viewer"
        );
        const providerToken = (session as { provider_token?: string } | null)?.provider_token?.trim() ?? "";
        let resolvedSharedMemberships = sharedMemberships;

        if (providerToken) {
          const adminMemberships = sharedMemberships.filter((membership) => membership.role === "admin");
          if (adminMemberships.length) {
            const syncResults = await Promise.all(
              adminMemberships.map(async (membership) => {
                try {
                  const response = await fetch("/.netlify/functions/sync-admin-role-from-github", {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                      siteId: membership.site_id,
                      githubToken: providerToken
                    })
                  });
                  const payload = (await response.json().catch(() => ({}))) as {
                    role?: "admin" | "editor" | "viewer" | null;
                    demoted?: boolean;
                  };
                  if (!response.ok) {
                    return membership;
                  }
                  if (payload.demoted && payload.role === "editor") {
                    return {
                      ...membership,
                      role: "editor" as const
                    };
                  }
                  return membership;
                } catch {
                  return membership;
                }
              })
            );

            const roleOverrideBySiteId = new Map<string, "admin" | "editor" | "viewer">();
            syncResults.forEach((entry) => {
              if (entry.role === "admin" || entry.role === "editor" || entry.role === "viewer") {
                roleOverrideBySiteId.set(entry.site_id, entry.role);
              }
            });
            resolvedSharedMemberships = sharedMemberships.map((membership) => ({
              ...membership,
              role: roleOverrideBySiteId.get(membership.site_id) ?? membership.role
            }));
          }
        }

        const ownedDraftIds = new Set(ownedItems.map((item) => item.id));
        const sharedDraftIds = Array.from(
          new Set(
            resolvedSharedMemberships
              .map((membership) => membership.site_id)
              .filter((siteId) => !ownedDraftIds.has(siteId))
          )
        );

        const roleBySiteId = new Map<string, "admin" | "editor" | "viewer">();
        resolvedSharedMemberships.forEach((membership) => {
          if (membership.role === "admin" || membership.role === "editor" || membership.role === "viewer") {
            roleBySiteId.set(membership.site_id, membership.role);
          }
        });

        let sharedData: Array<{
          id: string;
          site_id: string | null;
          repo_full_name: string;
          branch: string;
          files: RepoFileSet;
          owner_user_id: string;
          updated_at?: string;
        }> = [];
        if (sharedDraftIds.length) {
          const { data, error: sharedError } = await supabase
            .from("site_drafts")
            .select("id, site_id, repo_full_name, branch, files, updated_at, owner_user_id")
            .in("site_id", sharedDraftIds)
            .eq("draft_type", "owner")
            .order("updated_at", { ascending: false });

          if (!mounted) return;
          if (sharedError) {
            setNotice(sharedError.message);
            setNoticeKind("error");
            return;
          }
          sharedData = (data ?? []) as typeof sharedData;
        }

        const mappedSharedItems = (sharedData ?? []).map((row) => ({
          id: (row.site_id as string | null) ?? row.id,
          site_id: (row.site_id as string | null) ?? row.id,
          repo_full_name: row.repo_full_name,
          branch: row.branch,
          files: row.files as RepoFileSet,
          owner_user_id: row.owner_user_id,
          access_role: roleBySiteId.get((row.site_id as string | null) ?? row.id) ?? "viewer",
          updated_at: row.updated_at
        }));
        setSharedDraftItems(mappedSharedItems);

        const managedSiteIds = Array.from(
          new Set([
            ...ownedItems.map((item) => item.id),
            ...resolvedSharedMemberships
              .filter((membership) => membership.role === "admin")
              .map((membership) => membership.site_id)
          ])
        );

        if (!managedSiteIds.length) {
          setPendingPullRequests([]);
          return;
        }

        const { data: prData, error: prError } = await supabase
          .from("site_collaboration_pull_requests")
          .select(
            "id, site_id, repo_full_name, github_pr_number, github_pr_url, updated_at, editor_user_id, touched_sections, touched_page_slugs"
          )
          .in("site_id", managedSiteIds)
          .eq("status", "open")
          .order("updated_at", { ascending: false });

        if (!mounted) return;
        if (prError) {
          setNotice(prError.message);
          setNoticeKind("error");
          setPendingPullRequests([]);
          return;
        }

        const siteTitleById = new Map<string, string>();
        ownedItems.forEach((item) => {
          const solidary = parseSolidaryJson(findSolidary(item.files));
          siteTitleById.set(item.id, solidary?.title ?? item.repo_full_name);
        });
        mappedSharedItems.forEach((item) => {
          const solidary = parseSolidaryJson(findSolidary(item.files));
          siteTitleById.set(item.id, solidary?.title ?? item.repo_full_name);
        });

        setPendingPullRequests(
          (prData ?? []).map((row) => ({
            id: row.id,
            siteId: row.site_id,
            siteTitle: siteTitleById.get(row.site_id) ?? row.repo_full_name,
            repoFullName: row.repo_full_name,
            prNumber: row.github_pr_number,
            prUrl: row.github_pr_url,
            updatedAt: row.updated_at,
            editorUserId: row.editor_user_id,
            touchedSections: Array.isArray(row.touched_sections)
              ? row.touched_sections.filter((entry): entry is string => typeof entry === "string")
              : [],
            touchedPageSlugs: Array.isArray(row.touched_page_slugs)
              ? row.touched_page_slugs.filter((entry): entry is string => typeof entry === "string")
              : []
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

  const handleGitHubLogin = async () => {
    setNotice(null);
    setNoticeKind(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
        scopes: "repo delete_repo workflow"
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

  const handleMergePullRequest = async (item: PullRequestItem) => {
    if (!session) return;

    const providerToken = (session as { provider_token?: string } | null)?.provider_token?.trim() ?? "";
    if (!providerToken) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    setMergingPullRequestId(item.id);
    try {
      const response = await fetch("/.netlify/functions/github-merge-collaboration-pr", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          siteId: item.siteId,
          pullRequestNumber: item.prNumber,
          githubToken: providerToken,
          commitTitle: `Merge collaboration PR #${item.prNumber}`
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to merge collaboration pull request.");
      }

      setPendingPullRequests((items) => items.filter((entry) => entry.id !== item.id));
      setNotice(`Merged PR #${item.prNumber}.`);
      setNoticeKind("notice");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to merge collaboration pull request.");
      setNoticeKind("error");
    } finally {
      setMergingPullRequestId(null);
    }
  };

  const handleDeleteDraft = async (item: { id: string; repoFullName: string }, mode: "builder" | "github") => {
    if (!session) return;

    if (mode === "builder") {
      const { error } = await supabase.from("sites").delete().eq("id", item.id);
      if (error) {
        setNotice(error.message);
        setNoticeKind("error");
        return;
      }
      setOwnedDraftItems((items) => items.filter((entry) => entry.id !== item.id));
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
      await fetch("/.netlify/functions/github-delete-repo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: providerToken,
          owner,
          repo,
          supabase_access_token: session.access_token
        })
      }).then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "Failed to delete GitHub repo.");
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete GitHub repo.";
      setNotice(message);
      setNoticeKind("error");
      return;
    }

    const { error } = await supabase.from("sites").delete().eq("id", item.id);
    if (error) {
      setNotice(error.message);
      setNoticeKind("error");
      return;
    }
    setOwnedDraftItems((items) => items.filter((entry) => entry.id !== item.id));
  };

  const ownedListItems = useMemo(
    () =>
      ownedDraftItems.map((item) => {
        const solidary = parseSolidaryJson(findSolidary(item.files));
        return {
          id: item.id,
          title: solidary?.title ?? item.repo_full_name,
          description: solidary?.description ?? "",
          repoFullName: item.repo_full_name,
          repoHtmlUrl: `https://github.com/${item.repo_full_name}`,
          siteUrl: solidary?.site_url ?? "",
          accessRole: "owner" as const,
          updatedAt: item.updated_at
        };
      }),
    [ownedDraftItems]
  );

  const sharedListItems = useMemo(
    () =>
      sharedDraftItems.map((item) => {
        const solidary = parseSolidaryJson(findSolidary(item.files));
        return {
          id: item.id,
          title: solidary?.title ?? item.repo_full_name,
          description: solidary?.description ?? "",
          repoFullName: item.repo_full_name,
          repoHtmlUrl: `https://github.com/${item.repo_full_name}`,
          siteUrl: solidary?.site_url ?? "",
          accessRole: item.access_role,
          updatedAt: item.updated_at
        };
      }),
    [sharedDraftItems]
  );

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
            title="Your sites"
            emptyMessage="No saved sites yet. Create one to see it here."
            items={ownedListItems}
            loading={draftsLoading}
            onEdit={(id) => navigate(`/site-builder?draftId=${id}`)}
            onCreate={() => navigate("/site-create")}
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

        {session && (
          <SitesListSection
            title="Shared with you"
            emptyMessage="No collaborator sites yet."
            items={sharedListItems}
            loading={draftsLoading}
            onEdit={(id) => navigate(`/site-builder?draftId=${id}`)}
          />
        )}

        {session && (
          <CollaborationPullRequestsSection
            items={pendingPullRequests}
            loading={draftsLoading}
            mergingId={mergingPullRequestId}
            onMerge={(item) => {
              void handleMergePullRequest(item);
            }}
          />
        )}

        {session && <IndexesListSection onCreate={() => navigate("/site-create")} />}
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
            await handleDeleteDraft({
              id: deleteTarget.id,
              repoFullName: deleteTarget.repoFullName
            }, deleteMode);
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
