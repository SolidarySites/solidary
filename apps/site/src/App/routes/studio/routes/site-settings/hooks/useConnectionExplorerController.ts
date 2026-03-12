import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../../features/auth/hooks/useAuth";
import type { NoticeKind } from "../../../../../types/notice";
import {
  compareApprovedConnectionsAgainstLiveMetadata,
  getApprovedConnectionCounterparty,
  hasApprovedConnectionLiveMetadataDrift,
  loadLiveSolidaryLinksRaw,
  type ApprovedConnectionLiveMetadata
} from "../services/approved-connection-live-metadata";
import {
  listSiteConnectionRequests,
  resolveConnectionExplorerContext,
  respondToSiteConnectionRequest,
  searchConnectionTargets,
  sendSiteConnectionInvite,
  type ConnectionExplorerContext,
  type ConnectionTarget,
  type SearchMode,
  type SiteConnectionRequest
} from "../services/site-connections";

const canManageConnectionsForRole = (role: ConnectionExplorerContext["accessRole"]) =>
  role === "owner" || role === "admin";

const getFriendlyErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

type UseConnectionExplorerControllerParams = {
  draftId: string | null;
  refreshVersion?: number;
};

export const useConnectionExplorerController = ({
  draftId,
  refreshVersion = 0
}: UseConnectionExplorerControllerParams) => {
  const { session, sessionResolved } = useAuth();

  const draftIdParam = draftId?.trim() ?? "";
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);

  const [context, setContext] = useState<ConnectionExplorerContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);

  const [searchMode, setSearchMode] = useState<SearchMode>("site");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConnectionTarget[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sendingInviteSiteId, setSendingInviteSiteId] = useState<string | null>(null);

  const [requests, setRequests] = useState<SiteConnectionRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [approvedConnectionLiveMetadata, setApprovedConnectionLiveMetadata] = useState<
    ApprovedConnectionLiveMetadata[]
  >([]);
  const [approvedConnectionsComparisonError, setApprovedConnectionsComparisonError] = useState<
    string | null
  >(null);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);

  const canManageConnections = canManageConnectionsForRole(context?.accessRole ?? null);

  const incomingPendingRequests = useMemo(
    () => requests.filter((request) => request.isIncoming && request.status === "pending"),
    [requests]
  );
  const outgoingPendingRequests = useMemo(
    () => requests.filter((request) => !request.isIncoming && request.status === "pending"),
    [requests]
  );
  const approvedRequests = useMemo(
    () => requests.filter((request) => request.status === "approved"),
    [requests]
  );
  const approvedConnectionLiveMetadataByRequestId = useMemo(
    () => new Map(approvedConnectionLiveMetadata.map((entry) => [entry.requestId, entry])),
    [approvedConnectionLiveMetadata]
  );
  const approvedConnections = useMemo(
    () =>
      approvedRequests.map((request) => {
        const counterparty = getApprovedConnectionCounterparty(request);
        const liveMetadata = approvedConnectionLiveMetadataByRequestId.get(request.requestId);

        return {
          ...request,
          connectedSiteId: counterparty.siteId,
          connectedSiteTitle: counterparty.siteTitle,
          currentCanonicalUrl: liveMetadata?.currentCanonicalUrl ?? counterparty.currentCanonicalUrl,
          liveRepoUrl: liveMetadata?.liveRepoUrl ?? null,
          isLiveMetadataStale: liveMetadata?.isLiveMetadataStale ?? false
        };
      }),
    [approvedConnectionLiveMetadataByRequestId, approvedRequests]
  );
  const hasApprovedConnectionsLiveMetadataDrift = useMemo(
    () => hasApprovedConnectionLiveMetadataDrift(approvedConnectionLiveMetadata),
    [approvedConnectionLiveMetadata]
  );

  const loadRequests = useCallback(async (explorerContext: ConnectionExplorerContext) => {
    setRequestsLoading(true);
    setRequestsError(null);
    setApprovedConnectionLiveMetadata([]);
    setApprovedConnectionsComparisonError(null);
    try {
      const rows = await listSiteConnectionRequests({ siteId: explorerContext.siteId });
      setRequests(rows);

      const approvedRows = rows.filter((request) => request.status === "approved");
      if (!approvedRows.length) {
        return;
      }

      try {
        const liveSolidaryLinksRaw = await loadLiveSolidaryLinksRaw({
          repoFullName: explorerContext.repoFullName,
          branch: explorerContext.branch
        });
        setApprovedConnectionLiveMetadata(
          compareApprovedConnectionsAgainstLiveMetadata({
            approvedRequests: approvedRows,
            liveSolidaryLinksRaw
          })
        );
      } catch (error) {
        setApprovedConnectionLiveMetadata([]);
        setApprovedConnectionsComparisonError(
          getFriendlyErrorMessage(error, "Failed to compare live connection metadata.")
        );
      }
    } catch (error) {
      setRequests([]);
      setRequestsError(getFriendlyErrorMessage(error, "Failed to load connection requests."));
      setApprovedConnectionLiveMetadata([]);
      setApprovedConnectionsComparisonError(null);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionResolved) return;

    if (!session) {
      setContext(null);
      setRequests([]);
      setRequestsError(null);
      setApprovedConnectionLiveMetadata([]);
      setApprovedConnectionsComparisonError(null);
      setContextError("Sign in with GitHub to manage site connections.");
      setContextLoading(false);
      return;
    }

    if (!draftIdParam) {
      setContext(null);
      setRequests([]);
      setRequestsError(null);
      setApprovedConnectionLiveMetadata([]);
      setApprovedConnectionsComparisonError(null);
      setContextError("Save your draft first to manage site connections.");
      setContextLoading(false);
      return;
    }

    let cancelled = false;
    setContextLoading(true);
    setContextError(null);
    setNotice(null);
    setNoticeKind(null);

    void (async () => {
      try {
        const resolved = await resolveConnectionExplorerContext({
          draftId: draftIdParam,
          userId: session.user.id
        });
        if (cancelled) return;

        setContext(resolved);
        if (canManageConnectionsForRole(resolved.accessRole)) {
          await loadRequests(resolved);
        } else {
          setRequests([]);
          setApprovedConnectionLiveMetadata([]);
          setApprovedConnectionsComparisonError(null);
          setRequestsError("Only site owners/admins can review or respond to connection requests.");
        }
      } catch (error) {
        if (cancelled) return;
        setContext(null);
        setApprovedConnectionLiveMetadata([]);
        setApprovedConnectionsComparisonError(null);
        setContextError(getFriendlyErrorMessage(error, "Failed to load site connection settings."));
      } finally {
        if (!cancelled) {
          setContextLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftIdParam, loadRequests, refreshVersion, session, sessionResolved]);

  useEffect(() => {
    if (!context || !canManageConnections) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      void (async () => {
        try {
          const rows = await searchConnectionTargets({
            sourceSiteId: context.siteId,
            mode: searchMode,
            query,
            limit: 20
          });
          if (cancelled) return;
          setSearchResults(rows);
        } catch (error) {
          if (cancelled) return;
          setSearchResults([]);
          setSearchError(getFriendlyErrorMessage(error, "Search failed."));
        } finally {
          if (!cancelled) {
            setSearchLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [canManageConnections, context, searchMode, searchQuery]);

  const refreshSearchResults = useCallback(async () => {
    const query = searchQuery.trim();
    if (!context || !canManageConnections || query.length < 2) {
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const rows = await searchConnectionTargets({
        sourceSiteId: context.siteId,
        mode: searchMode,
        query,
        limit: 20
      });
      setSearchResults(rows);
    } catch (error) {
      setSearchError(getFriendlyErrorMessage(error, "Search failed."));
    } finally {
      setSearchLoading(false);
    }
  }, [canManageConnections, context, searchMode, searchQuery]);

  const handleSendInvite = async (targetSiteId: string) => {
    if (!context || !canManageConnections) return;

    setSendingInviteSiteId(targetSiteId);
    setNotice(null);
    setNoticeKind(null);
    try {
      const result = await sendSiteConnectionInvite({
        sourceSiteId: context.siteId,
        targetSiteId
      });
      setNotice(`Connection invite sent. Connection UUID: ${result.connectionUuid}`);
      setNoticeKind("notice");
      await Promise.all([loadRequests(context), refreshSearchResults()]);
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Failed to send connection invite."));
      setNoticeKind("error");
    } finally {
      setSendingInviteSiteId(null);
    }
  };

  const handleRespondToRequest = async (requestId: string, action: "approve" | "reject") => {
    if (!context || !canManageConnections) return;

    setRespondingRequestId(requestId);
    setNotice(null);
    setNoticeKind(null);
    try {
      const result = await respondToSiteConnectionRequest({ requestId, action });
      if (result.status === "approved") {
        setNotice(`Connection approved. UUID: ${result.connectionUuid}`);
      } else {
        setNotice("Connection request rejected.");
      }
      setNoticeKind("notice");
      await Promise.all([loadRequests(context), refreshSearchResults()]);
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Failed to update connection request."));
      setNoticeKind("error");
    } finally {
      setRespondingRequestId(null);
    }
  };

  return {
    notice,
    noticeKind,
    context,
    contextLoading,
    contextError,
    canManageConnections,
    searchMode,
    searchQuery,
    searchResults,
    searchLoading,
    searchError,
    sendingInviteSiteId,
    requestsLoading,
    requestsError,
    incomingPendingRequests,
    outgoingPendingRequests,
    approvedRequests,
    approvedConnections,
    approvedConnectionsComparisonError,
    hasApprovedConnectionsLiveMetadataDrift,
    respondingRequestId,
    onSearchModeChange: setSearchMode,
    onSearchQueryChange: setSearchQuery,
    onSendInvite: (targetSiteId: string) => {
      void handleSendInvite(targetSiteId);
    },
    onRespondToRequest: (requestId: string, action: "approve" | "reject") => {
      void handleRespondToRequest(requestId, action);
    }
  };
};
