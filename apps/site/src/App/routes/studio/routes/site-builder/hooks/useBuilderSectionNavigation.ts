import { useCallback, useRef } from "react";
import { switchEditorSectionWithLocks } from "../services/switch-editor-section";
import { switchPreviewSlugWithLocks } from "../services/switch-preview-slug";
import type { BuilderSection, BuilderSettingsSection } from "../services/types";
import type {
  UseBuilderSectionNavigationParams,
  UseBuilderSectionNavigationResult
} from "./useBuilderSectionNavigation.types";

export const useBuilderSectionNavigation = ({
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  activePreviewSlug,
  pages,
  sectionLocks,
  canEditDraft,
  sessionUserId,
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
}: UseBuilderSectionNavigationParams): UseBuilderSectionNavigationResult => {
  const sectionTransitionInFlightRef = useRef(false);

  const switchEditorSection = useCallback(async (
    nextSection: BuilderSection,
    nextSettingsSection: BuilderSettingsSection,
    options: {
      nextPageEditingMode?: boolean;
      nextPreviewSlug?: string;
      skipDraftRefresh?: boolean;
    } = {}
  ) => {
    if (sectionTransitionInFlightRef.current) return;
    sectionTransitionInFlightRef.current = true;

    try {
      await switchEditorSectionWithLocks({
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
      });
    } finally {
      sectionTransitionInFlightRef.current = false;
    }
  }, [
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
  ]);

  const handleActivePreviewSlugChange = useCallback(async (nextSlug: string) => {
    if (sectionTransitionInFlightRef.current) return;
    sectionTransitionInFlightRef.current = true;
    try {
      await switchPreviewSlugWithLocks({
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
        saveSectionByKey: (sectionKey) => saveSectionByKey(sectionKey),
        acquireSectionLock,
        releaseSectionLock,
        loadSectionLocks,
        reloadLatestDraftAfterConflict,
        setLastSavedDraftSignature,
        setActivePreviewSlug,
        setNotice,
        setNoticeKind
      });
    } finally {
      sectionTransitionInFlightRef.current = false;
    }
  }, [
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
  ]);

  const handleSectionChange = useCallback(async (section: BuilderSection) => {
    if (section === "menu") {
      await switchEditorSection("menu", activeSettingsSection);
      return;
    }
    if (section === "content") {
      await switchEditorSection("content", activeSettingsSection);
      return;
    }

    const settingsOrder: BuilderSettingsSection[] = [
      "pages",
      "header",
      "footer",
      "head",
      "styles",
      "media"
    ];
    const preferredSettingsSections = [
      activeSettingsSection,
      ...settingsOrder.filter((entry) => entry !== activeSettingsSection)
    ];
    const nextSettingsSection =
      preferredSettingsSections.find((entry) => {
        if (entry === "pages") return true;
        const lockKey = entry === "media" ? "styles" : entry;
        const lock = sectionLocks[lockKey];
        return !lock || lock.userId === sessionUserId;
      }) ?? activeSettingsSection;

    await switchEditorSection("settings", nextSettingsSection, {
      nextPageEditingMode: nextSettingsSection === "pages" ? false : undefined
    });
  }, [activeSettingsSection, sectionLocks, sessionUserId, switchEditorSection]);

  const handleSettingsSectionChange = useCallback(async (section: BuilderSettingsSection) => {
    await switchEditorSection("settings", section, {
      nextPageEditingMode: section === "pages" ? false : undefined
    });
  }, [switchEditorSection]);

  const handleEnterPageEditingMode = useCallback(async (slug: string) => {
    await switchEditorSection("settings", "pages", {
      nextPageEditingMode: true,
      nextPreviewSlug: slug
    });
  }, [switchEditorSection]);

  const handleExitPageEditingMode = useCallback(async () => {
    await switchEditorSection("settings", "pages", {
      nextPageEditingMode: false
    });
  }, [switchEditorSection]);

  return {
    switchEditorSection,
    handleActivePreviewSlugChange,
    handleSectionChange,
    handleSettingsSectionChange,
    handleEnterPageEditingMode,
    handleExitPageEditingMode
  };
};
