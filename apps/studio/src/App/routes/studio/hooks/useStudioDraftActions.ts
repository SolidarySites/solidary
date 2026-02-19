import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import type { NoticeKind } from "../../../types/notice";
import type { DeleteMode, DraftItem, PullRequestItem } from "../services/studio-types";

type UseStudioDraftActionsParams = {
  session: Session | null;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
  setOwnedDraftItems: Dispatch<SetStateAction<DraftItem[]>>;
  setPendingPullRequests: Dispatch<SetStateAction<PullRequestItem[]>>;
};

export const useStudioDraftActions = ({
  session,
  setNotice,
  setNoticeKind,
  setOwnedDraftItems,
  setPendingPullRequests
}: UseStudioDraftActionsParams) => {
  const [mergingPullRequestId, setMergingPullRequestId] = useState<string | null>(null);

  const mergePullRequest = async (item: PullRequestItem) => {
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

  const deleteDraft = async (
    item: { id: string; repoFullName: string },
    mode: DeleteMode
  ) => {
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

  return {
    mergingPullRequestId,
    mergePullRequest,
    deleteDraft
  };
};
