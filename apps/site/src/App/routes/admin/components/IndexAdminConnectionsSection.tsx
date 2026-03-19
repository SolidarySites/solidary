import type { IndexAdminConnection } from "../services/types";

type IndexAdminConnectionsSectionProps = {
  connections: IndexAdminConnection[];
  canManage: boolean;
  updatingRequestId: string | null;
  onConnectionRequestAction: (
    requestId: string,
    action: "approve" | "reject" | "disconnect"
  ) => void;
};

const formatShortDate = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
};

export default function IndexAdminConnectionsSection({
  connections,
  canManage,
  updatingRequestId,
  onConnectionRequestAction
}: IndexAdminConnectionsSectionProps) {
  const pendingConnections = connections.filter((connection) => connection.status === "pending");
  const approvedConnections = connections.filter((connection) => connection.status === "approved");

  return (
    <div className="builder-section">
      <div className="section-header">
        <h2>Connections</h2>
        <p>
          Review site connection requests for this index. The public connection can be removed later
          without erasing parent-index lineage.
        </p>
      </div>

      <div className="builder-section builder-collaborator-list-section">
        <div className="section-header">
          <h3>Incoming requests</h3>
          <p>Approve or reject pending site requests targeting this index.</p>
        </div>

        {!pendingConnections.length && (
          <p className="builder-collaborator-hint">No incoming pending requests.</p>
        )}

        {pendingConnections.length > 0 && (
          <div className="connection-request-list">
            {pendingConnections.map((connection) => {
              const isUpdating = updatingRequestId === connection.requestId;
              return (
                <article className="connection-request-card" key={connection.requestId}>
                  <div className="connection-request-header">
                    <h4>{connection.sourceSiteTitle}</h4>
                    <span>{formatShortDate(connection.createdAt) ?? "Pending"}</span>
                  </div>
                  <p>From {connection.sourceOwnerDisplayName}</p>
                  {connection.sourceSiteUrl ? (
                    <a href={connection.sourceSiteUrl} target="_blank" rel="noreferrer">
                      {connection.sourceSiteUrl}
                    </a>
                  ) : null}
                  <p className="connection-request-uuid">
                    Connection UUID: {connection.connectionUuid}
                  </p>
                  {!canManage ? (
                    <p className="builder-collaborator-hint">
                      Your current role can view requests but cannot respond to them.
                    </p>
                  ) : (
                    <div className="connection-request-actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={isUpdating}
                        onClick={() =>
                          onConnectionRequestAction(connection.requestId, "approve")
                        }
                      >
                        {isUpdating ? "Working..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={isUpdating}
                        onClick={() =>
                          onConnectionRequestAction(connection.requestId, "reject")
                        }
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="builder-section builder-collaborator-list-section">
        <div className="section-header">
          <h3>Approved connections</h3>
          <p>Sites that currently have an approved public connection to this index.</p>
        </div>

        {!approvedConnections.length && (
          <p className="builder-collaborator-hint">No approved connections yet.</p>
        )}

        {approvedConnections.length > 0 && (
          <div className="connection-request-list">
            {approvedConnections.map((connection) => {
              const isUpdating = updatingRequestId === connection.requestId;
              return (
                <article className="connection-request-card" key={connection.requestId}>
                  <div className="connection-request-header">
                    <h4>{connection.sourceSiteTitle}</h4>
                    <span>
                      {formatShortDate(connection.respondedAt ?? connection.createdAt) ?? "Approved"}
                    </span>
                  </div>
                  <p>Owner: {connection.sourceOwnerDisplayName}</p>
                  {connection.sourceSiteUrl ? (
                    <a href={connection.sourceSiteUrl} target="_blank" rel="noreferrer">
                      {connection.sourceSiteUrl}
                    </a>
                  ) : null}
                  <p className="connection-request-uuid">
                    Connection UUID: {connection.connectionUuid}
                  </p>
                  {!canManage ? (
                    <p className="builder-collaborator-hint">
                      Your current role can view connection state but cannot change it.
                    </p>
                  ) : (
                    <div className="connection-request-actions">
                      <button
                        type="button"
                        className="ghost"
                        disabled={isUpdating}
                        onClick={() =>
                          onConnectionRequestAction(connection.requestId, "disconnect")
                        }
                      >
                        {isUpdating ? "Working..." : "Remove connection"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
