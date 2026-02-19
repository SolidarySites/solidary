import type { Dispatch, SetStateAction } from "react";
import type { NoticeKind } from "../../../types/notice";
import {
  getEditableSectionFromUi,
  getLockKeyFromUi,
  getLockLabel,
  type SectionLockRecord
} from "./locks";
import { DraftConflictError } from "./save-draft-state";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection
} from "./types";
import { normalizePageSlug } from "./utils";

type SwitchEditorSectionParams = {
  nextSection: BuilderSection;
  nextSettingsSection: BuilderSettingsSection;
  options: {
    nextPageEditingMode?: boolean;
    nextPreviewSlug?: string;
  };
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  activePreviewSlug: string;
  pages: BuilderPage[];
  canEditDraft: boolean;
  draftStateId: string | null;
  hasUnsavedChanges: boolean;
  currentDraftSignature: string;
  saveSectionByKey: (sectionKey: BuilderEditableSectionKey) => Promise<string | void>;
  acquireSectionLock: (lockKey: string) => Promise<boolean>;
  releaseSectionLock: (lockKey: string) => Promise<void>;
  loadSectionLocks: (targetDraftId: string) => Promise<SectionLockRecord>;
  refreshDraftAfterSectionChange: (options?: { preservedPreviewSlug?: string }) => Promise<void>;
  reloadLatestDraftAfterConflict: () => Promise<void>;
  setLastSavedDraftSignature: Dispatch<SetStateAction<string>>;
  setActiveSection: Dispatch<SetStateAction<BuilderSection>>;
  setActiveSettingsSection: Dispatch<SetStateAction<BuilderSettingsSection>>;
  setActivePreviewSlug: Dispatch<SetStateAction<string>>;
  setIsPageEditingMode: Dispatch<SetStateAction<boolean>>;
  clearSelectedEditorImage: () => void;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
};

export const switchEditorSectionWithLocks = async ({
  nextSection,
  nextSettingsSection,
  options,
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  activePreviewSlug,
  pages,
  canEditDraft,
  draftStateId,
  hasUnsavedChanges,
  currentDraftSignature,
  saveSectionByKey,
  acquireSectionLock,
  releaseSectionLock,
  loadSectionLocks,
  refreshDraftAfterSectionChange,
  reloadLatestDraftAfterConflict,
  setLastSavedDraftSignature,
  setActiveSection,
  setActiveSettingsSection,
  setActivePreviewSlug,
  setIsPageEditingMode,
  clearSelectedEditorImage,
  setNotice,
  setNoticeKind
}: SwitchEditorSectionParams): Promise<void> => {
  const normalizedCurrentSlug = normalizePageSlug(activePreviewSlug) || "home";
  const normalizedNextSlug = normalizePageSlug(options.nextPreviewSlug ?? activePreviewSlug) || "home";
  const nextPageEditingMode =
    nextSection === "settings" && nextSettingsSection === "pages"
      ? Boolean(options.nextPageEditingMode)
      : false;
  const currentSectionKey = getEditableSectionFromUi(
    activeSection,
    activeSettingsSection,
    isPageEditingMode
  );
  const nextSectionKey = getEditableSectionFromUi(
    nextSection,
    nextSettingsSection,
    nextPageEditingMode
  );
  const currentLockKey = getLockKeyFromUi(
    activeSection,
    activeSettingsSection,
    normalizedCurrentSlug,
    pages,
    isPageEditingMode
  );
  const nextLockKey = getLockKeyFromUi(
    nextSection,
    nextSettingsSection,
    normalizedNextSlug,
    pages,
    nextPageEditingMode
  );
  const isSameDestination =
    nextSection === activeSection &&
    nextSettingsSection === activeSettingsSection &&
    nextPageEditingMode === isPageEditingMode &&
    normalizedNextSlug === normalizedCurrentSlug;
  if (isSameDestination) {
    return;
  }

  let acquiredNextLock = false;

  try {
    if (nextLockKey && nextLockKey !== currentLockKey) {
      const acquired = await acquireSectionLock(nextLockKey);
      if (!acquired) {
        const latestLocks =
          draftStateId ? await loadSectionLocks(draftStateId).catch(() => ({} as SectionLockRecord)) : {};
        const lockHolder = latestLocks[nextLockKey]?.holderName ?? "Another collaborator";
        if (nextSectionKey === "pages") {
          setNotice(
            `${lockHolder} is editing page "${normalizedNextSlug}". Choose another page to edit.`
          );
          setNoticeKind("error");
          return;
        } else {
          setNotice(`${lockHolder} is editing ${getLockLabel(nextLockKey)}.`);
          setNoticeKind("error");
          return;
        }
      } else {
        acquiredNextLock = true;
      }
    }

    if (
      currentSectionKey &&
      currentLockKey &&
      currentLockKey !== nextLockKey &&
      canEditDraft &&
      draftStateId
    ) {
      if (hasUnsavedChanges) {
        const savedSignature = await saveSectionByKey(currentSectionKey);
        if (typeof savedSignature === "string" && savedSignature) {
          setLastSavedDraftSignature(savedSignature);
        } else {
          setLastSavedDraftSignature(currentDraftSignature);
        }
      }
      await releaseSectionLock(currentLockKey);
    }

    if (nextSection !== activeSection) {
      setActiveSection(nextSection);
    }
    if (nextSettingsSection !== activeSettingsSection) {
      setActiveSettingsSection(nextSettingsSection);
    }
    if (normalizedNextSlug !== normalizedCurrentSlug) {
      setActivePreviewSlug(normalizedNextSlug);
    }
    if (nextPageEditingMode !== isPageEditingMode) {
      setIsPageEditingMode(nextPageEditingMode);
    }
    if (!nextPageEditingMode) {
      clearSelectedEditorImage();
    }
    await refreshDraftAfterSectionChange({
      preservedPreviewSlug: normalizedNextSlug
    });
  } catch (caught) {
    if (acquiredNextLock && nextLockKey && nextLockKey !== currentLockKey) {
      await releaseSectionLock(nextLockKey).catch(() => undefined);
    }
    if (caught instanceof DraftConflictError) {
      await reloadLatestDraftAfterConflict();
    } else {
      const message = caught instanceof Error ? caught.message : "Failed to switch sections.";
      setNotice(message);
      setNoticeKind("error");
    }
  }
};
