import { useMemo } from "react";
import {
  getEditableSectionFromUi,
  getLockKeyFromUi,
  getPageLockKeyForPage,
  getPageLockKeyForSlug,
  isBuilderEditableSectionKey,
  isPageLockKey,
  type SectionLockRecord
} from "../services/locks";
import { getPageSafeSlug, normalizePageSlug } from "../services/utils";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  DraftState,
  SiteAccessRole
} from "../services/types";

type BuilderSidebarSectionLock = {
  holderName: string;
  holderAvatarUrl: string | null;
  isSelf: boolean;
};

type UseSiteBuilderAccessAndLocksParams = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  activePreviewSlug: string;
  pages: BuilderPage[];
  sectionLocks: SectionLockRecord;
  siteAccessRole: SiteAccessRole | null;
  draftState: DraftState | null;
  sessionUserId: string | null;
};

export type SiteBuilderAccessAndLocksState = {
  isOwnerOnOwnerDraft: boolean;
  canEditDraft: boolean;
  canDirectPublish: boolean;
  canSubmitPullRequest: boolean;
  canPublishByRole: boolean;
  activeEditableSection: BuilderEditableSectionKey | null;
  activeLockKey: string | null;
  activeSectionLockedByOther: boolean;
  sidebarSectionLocks: Partial<Record<BuilderEditableSectionKey, BuilderSidebarSectionLock>>;
  pageLocksBySlug: Record<string, BuilderSidebarSectionLock>;
  activePageLockedByOther: boolean;
  hasForeignSectionLocks: boolean;
  canEditPageContent: boolean;
  metadataLock: {
    holderName: string;
    userId: string;
  } | null;
  metadataLockedByOther: boolean;
  showMetadataFullView: boolean;
};

export const useSiteBuilderAccessAndLocks = ({
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  activePreviewSlug,
  pages,
  sectionLocks,
  siteAccessRole,
  draftState,
  sessionUserId
}: UseSiteBuilderAccessAndLocksParams): SiteBuilderAccessAndLocksState => {
  const isOwner = siteAccessRole === "owner";
  const isOwnerOnOwnerDraft = isOwner && draftState?.draftType === "owner";
  const isContributorWorkingDraft =
    draftState?.draftType === "editor" &&
    siteAccessRole === "contributor" &&
    draftState.ownerUserId === sessionUserId;
  const isOwnerAdminOrEditorOnOwnerDraft =
    draftState?.draftType === "owner" &&
    (siteAccessRole === "owner" || siteAccessRole === "admin" || siteAccessRole === "editor");
  const canEditDraft = Boolean(isOwnerAdminOrEditorOnOwnerDraft || isContributorWorkingDraft);
  const canDirectPublish = Boolean(isOwnerAdminOrEditorOnOwnerDraft);
  const canSubmitPullRequest = Boolean(isContributorWorkingDraft);
  const canPublishByRole = canDirectPublish || canSubmitPullRequest;

  const activeEditableSection = useMemo(
    () => getEditableSectionFromUi(activeSection, activeSettingsSection, isPageEditingMode),
    [activeSection, activeSettingsSection, isPageEditingMode]
  );

  const activeLockKey = useMemo(
    () =>
      getLockKeyFromUi(activeSection, activeSettingsSection, activePreviewSlug, pages, isPageEditingMode),
    [activePreviewSlug, activeSection, activeSettingsSection, isPageEditingMode, pages]
  );

  const activeSectionLock = activeLockKey ? sectionLocks[activeLockKey] : null;
  const activeSectionLockedByOther = Boolean(activeSectionLock && activeSectionLock.userId !== sessionUserId);

  const sidebarSectionLocks = useMemo(
    () =>
      Object.entries(sectionLocks).reduce(
        (accumulator, [sectionKey, lock]) => {
          if (!lock || !isBuilderEditableSectionKey(sectionKey)) return accumulator;
          accumulator[sectionKey] = {
            holderName: lock.holderName,
            holderAvatarUrl: lock.holderAvatarUrl,
            isSelf: lock.userId === sessionUserId
          };
          return accumulator;
        },
        {} as Partial<Record<BuilderEditableSectionKey, BuilderSidebarSectionLock>>
      ),
    [sectionLocks, sessionUserId]
  );

  const pageLocksBySlug = useMemo(
    () => {
      const pageSlugByLockKey = new Map<string, string>();
      pages.forEach((page, index) => {
        pageSlugByLockKey.set(getPageLockKeyForPage(page, index), getPageSafeSlug(page, index));
      });

      return Object.entries(sectionLocks).reduce(
        (accumulator, [lockKey, lock]) => {
          if (!lock || !isPageLockKey(lockKey)) return accumulator;
          const fallbackSlug = lockKey.slice("page:".length);
          const slug = pageSlugByLockKey.get(lockKey) ?? normalizePageSlug(fallbackSlug);
          if (!slug) return accumulator;
          accumulator[slug] = {
            holderName: lock.holderName,
            holderAvatarUrl: lock.holderAvatarUrl,
            isSelf: lock.userId === sessionUserId
          };
          return accumulator;
        },
        {} as Record<string, BuilderSidebarSectionLock>
      );
    },
    [pages, sectionLocks, sessionUserId]
  );

  const activePageLockKey = useMemo(
    () => getPageLockKeyForSlug(pages, activePreviewSlug),
    [activePreviewSlug, pages]
  );
  const activePageLock = sectionLocks[activePageLockKey] ?? sectionLocks.pages;
  const activePageLockedByOther = Boolean(activePageLock && activePageLock.userId !== sessionUserId);

  const hasForeignSectionLocks = useMemo(
    () => Object.values(sectionLocks).some((lock) => Boolean(lock && lock.userId !== sessionUserId)),
    [sectionLocks, sessionUserId]
  );

  const canEditPageContent =
    canEditDraft &&
    activeSection === "settings" &&
    activeSettingsSection === "pages" &&
    isPageEditingMode &&
    !activePageLockedByOther;

  const metadataLock = sectionLocks.metadata ?? null;
  const metadataLockedByOther = Boolean(metadataLock && metadataLock.userId !== sessionUserId);
  const showMetadataFullView = activeSection === "content" && Boolean(isOwnerOnOwnerDraft);

  return {
    isOwnerOnOwnerDraft,
    canEditDraft,
    canDirectPublish,
    canSubmitPullRequest,
    canPublishByRole,
    activeEditableSection,
    activeLockKey,
    activeSectionLockedByOther,
    sidebarSectionLocks,
    pageLocksBySlug,
    activePageLockedByOther,
    hasForeignSectionLocks,
    canEditPageContent,
    metadataLock,
    metadataLockedByOther,
    showMetadataFullView
  };
};
