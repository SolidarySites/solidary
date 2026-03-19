import type { IndexAdminState } from "../services/types";

type RootAdminOverviewSectionProps = {
  state: IndexAdminState;
  onLogout: () => void;
};

export default function RootAdminOverviewSection({
  state,
  onLogout
}: RootAdminOverviewSectionProps) {
  return (
    <section className="builder-section">
      <div className="section-header">
        <h2>Root Index</h2>
        <p>
          This page manages the Solidary root index only. Child indexes keep their own admin and
          provisioning flows inside their own projects.
        </p>
      </div>

      <div className="admin-general-readonly-grid">
        <div>
          <span className="builder-collaborator-hint">Title</span>
          <strong>{state.index.title || "Untitled index"}</strong>
        </div>
        <div>
          <span className="builder-collaborator-hint">Live URL</span>
          {state.index.canonicalUrl ? (
            <a href={state.index.canonicalUrl} target="_blank" rel="noreferrer">
              {state.index.canonicalUrl}
            </a>
          ) : (
            <strong>-</strong>
          )}
        </div>
        <div>
          <span className="builder-collaborator-hint">Index level</span>
          <strong>{typeof state.index.indexLevel === "number" ? state.index.indexLevel : "-"}</strong>
        </div>
        <div>
          <span className="builder-collaborator-hint">Connected sites</span>
          <strong>{state.connections.length}</strong>
        </div>
      </div>

      {state.index.description ? <p>{state.index.description}</p> : null}

      <div className="admin-setup-links">
        {state.index.canonicalUrl ? (
          <a href={state.index.canonicalUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
            Open live root index
          </a>
        ) : null}
        <button type="button" className="ghost" onClick={onLogout}>
          Lock /admin
        </button>
      </div>
    </section>
  );
}
