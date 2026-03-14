import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { getSessionDisplayName } from "../../../features/auth/services/user-profile";
import type { NoticeKind } from "../../../types/notice";
import { useStudioDraftData } from "./useStudioDraftData";
import { mapDraftItemToSiteListItem } from "../services/studio-draft-mappers";
import { useStudioSupabaseConnectionStatus } from "./useStudioSupabaseConnectionStatus";
import { useStudioIndexData } from "./useStudioIndexData";

export const useStudioRouteController = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);

  const { session, sessionResolved, signInWithGitHub } = useAuth();
  const hasSupabaseConnection = useStudioSupabaseConnectionStatus({ session });
  const { items: indexItems, loading: indexesLoading } = useStudioIndexData({
    session,
    setNotice,
    setNoticeKind
  });

  const { ownedDraftItems, sharedDraftItems, draftsLoading } = useStudioDraftData({
    session,
    setNotice,
    setNoticeKind
  });

  const accountName = useMemo(() => getSessionDisplayName(session), [session]);
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

  const navigationNotice = location.state as
    | {
        indexCreateSuccessNotice?: string;
      }
    | null;

  const activeNotice = notice ?? navigationNotice?.indexCreateSuccessNotice ?? null;
  const activeNoticeKind = noticeKind ?? (navigationNotice?.indexCreateSuccessNotice ? "notice" : null);

  useEffect(() => {
    if (!navigationNotice?.indexCreateSuccessNotice) {
      return;
    }

    navigate(location.pathname, {
      replace: true,
      state: null
    });
  }, [location.pathname, navigate, navigationNotice?.indexCreateSuccessNotice]);

  return {
    session,
    sessionResolved,
    notice: activeNotice,
    noticeKind: activeNoticeKind,
    shouldShowSections: Boolean(session),
    shouldShowIndexesSection: Boolean(session) && hasSupabaseConnection,
    mastheadProps: {
      sessionResolved,
      isAuthenticated: Boolean(session),
      accountName,
      totalSiteCount: allSiteListItems.length,
      ownedSiteCount: ownedListItems.length,
      sharedSiteCount: sharedListItems.length,
      onSignIn: () => {
        void signInWithGitHub("/studio").catch((error) => {
          const message =
            error instanceof Error && error.message.trim()
              ? error.message
              : "Could not sign in with GitHub.";
          setNotice(message);
          setNoticeKind("error");
        });
      }
    },
    ownedSitesProps: {
      title: "Sites",
      description:
        "Create a new site and edit existing ones.",
      emptyMessage: "No sites yet. Create one to see it here.",
      items: allSiteListItems,
      loading: draftsLoading,
      showThumbnails: true,
      actionLabel: "Create new site",
      getEditHref: (id: string) => `/studio/builder?draftId=${id}`,
      onCreate: () => navigate("/site-create"),
      getSettingsHref: (id: string) => `/studio/settings?draftId=${id}`
    },
    indexesProps: {
      title: "Indexes",
      description:
        "Create your own index and let others publish their sites to it.",
      emptyMessage: "No saved indexes yet. Create one to see it here.",
      items: indexItems,
      loading: indexesLoading,
      actionLabel: "Create new index",
      onCreate: () => navigate("/index-create")
    }
  };
};
