import { supabase } from "../../../../../lib/supabase";
import type { DraftState } from "./types";

type DraftPublishPendingRpcRow = {
  has_publish_pending_changes?: boolean | null;
  revision?: number | null;
  last_edited_at?: string | null;
  last_edited_by_user_id?: string | null;
};

export type DraftPublishPendingResult = {
  hasPublishPendingChanges: boolean;
  revision: number | null;
  lastEditedAt: string | null;
  lastEditedByUserId: string | null;
};

export const setDraftPublishPending = async (
  draftId: string,
  pending: boolean
): Promise<DraftPublishPendingResult> => {
  const { data, error } = await supabase.rpc("site_draft_set_publish_pending", {
    p_draft_id: draftId,
    p_pending: pending
  });
  if (error) {
    throw new Error(error.message);
  }

  const row = (Array.isArray(data) ? data[0] : data) as DraftPublishPendingRpcRow | null | undefined;

  return {
    hasPublishPendingChanges:
      typeof row?.has_publish_pending_changes === "boolean"
        ? row.has_publish_pending_changes
        : pending,
    revision: typeof row?.revision === "number" ? row.revision : null,
    lastEditedAt: typeof row?.last_edited_at === "string" ? row.last_edited_at : null,
    lastEditedByUserId:
      typeof row?.last_edited_by_user_id === "string" ? row.last_edited_by_user_id : null
  };
};

export const applyDraftPublishPendingResult = (
  current: DraftState | null,
  result: DraftPublishPendingResult
): DraftState | null => {
  if (!current) return current;

  return {
    ...current,
    hasPublishPendingChanges: result.hasPublishPendingChanges,
    revision: typeof result.revision === "number" ? result.revision : current.revision,
    lastEditedAt: result.lastEditedAt ?? (current.lastEditedAt ?? null),
    lastEditedByUserId: result.lastEditedByUserId ?? (current.lastEditedByUserId ?? null)
  };
};
