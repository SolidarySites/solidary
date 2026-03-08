import { useEffect, useState } from "react";
import { requireFreshGithubAuth } from "../../../../../../features/auth/services/github-auth";
import { supabase, supabaseFunctionUrl } from "../../../../../../lib/supabase";
import type { UseSiteBuilderLiveSettingsActionsOptions } from "./types";
import { resolveRepoCoordinates } from "./shared";
import type { SiteDeleteMode } from "./types";

type UseLiveSettingsDeleteActionsOptions = Pick<
  UseSiteBuilderLiveSettingsActionsOptions,
  | "session"
  | "draftState"
  | "canDeleteSite"
  | "deleteSiteRepoFullName"
  | "setNotice"
  | "setNoticeKind"
  | "navigate"
>;

export const useLiveSettingsDeleteActions = ({
  session,
  draftState,
  canDeleteSite,
  deleteSiteRepoFullName,
  setNotice,
  setNoticeKind,
  navigate
}: UseLiveSettingsDeleteActionsOptions) => {
  const [deleteMode, setDeleteMode] = useState<SiteDeleteMode | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setDeleteMode(null);
    setDeleteConfirmText("");
    setDeleteBusy(false);
  }, [draftState?.siteId]);

  const handleDeleteSite = async () => {
    if (!session || !canDeleteSite || !draftState?.siteId || !deleteMode) return;

    const selectedDeleteMode = deleteMode;
    const siteId = draftState.siteId;
    const repoFullName = deleteSiteRepoFullName;

    if (selectedDeleteMode === "github" && deleteConfirmText.trim() !== repoFullName) {
      setNotice("Repo name did not match. Deletion cancelled.");
      setNoticeKind("notice");
      return;
    }

    setDeleteBusy(true);

    try {
      if (selectedDeleteMode === "github") {
        let owner: string;
        let repo: string;
        try {
          const coordinates = resolveRepoCoordinates(repoFullName);
          owner = coordinates.owner;
          repo = coordinates.repo;
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "Invalid repo name.";
          setNotice(message);
          setNoticeKind("error");
          return;
        }

        let freshAuth;
        try {
          freshAuth = await requireFreshGithubAuth();
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Sign in with GitHub to continue.";
          setNotice(message);
          setNoticeKind("error");
          return;
        }

        try {
          await fetch(supabaseFunctionUrl("github-delete-repo"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              owner,
              repo,
              supabase_access_token: freshAuth.supabaseAccessToken
            })
          }).then(async (response) => {
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}));
              throw new Error(payload?.error ?? "Failed to delete GitHub repo.");
            }
          });
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Failed to delete GitHub repo.";
          setNotice(message);
          setNoticeKind("error");
          return;
        }
      }

      const { error } = await supabase.from("sites").delete().eq("id", siteId);
      if (error) {
        setNotice(error.message);
        setNoticeKind("error");
        return;
      }

      setDeleteMode(null);
      setDeleteConfirmText("");
      setNotice(
        selectedDeleteMode === "github"
          ? "Deleted site from builder and GitHub."
          : "Deleted site from builder."
      );
      setNoticeKind("notice");
      navigate("/studio");
    } finally {
      setDeleteBusy(false);
    }
  };

  return {
    deleteMode,
    setDeleteMode,
    deleteConfirmText,
    setDeleteConfirmText,
    deleteBusy,
    handleDeleteSite
  };
};
