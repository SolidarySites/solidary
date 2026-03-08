import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback
} from "react";
import { supabase } from "../../../../../../lib/supabase";
import type { NoticeKind } from "../../../../../../types/notice";
import type { PreviewSelectedElement } from "../../preview/AstroTemplatePreview";
import { markEditorDraftTouched as markEditorDraftTouchedForPageDelete } from "../../services/save-editor-touch";
import type { BuilderPage, DraftState } from "../../services/types";
import { getPageSafeSlug, normalizePageSlug } from "../../services/utils";

type UseDeleteDraftPageActionOptions = {
  draftState: DraftState | null;
  canEditDraft: boolean;
  pages: BuilderPage[];
  setPages: Dispatch<SetStateAction<BuilderPage[]>>;
  setDraftPageSlugs: Dispatch<SetStateAction<string[]>>;
  setActivePreviewSlug: Dispatch<SetStateAction<string>>;
  setIsPageEditingMode: Dispatch<SetStateAction<boolean>>;
  setSelectedEditorElement: Dispatch<SetStateAction<PreviewSelectedElement | null>>;
  clearSelectedEditorImage: () => void;
  releaseSectionLock: (sectionKey: string) => Promise<void>;
  setDeletePageBusy: Dispatch<SetStateAction<boolean>>;
  touchedPageSlugsRef: MutableRefObject<Set<string>>;
  deletedPageSlugsRef: MutableRefObject<Set<string>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
  setDraftState: Dispatch<SetStateAction<DraftState | null>>;
};

export const useDeleteDraftPageAction = ({
  draftState,
  canEditDraft,
  pages,
  setPages,
  setDraftPageSlugs,
  setActivePreviewSlug,
  setIsPageEditingMode,
  setSelectedEditorElement,
  clearSelectedEditorImage,
  releaseSectionLock,
  setDeletePageBusy,
  touchedPageSlugsRef,
  deletedPageSlugsRef,
  setNotice,
  setNoticeKind,
  setDraftState
}: UseDeleteDraftPageActionOptions) =>
  useCallback(async (safeSlug: string) => {
    if (!draftState?.id || !canEditDraft) return;

    const normalizedSlug = normalizePageSlug(safeSlug) || "home";
    const pageIndex = pages.findIndex(
      (page, index) => getPageSafeSlug(page, index) === normalizedSlug
    );
    if (pageIndex < 0) {
      setNotice("Selected page is no longer available.");
      setNoticeKind("error");
      return;
    }

    const page = pages[pageIndex];
    if (page.isHome) {
      setNotice("The home page cannot be deleted.");
      setNoticeKind("error");
      return;
    }

    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Are you sure you want to delete this page and all of its content? This action is irreversible."
      )
    ) {
      return;
    }

    setDeletePageBusy(true);
    setNotice(null);
    setNoticeKind(null);

    try {
      let deleteQuery = supabase.from("site_draft_pages").delete().eq("draft_id", draftState.id);
      const pageId = typeof page.id === "string" ? page.id.trim() : "";
      if (pageId) {
        deleteQuery = deleteQuery.eq("id", pageId);
      } else {
        deleteQuery = deleteQuery.eq("slug", normalizedSlug);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      touchedPageSlugsRef.current.delete(normalizedSlug);
      deletedPageSlugsRef.current.add(normalizedSlug);

      if (draftState.draftType === "editor") {
        await markEditorDraftTouchedForPageDelete({
          draftState,
          section: "pages",
          setDraftState,
          deletedPageSlugs: [normalizedSlug]
        });
      }

      const nextPages = pages
        .filter((_, index) => index !== pageIndex)
        .map((entry, index) => ({
          ...entry,
          position: index
        }));
      const homeIndex = nextPages.findIndex((entry) => entry.isHome);
      const fallbackPageIndex = homeIndex >= 0 ? homeIndex : 0;
      const fallbackSlug =
        nextPages.length > 0
          ? getPageSafeSlug(nextPages[fallbackPageIndex], fallbackPageIndex)
          : "home";

      setPages(nextPages);
      setDraftPageSlugs(nextPages.map((entry, index) => getPageSafeSlug(entry, index)));
      setActivePreviewSlug(fallbackSlug);
      setIsPageEditingMode(false);
      setSelectedEditorElement(null);
      clearSelectedEditorImage();
      await releaseSectionLock(`page:${normalizedSlug}`).catch(() => undefined);

      setNotice(
        `Deleted page "${page.title.trim() || normalizedSlug}". Save your pages before publishing.`
      );
      setNoticeKind("notice");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to delete page.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setDeletePageBusy(false);
    }
  }, [
    canEditDraft,
    clearSelectedEditorImage,
    deletedPageSlugsRef,
    draftState,
    pages,
    releaseSectionLock,
    setActivePreviewSlug,
    setDeletePageBusy,
    setDraftPageSlugs,
    setDraftState,
    setIsPageEditingMode,
    setNotice,
    setNoticeKind,
    setPages,
    setSelectedEditorElement,
    touchedPageSlugsRef
  ]);
