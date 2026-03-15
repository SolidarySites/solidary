import type { IndexAdminConnection } from "../services/types";

type IndexAdminConnectionsSectionProps = {
  connections: IndexAdminConnection[];
  canManage: boolean;
  updatingSiteId: string | null;
  onConnectionStatusChange: (siteId: string, status: "tracked" | "delisted") => void;
};

export default function IndexAdminConnectionsSection({
  connections,
  canManage,
  updatingSiteId,
  onConnectionStatusChange
}: IndexAdminConnectionsSectionProps) {
  return (
    <div className="builder-section">
      <div className="section-header">
        <h2>Connections</h2>
        <p>
          Sites created from this index should be born connected here. The connection can be removed
          later, but the parent-index lineage stays immutable.
        </p>
      </div>

      {!connections.length && (
        <p className="builder-collaborator-hint">No connected sites are stored for this index yet.</p>
      )}

      {connections.length > 0 && (
        <div className="admin-connection-list">
          {connections.map((connection) => {
            const nextStatus = connection.status === "tracked" ? "delisted" : "tracked";
            const busy = updatingSiteId === connection.siteId;

            return (
              <article className="connection-result-card" key={connection.siteId}>
                <div className="connection-result-header">
                  <div>
                    <h4>{connection.title}</h4>
                    <span>{connection.status === "tracked" ? "Connected" : "Disconnected"}</span>
                  </div>
                  {connection.canonicalUrl ? (
                    <a href={connection.canonicalUrl} target="_blank" rel="noreferrer">
                      Visit site
                    </a>
                  ) : null}
                </div>

                {connection.description ? <p>{connection.description}</p> : null}

                <dl className="admin-connection-meta">
                  <div>
                    <dt>Site UUID</dt>
                    <dd>{connection.siteId}</dd>
                  </div>
                  <div>
                    <dt>Parent index URL</dt>
                    <dd>{connection.parentIndexUrl || "-"}</dd>
                  </div>
                  <div>
                    <dt>Parent index level</dt>
                    <dd>{typeof connection.parentIndexLevel === "number" ? connection.parentIndexLevel : "-"}</dd>
                  </div>
                </dl>

                {!canManage ? (
                  <p className="builder-collaborator-hint">
                    Your current role can view connection state but cannot change it.
                  </p>
                ) : (
                  <div className="connection-result-actions">
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      onClick={() => onConnectionStatusChange(connection.siteId, nextStatus)}
                    >
                      {busy
                        ? "Saving..."
                        : nextStatus === "tracked"
                          ? "Reconnect to index"
                          : "Disconnect from index"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
