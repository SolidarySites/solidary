import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../../../lib/supabase";
import { isSupportedLockKey, type SectionLockAcquireResult, type SectionLockRecord } from "../services/locks";

type UseDraftSectionLocksParams = {
  draftId: string | null | undefined;
  sessionUserId: string | null;
  canEditDraft: boolean;
  sessionDisplayName: string;
  activeLockKey: string | null;
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
  activeLockKey,
  setSectionLocks
}: UseDraftSectionLocksParams): UseDraftSectionLocksResult => {
  const loadSectionLocks = useCallback(async (targetDraftId: string): Promise<SectionLockRecord> => {
    const { data, error } = await supabase
      .from("site_draft_section_locks")
      .select("section_key, locked_by_user_id, locked_by_name, expires_at")
      .eq("draft_id", targetDraftId);

    if (error) {
      throw new Error(error.message);
    }

    const nextLocks: SectionLockRecord = {};
    const nowTime = Date.now();
    (data ?? []).forEach((row) => {
      const lockKey =
        typeof row.section_key === "string" && isSupportedLockKey(row.section_key)
          ? row.section_key
          : null;
      if (!lockKey) return;
      const userId = typeof row.locked_by_user_id === "string" ? row.locked_by_user_id.trim() : "";
      const holderName =
        typeof row.locked_by_name === "string" && row.locked_by_name.trim()
          ? row.locked_by_name.trim()
          : "Unknown";
      const expiresAt = typeof row.expires_at === "string" ? row.expires_at : "";
      const expiresAtTime = Date.parse(expiresAt);
      if (!userId || !expiresAt || Number.isNaN(expiresAtTime) || expiresAtTime <= nowTime) return;

      nextLocks[lockKey] = {
        lockKey,
        userId,
        holderName,
        expiresAt
      };
    });
    setSectionLocks(nextLocks);
    return nextLocks;
  }, [setSectionLocks]);

  const acquireSectionLock = useCallback(async (lockKey: string) => {
    if (!draftId || !canEditDraft || !sessionUserId) return false;
    const { data, error } = await supabase.rpc("site_draft_acquire_section_lock", {
      p_draft_id: draftId,
      p_section_key: lockKey,
      p_holder_name: sessionDisplayName,
      p_ttl_seconds: 45
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
    const expiresAt =
      typeof response?.expires_at === "string" && response.expires_at.trim()
        ? response.expires_at
        : new Date(Date.now() + 45_000).toISOString();

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
        expiresAt
      };
      return next;
    });

    return Boolean(response?.acquired && lockUserId === sessionUserId);
  }, [canEditDraft, draftId, sessionDisplayName, sessionUserId, setSectionLocks]);

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

    void loadSectionLocks(draftId).catch(() => undefined);
    const intervalId = window.setInterval(() => {
      void loadSectionLocks(draftId).catch(() => undefined);
    }, 8_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [draftId, loadSectionLocks, sessionUserId, setSectionLocks]);

  useEffect(() => {
    if (!draftId || !sessionUserId || !canEditDraft || !activeLockKey) return;

    void acquireSectionLock(activeLockKey)
      .then((acquired) => {
        if (!acquired) {
          void loadSectionLocks(draftId).catch(() => undefined);
        }
      })
      .catch(() => undefined);

    const intervalId = window.setInterval(() => {
      void acquireSectionLock(activeLockKey)
        .then((acquired) => {
          if (!acquired) {
            void loadSectionLocks(draftId).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }, 15_000);

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
