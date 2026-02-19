import type { Dispatch, SetStateAction } from "react";
import type { NoticeKind } from "../../../types/notice";
import { getPageLockKeyForSlug, type SectionLockRecord } from "./locks";
import { DraftConflictError } from "./save-draft-state";
import type { BuilderPage, BuilderSection, BuilderSettingsSection } from "./types";
import { normalizePageSlug } from "./utils";

type SwitchPreviewSlugParams = {
  nextSlug: string;
  activePreviewSlug: string;
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  pages: BuilderPage[];
  draftStateId: string | null;
  sessionUserId: string | null;
  canEditDraft: boolean;
  hasUnsavedChanges: boolean;
  currentDraftSignature: string;
  saveSectionByKey: (sectionKey: "pages") => Promise<string | void>;
  acquireSectionLock: (lockKey: string) => Promise<boolean>;
  releaseSectionLock: (lockKey: string) => Promise<void>;
  loadSectionLocks: (targetDraftId: string) => Promise<SectionLockRecord>;
  reloadLatestDraftAfterConflict: () => Promise<void>;
  setLastSavedDraftSignature: Dispatch<SetStateAction<string>>;
  setActivePreviewSlug: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
};

export const switchPreviewSlugWithLocks = async ({
  nextSlug,
  activePreviewSlug,
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  pages,
  draftStateId,
  sessionUserId,
  canEditDraft,
  hasUnsavedChanges,
  currentDraftSignature,
  saveSectionByKey,
  acquireSectionLock,
  releaseSectionLock,
  loadSectionLocks,
  reloadLatestDraftAfterConflict,
  setLastSavedDraftSignature,
  setActivePreviewSlug,
  setNotice,
  setNoticeKind
}: SwitchPreviewSlugParams): Promise<void> => {
  const normalizedNextSlug = normalizePageSlug(nextSlug) || "home";
  const normalizedCurrentSlug = normalizePageSlug(activePreviewSlug) || "home";
  if (normalizedNextSlug === normalizedCurrentSlug) {
    setActivePreviewSlug(normalizedNextSlug);
    return;
  }

  if (
    !draftStateId ||
    !sessionUserId ||
    !canEditDraft ||
    activeSection !== "settings" ||
    activeSettingsSection !== "pages" ||
    !isPageEditingMode
  ) {
    setActivePreviewSlug(normalizedNextSlug);
    return;
  }

  const currentPageLockKey = getPageLockKeyForSlug(pages, normalizedCurrentSlug);
  const nextPageLockKey = getPageLockKeyForSlug(pages, normalizedNextSlug);
  if (currentPageLockKey === nextPageLockKey) {
    setActivePreviewSlug(normalizedNextSlug);
    return;
  }
  let acquiredNextLock = false;

  try {
    const acquired = await acquireSectionLock(nextPageLockKey);
    if (!acquired) {
      const latestLocks =
        draftStateId ? await loadSectionLocks(draftStateId).catch(() => ({} as SectionLockRecord)) : {};
      const lockHolder = latestLocks[nextPageLockKey]?.holderName ?? "Another collaborator";
      setNotice(`${lockHolder} is editing page "${normalizedNextSlug}".`);
      setNoticeKind("error");
      return;
    }
    acquiredNextLock = true;

    if (hasUnsavedChanges) {
      const savedSignature = await saveSectionByKey("pages");
      if (typeof savedSignature === "string" && savedSignature) {
        setLastSavedDraftSignature(savedSignature);
      } else {
        setLastSavedDraftSignature(currentDraftSignature);
      }
    }

    await releaseSectionLock(currentPageLockKey).catch(() => undefined);
    setActivePreviewSlug(normalizedNextSlug);
  } catch (caught) {
    if (acquiredNextLock) {
      await releaseSectionLock(nextPageLockKey).catch(() => undefined);
    }
    if (caught instanceof DraftConflictError) {
      await reloadLatestDraftAfterConflict();
    } else {
      const message = caught instanceof Error ? caught.message : "Failed to switch pages.";
      setNotice(message);
      setNoticeKind("error");
    }
  }
};
