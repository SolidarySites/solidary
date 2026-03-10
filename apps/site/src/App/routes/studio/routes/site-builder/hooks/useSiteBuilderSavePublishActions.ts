import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { FILE_KEYS } from "../services/constants";
import {
  type DraftSaveSettingsInput
} from "../services/draft-utils";
import {
  EDITABLE_SECTION_LABELS,
  getLockLabel,
  getPageLockKeyForSlug,
  type SectionLockRecord
} from "../services/locks";
import { publishEditorDraft, publishOwnerDraft } from "../services/publish-draft";
import type { PublishTrackingParams } from "../services/publish/types";
import {
  DraftConflictError,
  saveDraftState,
  type DraftRevisionRow
} from "../services/save-draft-state";
import { markEditorDraftTouched as markEditorDraftTouchedInternal } from "../services/save-editor-touch";
import {
  saveMetadataSection as runSaveMetadataSection,
  savePagesSection as runSavePagesSection
} from "../services/save-metadata-and-pages";
import { buildDraftSignatureForState as buildDraftSignatureFromState } from "../services/save-section-signature";
import {
  saveFooterSection as runSaveFooterSection,
  saveHeadSection as runSaveHeadSection,
  saveHeaderSection as runSaveHeaderSection,
  saveStylesSection as runSaveStylesSection
} from "../services/save-settings-sections";
import {
  applyDraftPublishPendingResult,
  setDraftPublishPending
} from "../services/publish-pending";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderStyleSettings,
  DraftImageAsset,
  DraftState,
  PublishFeedback
} from "../services/types";
import { normalizePageSlug } from "../services/utils";
import { requireFreshGithubAuth } from "../../../../../features/auth/services/github-auth";
import type { NoticeKind } from "../../../../../types/notice";

type UseSiteBuilderSavePublishActionsParams = {
  canEditDraft: boolean;
  canPublishByRole: boolean;
  canDirectPublish: boolean;
  hasForeignSectionLocks: boolean;
  activeEditableSection: BuilderEditableSectionKey | null;
  sectionLocks: SectionLockRecord;
  activePreviewSlug: string;
  sessionUserId: string | null;
  session: Session | null;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  siteImage: File | null;
  siteImagePreview: string | null;
  draftImageUrl: string | null;
  draftSaveImageUrl: string;
  computedSlug: string;
  pages: BuilderPage[];
  draftImages: DraftImageAsset[];
  draftPageSlugs: string[];
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  styles: BuilderStyleSettings;
  templateSolidary: string;
  templateSolidaryLinks: string;
  defaultHomeContent: string;
  hasUnsavedChanges: boolean;
  currentDraftSignature: string;
  savingDraft: boolean;
  sessionDisplayName: string;
  touchedPageSlugsRef: MutableRefObject<Set<string>>;
  deletedPageSlugsRef: MutableRefObject<Set<string>>;
  cleanedPublishedDraftIdRef: MutableRefObject<string | null>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
  setPublishFeedback: Dispatch<SetStateAction<PublishFeedback | null>>;
  setIsProvisioning: Dispatch<SetStateAction<boolean>>;
  setProvisionStep: Dispatch<SetStateAction<string>>;
  setDraftState: Dispatch<SetStateAction<DraftState | null>>;
  setPages: Dispatch<SetStateAction<BuilderPage[]>>;
  setDraftImages: Dispatch<SetStateAction<DraftImageAsset[]>>;
  setDraftPageSlugs: Dispatch<SetStateAction<string[]>>;
  setDraftImageUrl: Dispatch<SetStateAction<string | null>>;
  setLastSavedDraftSignature: Dispatch<SetStateAction<string>>;
  setSavingDraft: Dispatch<SetStateAction<boolean>>;
  startPublishStatusTracking: (params: PublishTrackingParams) => void;
  cancelPublishStatusTracking: () => void;
  reloadLatestDraftAfterConflict: () => Promise<void>;
};

export const useSiteBuilderSavePublishActions = ({
  canEditDraft,
  canPublishByRole,
  canDirectPublish,
  hasForeignSectionLocks,
  activeEditableSection,
  sectionLocks,
  activePreviewSlug,
  sessionUserId,
  session,
  siteTitle,
  siteDescription,
  siteUrl,
  siteImage,
  siteImagePreview,
  draftImageUrl,
  draftSaveImageUrl,
  computedSlug,
  pages,
  draftImages,
  draftPageSlugs,
  draftState,
  siteSettingsInput,
  styles,
  templateSolidary,
  templateSolidaryLinks,
  defaultHomeContent,
  hasUnsavedChanges,
  currentDraftSignature,
  savingDraft,
  sessionDisplayName,
  touchedPageSlugsRef,
  deletedPageSlugsRef,
  cleanedPublishedDraftIdRef,
  setNotice,
  setNoticeKind,
  setPublishFeedback,
  setIsProvisioning,
  setProvisionStep,
  setDraftState,
  setPages,
  setDraftImages,
  setDraftPageSlugs,
  setDraftImageUrl,
  setLastSavedDraftSignature,
  setSavingDraft,
  startPublishStatusTracking,
  cancelPublishStatusTracking,
  reloadLatestDraftAfterConflict
}: UseSiteBuilderSavePublishActionsParams) => {
  const draftStateRef = useRef<DraftState | null>(draftState);
  useEffect(() => {
    draftStateRef.current = draftState;
  }, [draftState]);

  const setDraftStateTracked: Dispatch<SetStateAction<DraftState | null>> = (nextState) => {
    if (typeof nextState === "function") {
      const updater = nextState as (current: DraftState | null) => DraftState | null;
      const resolvedNextState = updater(draftStateRef.current);
      draftStateRef.current = resolvedNextState;
      setDraftState(resolvedNextState);
      return;
    }

    draftStateRef.current = nextState;
    setDraftState(nextState);
  };

  const resetNotices = () => {
    setNotice(null);
    setNoticeKind(null);
  };

  const updateDraftWellKnownFiles = (solidaryFile: string, solidaryLinksFile: string) => {
    setDraftStateTracked((current) =>
      current
        ? {
            ...current,
            files: {
              ...current.files,
              [FILE_KEYS.solidary]: solidaryFile,
              [FILE_KEYS.solidaryLinks]: solidaryLinksFile
            }
          }
        : current
    );
  };

  const applyDraftRevisionRow = (draftRow: DraftRevisionRow | null | undefined) => {
    if (!draftRow) return;
    setDraftStateTracked((current) =>
      current
        ? {
            ...current,
            revision: typeof draftRow.revision === "number" ? draftRow.revision : current.revision,
            lastEditedAt:
              typeof draftRow.last_edited_at === "string"
                ? draftRow.last_edited_at
                : (current.lastEditedAt ?? null),
            lastEditedByUserId:
              typeof draftRow.last_edited_by_user_id === "string"
                ? draftRow.last_edited_by_user_id
                : (current.lastEditedByUserId ?? null)
          }
        : current
    );
  };

  const saveCurrentDraftState = async (
    repoInfo: DraftState,
    solidaryFile: string,
    solidaryLinksFile: string,
    imageUrl: string,
    pagesSnapshot: BuilderPage[] = pages
  ) => {
    const currentDraftState = draftStateRef.current;
    const currentRepoInfo =
      currentDraftState && currentDraftState.id === repoInfo.id ? currentDraftState : repoInfo;

    return saveDraftState({
      canEditDraft,
      sessionUserId: sessionUserId,
      repoInfo: currentRepoInfo,
      solidaryFile,
      solidaryLinksFile,
      imageUrl,
      pagesSnapshot,
      siteSettingsInput,
      styles,
      draftImages,
      draftPageSlugs,
      applyDraftRevisionRow,
      setDraftPageSlugs
    });
  };

  const buildDraftSignatureForState = ({
    pagesSnapshot = pages,
    imageUrl = draftSaveImageUrl
  }: {
    pagesSnapshot?: BuilderPage[];
    imageUrl?: string;
  } = {}) =>
    buildDraftSignatureFromState({
      draftState: draftStateRef.current,
      siteSettingsInput,
      styles,
      draftImages,
      pagesSnapshot,
      imageUrl
    });

  const markEditorDraftTouched = async (
    section: BuilderEditableSectionKey,
    touchedPageSlugs: string[] = [],
    deletedPageSlugs: string[] = []
  ) =>
    markEditorDraftTouchedInternal({
      draftState: draftStateRef.current,
      section,
      setDraftState: setDraftStateTracked,
      touchedPageSlugs,
      deletedPageSlugs
    });

  const setDraftPublishPendingState = async (pending: boolean) => {
    const currentDraftState = draftStateRef.current;
    if (!currentDraftState) return;

    try {
      const nextState = await setDraftPublishPending(currentDraftState.id, pending);
      setDraftStateTracked((current) => applyDraftPublishPendingResult(current, nextState));
    } catch (error) {
      console.warn("[publish] Failed to sync publish pending state.", error);
      setDraftStateTracked((current) =>
        current
          ? {
              ...current,
              hasPublishPendingChanges: pending
            }
          : current
      );
    }
  };

  const saveMetadataSection = async () =>
    runSaveMetadataSection({
      draftState: draftStateRef.current,
      siteImage,
      draftImageUrl,
      siteImagePreview,
      templateSolidary,
      templateSolidaryLinks,
      siteSettingsInput,
      siteUrl,
      sessionUserId,
      applyDraftRevisionRow,
      updateDraftWellKnownFiles,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: ({ imageUrl }) => buildDraftSignatureForState({ imageUrl })
    });

  const savePagesSection = async () =>
    runSavePagesSection({
      draftState: draftStateRef.current,
      pages,
      draftImages,
      draftPageSlugs,
      touchedPageSlugsRef,
      deletedPageSlugsRef,
      setPages,
      setDraftPageSlugs,
      markEditorDraftTouched: (section, touchedPageSlugs, deletedPageSlugs) =>
        markEditorDraftTouched(section, touchedPageSlugs, deletedPageSlugs),
      buildDraftSignatureForState: ({ pagesSnapshot }) =>
        buildDraftSignatureForState({ pagesSnapshot })
    });

  const saveHeaderSection = async () =>
    runSaveHeaderSection({
      draftState: draftStateRef.current,
      siteSettingsInput,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveFooterSection = async () =>
    runSaveFooterSection({
      draftState: draftStateRef.current,
      siteSettingsInput,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveHeadSection = async () =>
    runSaveHeadSection({
      draftState: draftStateRef.current,
      siteSettingsInput,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveStylesSection = async () =>
    runSaveStylesSection({
      draftState: draftStateRef.current,
      styles,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveSectionByKey = async (sectionKey: BuilderEditableSectionKey) => {
    if (!canEditDraft) return;
    if (!draftStateRef.current) return;
    const lockKey = sectionKey === "pages" ? getPageLockKeyForSlug(pages, activePreviewSlug) : sectionKey;
    const lock = sectionLocks[lockKey] ?? (sectionKey === "pages" ? sectionLocks.pages : null);
    if (lock && lock.userId !== sessionUserId) {
      if (sectionKey === "pages") {
        throw new Error(
          `${lock.holderName} is editing page "${normalizePageSlug(activePreviewSlug) || "home"}".`
        );
      }
      throw new Error(`${lock.holderName} is editing ${getLockLabel(lockKey)}.`);
    }

    let savedSignature = "";
    if (sectionKey === "metadata") {
      savedSignature = await saveMetadataSection();
    } else if (sectionKey === "pages") {
      savedSignature = await savePagesSection();
    } else if (sectionKey === "header") {
      savedSignature = await saveHeaderSection();
    } else if (sectionKey === "footer") {
      savedSignature = await saveFooterSection();
    } else if (sectionKey === "head") {
      savedSignature = await saveHeadSection();
    } else if (sectionKey === "styles") {
      savedSignature = await saveStylesSection();
    }

    await setDraftPublishPendingState(true);
    return savedSignature;
  };

  const handlePublish = async () => {
    resetNotices();
    setPublishFeedback(null);
    cancelPublishStatusTracking();
    cleanedPublishedDraftIdRef.current = null;

    if (!canPublishByRole) {
      setNotice("You do not have publish access for this draft.");
      setNoticeKind("error");
      return;
    }

    if (canDirectPublish && hasForeignSectionLocks) {
      setNotice("Wait for collaborators to finish their current section edits before publishing.");
      setNoticeKind("error");
      return;
    }

    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshGithubAuth();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Sign in with GitHub to continue.";
      setNotice(message);
      setNoticeKind("error");
      return;
    }

    const { providerToken, supabaseAccessToken } = freshAuth;

    if (!siteTitle.trim() || !siteDescription.trim()) {
      setNotice("Title and description are required.");
      setNoticeKind("error");
      return;
    }

    setIsProvisioning(true);
    const publishStartedAt = new Date().toISOString();

    try {
      const currentDraftState = draftStateRef.current;
      if (!currentDraftState) {
        throw new Error("Missing site draft. Create a site first.");
      }

      if (hasUnsavedChanges) {
        setNotice("Save draft changes to enable publishing.");
        setNoticeKind("error");
        return;
      }

      if (canDirectPublish) {
        await publishOwnerDraft({
          providerToken,
          publishStartedAt,
          draftState: draftStateRef.current ?? currentDraftState,
          siteTitle,
          siteDescription,
          siteUrl,
          siteImage,
          siteImagePreview,
          draftImageUrl,
          computedSlug,
          pages,
          draftImages,
          siteSettingsInput,
          styles,
          templateSolidary,
          templateSolidaryLinks,
          defaultHomeContent,
          setProvisionStep,
          saveDraftState: saveCurrentDraftState,
          updateDraftWellKnownFiles,
          setPages,
          setDraftImages,
          setLastSavedDraftSignature,
          setDraftImageUrl,
          startPublishStatusTracking
        });
        setNotice(null);
        setNoticeKind(null);
      } else {
        await publishEditorDraft({
          providerToken,
          draftState: draftStateRef.current ?? currentDraftState,
          siteUrl,
          siteImage,
          siteImagePreview,
          draftImageUrl,
          computedSlug,
          pages,
          draftImages,
          siteSettingsInput,
          styles,
          templateSolidary,
          templateSolidaryLinks,
          defaultHomeContent,
          setProvisionStep,
          sessionAccessToken: supabaseAccessToken,
          sessionDisplayName,
          setDraftImageUrl,
          setDraftState: setDraftStateTracked,
          clearTouchedPageTracking: () => {
            touchedPageSlugsRef.current.clear();
            deletedPageSlugsRef.current.clear();
          },
          setLastSavedDraftSignature,
          setPublishFeedback,
          setNotice,
          setNoticeKind,
          buildDraftSignatureForState
        });
        await setDraftPublishPendingState(false);
      }
    } catch (caught) {
      if (caught instanceof DraftConflictError) {
        await reloadLatestDraftAfterConflict();
      } else {
        const message = caught instanceof Error ? caught.message : "Something went wrong.";
        setNotice(message);
        setNoticeKind("error");
      }
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draftState || savingDraft) return;
    if (!canEditDraft) {
      setNotice("Your role is read-only for this site.");
      setNoticeKind("error");
      return;
    }
    const sectionKey = activeEditableSection;
    if (!sectionKey) {
      setNotice("Open a section to save your latest changes.");
      setNoticeKind("error");
      return;
    }

    setSavingDraft(true);
    try {
      const savedSignature = await saveSectionByKey(sectionKey);
      if (typeof savedSignature === "string" && savedSignature) {
        setLastSavedDraftSignature(savedSignature);
      } else {
        setLastSavedDraftSignature(currentDraftSignature);
      }
      setNotice(`${EDITABLE_SECTION_LABELS[sectionKey]} saved.`);
      setNoticeKind("notice");
    } catch (error) {
      if (error instanceof DraftConflictError) {
        await reloadLatestDraftAfterConflict();
      } else {
        const message = error instanceof Error ? error.message : "Failed to save draft.";
        setNotice(message);
        setNoticeKind("error");
      }
    } finally {
      setSavingDraft(false);
    }
  };

  return {
    saveSectionByKey,
    handlePublish,
    handleSaveDraft
  };
};
