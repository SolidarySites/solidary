import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import type { NoticeKind } from "../../../types/notice";
import type { DeleteMode, DraftItem } from "../services/studio-types";

type UseStudioDraftActionsParams = {
  session: Session | null;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
  setOwnedDraftItems: Dispatch<SetStateAction<DraftItem[]>>;
};

export const useStudioDraftActions = ({
  session,
  setNotice,
  setNoticeKind,
  setOwnedDraftItems
}: UseStudioDraftActionsParams) => {
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
    deleteDraft
  };
};
