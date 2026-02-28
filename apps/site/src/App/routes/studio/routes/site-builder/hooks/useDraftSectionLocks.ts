import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../../../../../lib/supabase";
import { isSupportedLockKey, type SectionLockAcquireResult, type SectionLockRecord } from "../services/locks";

type DraftSectionLockScope = "builder" | "settings";

type SectionLockListRow = {
  section_key?: string | null;
  locked_by_user_id?: string | null;
  locked_by_name?: string | null;
  locked_by_avatar_url?: string | null;
  updated_at?: string | null;
};

type UseDraftSectionLocksParams = {
  draftId: string | null | undefined;
  sessionUserId: string | null;
  canEditDraft: boolean;
  sessionDisplayName: string;
  sessionAvatarUrl: string | null;
  activeLockKey: string | null;
  scope: DraftSectionLockScope;
  setSectionLocks: Dispatch<SetStateAction<SectionLockRecord>>;
};

type UseDraftSectionLocksResult = {
  loadSectionLocks: (targetDraftId: string) => Promise<SectionLockRecord>;
  acquireSectionLock: (lockKey: string) => Promise<boolean>;
  releaseSectionLock: (lockKey: string) => Promise<void>;
};

export const useDraftSectionLocks = ({
  draftId,
  sessionUserId,
  canEditDraft,
  sessionDisplayName,
  sessionAvatarUrl,
  activeLockKey,
  scope,
  setSectionLocks
}: UseDraftSectionLocksParams): UseDraftSectionLocksResult => {
  const loadSectionLocks = useCallback(async (targetDraftId: string): Promise<SectionLockRecord> => {
    const { data, error } = await supabase.rpc("site_draft_list_active_section_locks", {
      p_draft_id: targetDraftId,
      p_scope: scope
    });

    if (error) {
      throw new Error(error.message);
    }

    const nextLocks: SectionLockRecord = {};
    ((data ?? []) as SectionLockListRow[]).forEach((typedRow) => {
      const lockKey =
        typeof typedRow.section_key === "string" && isSupportedLockKey(typedRow.section_key)
          ? typedRow.section_key
          : null;
      if (!lockKey) return;
      const userId =
        typeof typedRow.locked_by_user_id === "string" ? typedRow.locked_by_user_id.trim() : "";
      const holderName =
        typeof typedRow.locked_by_name === "string" && typedRow.locked_by_name.trim()
          ? typedRow.locked_by_name.trim()
          : "Unknown";
      const holderAvatarUrl =
        typeof typedRow.locked_by_avatar_url === "string" && typedRow.locked_by_avatar_url.trim()
          ? typedRow.locked_by_avatar_url.trim()
          : null;
      if (!userId) return;
      const updatedAt =
        typeof typedRow.updated_at === "string" && typedRow.updated_at.trim()
          ? typedRow.updated_at
          : new Date().toISOString();

      nextLocks[lockKey] = {
        lockKey,
        userId,
        holderName,
        holderAvatarUrl,
        updatedAt
      };
    });
    setSectionLocks(nextLocks);
    return nextLocks;
  }, [scope, setSectionLocks]);

  const acquireSectionLock = useCallback(async (lockKey: string) => {
    if (!draftId || !canEditDraft || !sessionUserId) return false;
    const { data, error } = await supabase.rpc("site_draft_acquire_section_lock", {
      p_draft_id: draftId,
      p_section_key: lockKey,
      p_holder_name: sessionDisplayName,
      p_holder_avatar_url: sessionAvatarUrl,
      p_ttl_seconds: 60
    });
    if (error) {
      throw new Error(error.message);
    }

    const response = (Array.isArray(data) ? data[0] : data) as SectionLockAcquireResult | null | undefined;
    const lockUserId =
      typeof response?.lock_user_id === "string" && response.lock_user_id.trim()
        ? response.lock_user_id.trim()
        : "";
    const lockName =
      typeof response?.lock_name === "string" && response.lock_name.trim()
        ? response.lock_name.trim()
        : "Unknown";
    const lockAvatarUrl =
      typeof response?.lock_avatar_url === "string" && response.lock_avatar_url.trim()
        ? response.lock_avatar_url.trim()
        : sessionAvatarUrl;
    const updatedAt =
      typeof response?.updated_at === "string" && response.updated_at.trim()
        ? response.updated_at
        : new Date().toISOString();

    setSectionLocks((current) => {
      const next = { ...current };
      if (!lockUserId) {
        delete next[lockKey];
        return next;
      }
      next[lockKey] = {
        lockKey,
        userId: lockUserId,
        holderName: lockName,
        holderAvatarUrl: lockAvatarUrl,
        updatedAt
      };
      return next;
    });

    return Boolean(response?.acquired && lockUserId === sessionUserId);
  }, [canEditDraft, draftId, sessionAvatarUrl, sessionDisplayName, sessionUserId, setSectionLocks]);

  const releaseSectionLock = useCallback(async (lockKey: string) => {
    if (!draftId || !sessionUserId) return;
    const { error } = await supabase.rpc("site_draft_release_section_lock", {
      p_draft_id: draftId,
      p_section_key: lockKey
    });
    if (error) {
      throw new Error(error.message);
    }
    setSectionLocks((current) => {
      const next = { ...current };
      delete next[lockKey];
      return next;
    });
  }, [draftId, sessionUserId, setSectionLocks]);

  useEffect(() => {
    if (!draftId || !sessionUserId) {
      setSectionLocks({});
      return;
    }

    const refreshLocks = () => {
      void loadSectionLocks(draftId).catch((error) => {
        console.warn("[locks] Failed to refresh section locks.", error);
      });
    };

    refreshLocks();
    const intervalId = window.setInterval(() => {
      refreshLocks();
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [draftId, loadSectionLocks, sessionUserId, setSectionLocks]);

  useEffect(() => {
    if (!draftId || !sessionUserId || !canEditDraft || !activeLockKey) return;

    const refreshLocks = () => {
      void loadSectionLocks(draftId).catch((error) => {
        console.warn("[locks] Failed to refresh section locks after lock heartbeat.", error);
      });
    };

    void acquireSectionLock(activeLockKey)
      .then((acquired) => {
        if (!acquired) {
          refreshLocks();
        }
      })
      .catch((error) => {
        console.warn("[locks] Failed to acquire section lock.", error);
        refreshLocks();
      });

    const intervalId = window.setInterval(() => {
      void acquireSectionLock(activeLockKey)
        .then((acquired) => {
          if (!acquired) {
            refreshLocks();
          }
        })
        .catch((error) => {
          console.warn("[locks] Failed to refresh section lock heartbeat.", error);
          refreshLocks();
        });
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    acquireSectionLock,
    activeLockKey,
    canEditDraft,
    draftId,
    loadSectionLocks,
    sessionUserId
  ]);

  useEffect(() => {
    if (!draftId || !sessionUserId) return;

    const releaseLocks = () => {
      void supabase.rpc("site_draft_release_all_section_locks", {
        p_draft_id: draftId
      });
    };

    window.addEventListener("pagehide", releaseLocks);
    return () => {
      window.removeEventListener("pagehide", releaseLocks);
      releaseLocks();
    };
  }, [draftId, sessionUserId]);

  return {
    loadSectionLocks,
    acquireSectionLock,
    releaseSectionLock
  };
};
