import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import type { NoticeKind } from "../../../types/notice";
import { useStudioDraftActions } from "./useStudioDraftActions";
import { useStudioDraftData } from "./useStudioDraftData";
import { mapDraftItemToSiteListItem } from "../services/studio-draft-mappers";
import type { DeleteMode, DeleteTarget, StudioSiteListItem } from "../services/studio-types";

export const useStudioRouteController = () => {
  const navigate = useNavigate();

  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteMode, setDeleteMode] = useState<DeleteMode | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const { session } = useAuth();

  const {
    ownedDraftItems,
    sharedDraftItems,
    draftsLoading,
    setOwnedDraftItems
  } = useStudioDraftData({
    session,
    setNotice,
    setNoticeKind
  });

  const { deleteDraft } = useStudioDraftActions({
    session,
    setNotice,
    setNoticeKind,
    setOwnedDraftItems
  });

  const ownedListItems = useMemo(
    () => ownedDraftItems.map((item) => mapDraftItemToSiteListItem(item, { accessRole: "owner" })),
    [ownedDraftItems]
  );

  const sharedListItems = useMemo(
    () => sharedDraftItems.map((item) => mapDraftItemToSiteListItem(item)),
    [sharedDraftItems]
  );

  const allSiteListItems = useMemo(() => {
    const mergedItems = [...ownedListItems, ...sharedListItems];
    return mergedItems.sort((left, right) => {
      const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0;
      const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0;
      return rightTime - leftTime;
    });
  }, [ownedListItems, sharedListItems]);

  const closeDeleteDialog = () => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteMode(null);
    setDeleteConfirmText("");
  };

  const confirmDeleteDialog = async () => {
    if (!deleteTarget || !deleteMode) return;
    if (deleteMode === "github" && deleteConfirmText.trim() !== deleteTarget.repoFullName) {
      setNotice("Repo name did not match. Deletion cancelled.");
      setNoticeKind("notice");
      return;
    }

    setDeleteBusy(true);
    try {
      await deleteDraft({
        id: deleteTarget.id,
        repoFullName: deleteTarget.repoFullName
      }, deleteMode);
      setDeleteTarget(null);
      setDeleteMode(null);
      setDeleteConfirmText("");
    } finally {
      setDeleteBusy(false);
    }
  };

  return {
    session,
    notice,
    noticeKind,
    shouldShowSections: Boolean(session),
    ownedSitesProps: {
      title: "Your sites",
      emptyMessage: "No sites yet. Create one to see it here.",
      items: allSiteListItems,
      loading: draftsLoading,
      showThumbnails: true,
      onEdit: (id: string) => navigate(`/site-builder?draftId=${id}`),
      onCreate: () => navigate("/site-create"),
      onDelete: (item: StudioSiteListItem) => {
        setDeleteTarget({
          id: item.id,
          repoFullName: item.repoFullName,
          title: item.title
        });
        setDeleteMode(null);
        setDeleteConfirmText("");
      }
    },
    indexesProps: {
      onCreate: () => navigate("/site-create")
    },
    deleteDialogProps: {
      open: Boolean(deleteTarget),
      title: deleteTarget?.title ?? "",
      repoFullName: deleteTarget?.repoFullName ?? "",
      mode: deleteMode,
      confirmText: deleteConfirmText,
      busy: deleteBusy,
      onModeChange: setDeleteMode,
      onConfirmTextChange: setDeleteConfirmText,
      onCancel: closeDeleteDialog,
      onConfirm: () => {
        void confirmDeleteDialog();
      }
    }
  };
};
