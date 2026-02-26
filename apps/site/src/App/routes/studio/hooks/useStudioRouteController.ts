import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import type { NoticeKind } from "../../../types/notice";
import { useStudioDraftData } from "./useStudioDraftData";
import { mapDraftItemToSiteListItem } from "../services/studio-draft-mappers";

export const useStudioRouteController = () => {
  const navigate = useNavigate();

  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);

  const { session } = useAuth();

  const { ownedDraftItems, sharedDraftItems, draftsLoading } = useStudioDraftData({
    session,
    setNotice,
    setNoticeKind
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
      onEdit: (id: string) => navigate(`/studio/builder?draftId=${id}`),
      onCreate: () => navigate("/site-create"),
      onSettings: (id: string) => navigate(`/studio/settings?draftId=${id}`)
    },
    indexesProps: {
      onCreate: () => navigate("/site-create")
    }
  };
};
