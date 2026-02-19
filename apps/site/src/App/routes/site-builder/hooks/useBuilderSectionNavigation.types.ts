import type { Dispatch, SetStateAction } from "react";
import type { NoticeKind } from "../../../types/notice";
import type { SectionLockRecord } from "../services/locks";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection
} from "../services/types";

export type UseBuilderSectionNavigationParams = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  activePreviewSlug: string;
  pages: BuilderPage[];
  sectionLocks: SectionLockRecord;
  canEditDraft: boolean;
  sessionUserId: string | null;
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

export type UseBuilderSectionNavigationResult = {
  switchEditorSection: (
    nextSection: BuilderSection,
    nextSettingsSection: BuilderSettingsSection,
    options?: {
      nextPageEditingMode?: boolean;
      nextPreviewSlug?: string;
      skipDraftRefresh?: boolean;
    }
  ) => Promise<void>;
  handleActivePreviewSlugChange: (nextSlug: string) => Promise<void>;
  handleSectionChange: (section: BuilderSection) => Promise<void>;
  handleSettingsSectionChange: (section: BuilderSettingsSection) => Promise<void>;
  handleEnterPageEditingMode: (slug: string) => Promise<void>;
  handleExitPageEditingMode: () => Promise<void>;
};
