import type { Session } from "@supabase/supabase-js";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
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
  saveHeaderSection as runSaveHeaderSection,
  saveStylesSection as runSaveStylesSection
} from "../services/save-settings-sections";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  DraftImageAsset,
  DraftState,
  PublishFeedback
} from "../services/types";
import { normalizePageSlug } from "../services/utils";
import { requireFreshGithubAuth } from "../../../features/auth/services/github-auth";
import type { NoticeKind } from "../../../types/notice";

type UseSiteBuilderSavePublishActionsParams = {
  canEditDraft: boolean;
  canPublishByRole: boolean;
  canDirectPublish: boolean;
  hasForeignSectionLocks: boolean;
  activeEditableSection: BuilderEditableSectionKey | null;
  activeSectionLockedByOther: boolean;
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
  tokensCss: string;
  templateSolidary: string;
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
  activeSectionLockedByOther,
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
  tokensCss,
  templateSolidary,
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
  const resetNotices = () => {
    setNotice(null);
    setNoticeKind(null);
  };

  const updateDraftSolidaryFile = (solidaryFile: string) => {
    setDraftState((current) =>
      current
        ? {
            ...current,
            files: {
              [FILE_KEYS.solidary]: solidaryFile
            }
          }
        : current
    );
  };

  const applyDraftRevisionRow = (draftRow: DraftRevisionRow | null | undefined) => {
    if (!draftRow) return;
    setDraftState((current) =>
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
    imageUrl: string,
    pagesSnapshot: BuilderPage[] = pages
  ) =>
    saveDraftState({
      canEditDraft,
      sessionUserId: sessionUserId,
      repoInfo,
      solidaryFile,
      imageUrl,
      pagesSnapshot,
      siteSettingsInput,
      tokensCss,
      draftImages,
      draftPageSlugs,
      applyDraftRevisionRow,
      setDraftPageSlugs
    });

  const buildDraftSignatureForState = ({
    pagesSnapshot = pages,
    imageUrl = draftSaveImageUrl
  }: {
    pagesSnapshot?: BuilderPage[];
    imageUrl?: string;
  } = {}) =>
    buildDraftSignatureFromState({
      draftState,
      siteSettingsInput,
      tokensCss,
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
      draftState,
      section,
      setDraftState,
      touchedPageSlugs,
      deletedPageSlugs
    });

  const saveMetadataSection = async () =>
    runSaveMetadataSection({
      draftState,
      siteImage,
      draftImageUrl,
      siteImagePreview,
      templateSolidary,
      siteSettingsInput,
      siteUrl,
      sessionUserId,
      applyDraftRevisionRow,
      updateDraftSolidaryFile,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: ({ imageUrl }) => buildDraftSignatureForState({ imageUrl })
    });

  const savePagesSection = async () =>
    runSavePagesSection({
      draftState,
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
      draftState,
      siteSettingsInput,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveFooterSection = async () =>
    runSaveFooterSection({
      draftState,
      siteSettingsInput,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveStylesSection = async () =>
    runSaveStylesSection({
      draftState,
      tokensCss,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveSectionByKey = async (sectionKey: BuilderEditableSectionKey) => {
    if (!canEditDraft) return;
    if (!draftState) return;
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

    if (sectionKey === "metadata") {
      return saveMetadataSection();
    } else if (sectionKey === "pages") {
      return savePagesSection();
    } else if (sectionKey === "header") {
      return saveHeaderSection();
    } else if (sectionKey === "footer") {
      return saveFooterSection();
    } else if (sectionKey === "styles") {
      return saveStylesSection();
    }

    return "";
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
      if (!draftState) {
        throw new Error("Missing site draft. Create a site first.");
      }

      if (hasUnsavedChanges && activeEditableSection && !activeSectionLockedByOther) {
        const savedSignature = await saveSectionByKey(activeEditableSection);
        if (typeof savedSignature === "string" && savedSignature) {
          setLastSavedDraftSignature(savedSignature);
        }
      }

      if (canDirectPublish) {
        await publishOwnerDraft({
          providerToken,
          publishStartedAt,
          draftState,
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
          tokensCss,
          templateSolidary,
          defaultHomeContent,
          setProvisionStep,
          saveDraftState: saveCurrentDraftState,
          updateDraftSolidaryFile,
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
          draftState,
          siteUrl,
          siteImage,
          siteImagePreview,
          draftImageUrl,
          computedSlug,
          pages,
          draftImages,
          siteSettingsInput,
          tokensCss,
          templateSolidary,
          defaultHomeContent,
          setProvisionStep,
          sessionAccessToken: supabaseAccessToken,
          sessionDisplayName,
          setDraftImageUrl,
          setDraftState,
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
