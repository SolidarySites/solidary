import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { supabaseFunctionUrl } from "../../../../../../../lib/supabase";
import type { NoticeKind } from "../../../../../../../types/notice";
import { normalizeSitePath } from "../../../services/draft-utils";
import {
  applyDraftPublishPendingResult,
  setDraftPublishPending
} from "../../../services/publish-pending";
import type { DraftImageAsset, DraftState, PublishFeedback } from "../../../services/types";

type UsePublishedDraftCleanupEffectOptions = {
  draftState: DraftState | null;
  publishedSiteBaseUrl: string | null;
  publishFeedback: PublishFeedback | null;
  sessionAccessToken: string | null;
  setDraftState: Dispatch<SetStateAction<DraftState | null>>;
  setDraftImages: Dispatch<SetStateAction<DraftImageAsset[]>>;
  cleanedPublishedDraftIdRef: MutableRefObject<string | null>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
};

export const usePublishedDraftCleanupEffect = ({
  draftState,
  publishedSiteBaseUrl,
  publishFeedback,
  sessionAccessToken,
  setDraftState,
  setDraftImages,
  cleanedPublishedDraftIdRef,
  setNotice,
  setNoticeKind
}: UsePublishedDraftCleanupEffectOptions) => {
  useEffect(() => {
    if (publishFeedback?.kind !== "success") return;
    if (!draftState?.id) return;
    if (draftState.draftType !== "owner") return;
    if (cleanedPublishedDraftIdRef.current === draftState.id) return;

    void (async () => {
      if (draftState.hasPublishPendingChanges) {
        try {
          const pendingState = await setDraftPublishPending(draftState.id, false);
          setDraftState((current: DraftState | null) =>
            applyDraftPublishPendingResult(current, pendingState)
          );
        } catch (error) {
          console.warn("[publish] Failed to clear publish pending state after deployment.", error);
        }
      }

      const normalizedPublishedBaseUrl = (publishedSiteBaseUrl ?? "").trim().replace(/\/+$/, "");
      if (!normalizedPublishedBaseUrl) {
        setNotice("Site is live, but image cleanup skipped: missing published site URL.");
        setNoticeKind("error");
        return;
      }

      const response = await fetch(supabaseFunctionUrl("cleanup-draft-images"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(sessionAccessToken ? { Authorization: `Bearer ${sessionAccessToken}` } : {})
        },
        body: JSON.stringify({
          draftId: draftState.id,
          publishedSiteBaseUrl: normalizedPublishedBaseUrl
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : "Cleanup request failed.";
        setNotice(`Site is live, but image cleanup failed: ${errorMessage}`);
        setNoticeKind("error");
        return;
      }

      cleanedPublishedDraftIdRef.current = draftState.id;

      const updatedRows = Array.isArray(payload?.updated) ? payload.updated : [];
      if (!updatedRows.length) return;

      const byId = new Map<string, { publicUrl: string; sitePath: string }>();
      updatedRows.forEach((row: unknown) => {
        if (!row || typeof row !== "object") return;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : "";
        const publicUrl = typeof record.publicUrl === "string" ? record.publicUrl.trim() : "";
        const sitePath =
          typeof record.sitePath === "string" ? normalizeSitePath(record.sitePath) : "";
        if (!id || !publicUrl || !sitePath) return;
        byId.set(id, { publicUrl, sitePath });
      });

      if (!byId.size) return;

      setDraftImages((current) =>
        current.map((image) => {
          const imageId = typeof image.id === "string" ? image.id : "";
          const updated = imageId ? byId.get(imageId) : null;
          if (!updated) return image;
          return {
            ...image,
            publicUrl: updated.publicUrl,
            sitePath: updated.sitePath
          };
        })
      );
    })();
  }, [
    cleanedPublishedDraftIdRef,
    draftState?.draftType,
    draftState?.hasPublishPendingChanges,
    draftState?.id,
    publishFeedback?.kind,
    publishedSiteBaseUrl,
    sessionAccessToken,
    setDraftImages,
    setDraftState,
    setNotice,
    setNoticeKind
  ]);
};
