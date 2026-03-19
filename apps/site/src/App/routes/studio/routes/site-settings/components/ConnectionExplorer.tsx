import { useEffect } from "react";
import { useConnectionExplorerController } from "../hooks/useConnectionExplorerController";

type ConnectionExplorerProps = {
  draftId: string;
  refreshVersion?: number;
  onLiveMetadataDriftChange?: (hasDrift: boolean) => void;
};

const formatConnectionState = (value: "available" | "pending_outgoing" | "pending_incoming" | "connected") => {
  if (value === "connected") return "Connected";
  if (value === "pending_outgoing") return "Invite sent";
  if (value === "pending_incoming") return "Incoming request";
  return "Available";
};

const formatConnectionTargetType = (value: "site" | "index") => value === "index" ? "Index" : "Site";

const formatShortDate = (iso: string) => {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString();
};

const ConnectionExplorer = ({
  draftId,
  refreshVersion = 0,
  onLiveMetadataDriftChange
}: ConnectionExplorerProps) => {
  const controller = useConnectionExplorerController({ draftId, refreshVersion });
  const normalizedSearchQuery = controller.searchQuery.trim();
  const showEmptySearch =
    normalizedSearchQuery.length >= 2 &&
    !controller.searchLoading &&
    !controller.searchError &&
    controller.searchResults.length === 0;

  useEffect(() => {
    onLiveMetadataDriftChange?.(controller.hasApprovedConnectionsLiveMetadataDrift);
  }, [controller.hasApprovedConnectionsLiveMetadataDrift, onLiveMetadataDriftChange]);

  return (
    <div className="connection-explorer-card">
      {controller.notice && (
        <p
          className={
            controller.noticeKind === "error"
              ? "connection-explorer-error"
              : "connection-explorer-notice"
          }
        >
          {controller.notice}
        </p>
      )}

      {controller.contextLoading && <p>Loading site connection settings...</p>}

      {!controller.contextLoading && controller.contextError && (
        <p className="connection-explorer-error">{controller.contextError}</p>
      )}

      {!controller.contextLoading && controller.context && (
        <>
          <div className="connection-explorer-context">
            <p className="connection-explorer-context-title">{controller.context.siteTitle}</p>
            {controller.context.siteUrl && (
              <a href={controller.context.siteUrl} target="_blank" rel="noreferrer">
                {controller.context.siteUrl}
              </a>
            )}
            <p className="connection-explorer-context-role">
              Role: {controller.context.accessRole ?? "none"}
            </p>
          </div>

          {!controller.canManageConnections && (
            <p className="connection-explorer-error">
              Only site owners/admins can send invites and approve/reject requests.
            </p>
          )}

          {controller.canManageConnections && (
            <>
              <section className="connection-explorer-panel">
                <div className="section-header">
                  <h3>Find connections</h3>
                  <p>Search by user, site, or index and send a connection invite.</p>
                </div>

                <div className="connection-search-mode">
                  <button
                    type="button"
                    className={controller.searchMode === "site" ? "primary" : "ghost"}
                    onClick={() => controller.onSearchModeChange("site")}
                  >
                    Search by site
                  </button>
                  <button
                    type="button"
                    className={controller.searchMode === "user" ? "primary" : "ghost"}
                    onClick={() => controller.onSearchModeChange("user")}
                  >
                    Search by user
                  </button>
                </div>

                <label>
                  {controller.searchMode === "user" ? "User query" : "Site query"}
                  <input
                    value={controller.searchQuery}
                    onChange={(event) => controller.onSearchQueryChange(event.target.value)}
                    placeholder={
                      controller.searchMode === "user"
                        ? "GitHub username, name, or email"
                        : "Site title, URL, or repo name"
                    }
                  />
                </label>

                {controller.searchLoading && <p>Searching...</p>}
                {controller.searchError && <p className="connection-explorer-error">{controller.searchError}</p>}
                {showEmptySearch && <p>No matching connections found.</p>}

                {controller.searchResults.length > 0 && (
                  <div className="connection-search-results">
                    {controller.searchResults.map((result) => {
                      const stateLabel = formatConnectionState(result.existingState);
                      const disableInvite =
                        result.existingState !== "available" ||
                        controller.sendingInviteTargetId === result.targetId;
                      return (
                        <article key={result.targetId} className="connection-result-card">
                          <div className="connection-result-header">
                            <h4>
                              {result.title} <span className="builder-collaborator-hint">({formatConnectionTargetType(result.targetType)})</span>
                            </h4>
                            <span className="connection-result-state">{stateLabel}</span>
                          </div>
                          <p className="connection-result-owner">
                            Owner: {result.ownerDisplayName}
                            {result.ownerGithubLogin ? ` (@${result.ownerGithubLogin})` : ""}
                          </p>
                          {result.description && <p>{result.description}</p>}
                          {result.siteUrl && (
                            <a href={result.siteUrl} target="_blank" rel="noreferrer">
                              {result.siteUrl}
                            </a>
                          )}
                          <div className="connection-result-actions">
                            <button
                              type="button"
                              className="primary"
                              disabled={disableInvite}
                              onClick={() => controller.onSendInvite(result)}
                            >
                              {controller.sendingInviteTargetId === result.targetId
                                ? "Sending invite..."
                                : "Send invite"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="connection-explorer-panel">
                <div className="section-header">
                  <h3>Incoming requests</h3>
                  <p>Approve or reject pending invites sent to this site.</p>
                </div>

                {controller.requestsLoading && <p>Loading requests...</p>}
                {controller.requestsError && (
                  <p className="connection-explorer-error">{controller.requestsError}</p>
                )}

                {!controller.requestsLoading && !controller.incomingPendingRequests.length && (
                  <p>No incoming pending requests.</p>
                )}

                {!controller.requestsLoading && controller.incomingPendingRequests.length > 0 && (
                  <div className="connection-request-list">
                    {controller.incomingPendingRequests.map((request) => {
                      const isResponding = controller.respondingRequestId === request.requestId;
                      return (
                        <article key={request.requestId} className="connection-request-card">
                          <div className="connection-request-header">
                            <h4>{request.sourceSiteTitle}</h4>
                            <span>{formatShortDate(request.createdAt)}</span>
                          </div>
                          <p>From {request.sourceOwnerDisplayName}</p>
                          <p className="connection-request-uuid">
                            Connection UUID: {request.connectionUuid}
                          </p>
                          <div className="connection-request-actions">
                            <button
                              type="button"
                              className="primary"
                              disabled={isResponding}
                              onClick={() =>
                                controller.onRespondToRequest(request.requestId, "approve")
                              }
                            >
                              {isResponding ? "Working..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              disabled={isResponding}
                              onClick={() =>
                                controller.onRespondToRequest(request.requestId, "reject")
                              }
                            >
                              Reject
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="connection-explorer-panel">
                <div className="section-header">
                  <h3>Sent requests</h3>
                  <p>Pending invites this site has sent.</p>
                </div>

                {!controller.requestsLoading && !controller.outgoingPendingRequests.length && (
                  <p>No outgoing pending requests.</p>
                )}

                {!controller.requestsLoading && controller.outgoingPendingRequests.length > 0 && (
                  <div className="connection-request-list">
                    {controller.outgoingPendingRequests.map((request) => (
                      <article key={request.requestId} className="connection-request-card">
                        <div className="connection-request-header">
                          <h4>
                            {request.targetTitle} <span className="builder-collaborator-hint">({formatConnectionTargetType(request.targetType)})</span>
                          </h4>
                          <span>{formatShortDate(request.createdAt)}</span>
                        </div>
                        <p>Waiting on {request.targetOwnerDisplayName}</p>
                        <p className="connection-request-uuid">
                          Connection UUID: {request.connectionUuid}
                        </p>
                        <div className="connection-request-actions">
                          <button
                            type="button"
                            className="ghost"
                            disabled={controller.disconnectingRequestId === request.requestId}
                            onClick={() => controller.onDisconnect(request.requestId)}
                          >
                            {controller.disconnectingRequestId === request.requestId
                              ? "Working..."
                              : "Cancel invite"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="connection-explorer-panel">
                <div className="section-header">
                  <h3>Approved connections</h3>
                  <p>Connections already approved for this site.</p>
                </div>

                {controller.approvedConnectionsComparisonError && (
                  <p className="connection-explorer-error">
                    {controller.approvedConnectionsComparisonError}
                  </p>
                )}

                {!controller.requestsLoading && !controller.approvedConnections.length && (
                  <p>No approved connections yet.</p>
                )}

                {!controller.requestsLoading && controller.approvedConnections.length > 0 && (
                  <div className="connection-request-list">
                    {controller.approvedConnections.map((request) => (
                      <article key={request.requestId} className="connection-request-card">
                        <div className="connection-request-header">
                          <h4>{request.connectedSiteTitle}</h4>
                          <span>{formatShortDate(request.respondedAt ?? request.createdAt)}</span>
                        </div>
                        {request.isLiveMetadataStale && (
                          <div className="connection-request-live-metadata">
                            <p className="connection-explorer-error">Live metadata is out of date.</p>
                            <p className="connection-request-live-metadata-row">
                              <span>Live repo URL</span>
                              {request.liveRepoUrl ? (
                                <a href={request.liveRepoUrl} target="_blank" rel="noreferrer">
                                  {request.liveRepoUrl}
                                </a>
                              ) : (
                                <strong>Missing from live solidary-links.json</strong>
                              )}
                            </p>
                            <p className="connection-request-live-metadata-row">
                              <span>Current URL</span>
                              {request.currentCanonicalUrl ? (
                                <a
                                  href={request.currentCanonicalUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {request.currentCanonicalUrl}
                                </a>
                              ) : (
                                <strong>No canonical URL in the database</strong>
                              )}
                            </p>
                          </div>
                        )}
                        <p className="connection-request-uuid">
                          Connection UUID: {request.connectionUuid}
                        </p>
                        <div className="connection-request-actions">
                          <button
                            type="button"
                            className="ghost"
                            disabled={controller.disconnectingRequestId === request.requestId}
                            onClick={() => controller.onDisconnect(request.requestId)}
                          >
                            {controller.disconnectingRequestId === request.requestId
                              ? "Working..."
                              : "Remove connection"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ConnectionExplorer;
