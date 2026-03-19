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
          <strong>{state.archive.title || "Untitled index"}</strong>
        </div>
        <div>
          <span className="builder-collaborator-hint">Live URL</span>
          {state.archive.canonicalUrl ? (
            <a href={state.archive.canonicalUrl} target="_blank" rel="noreferrer">
              {state.archive.canonicalUrl}
            </a>
          ) : (
            <strong>-</strong>
          )}
        </div>
        <div>
          <span className="builder-collaborator-hint">Index level</span>
          <strong>{typeof state.archive.indexLevel === "number" ? state.archive.indexLevel : "-"}</strong>
        </div>
        <div>
          <span className="builder-collaborator-hint">Connected sites</span>
          <strong>{state.connections.length}</strong>
        </div>
      </div>

      {state.archive.description ? <p>{state.archive.description}</p> : null}

      <div className="admin-setup-links">
        {state.archive.canonicalUrl ? (
          <a href={state.archive.canonicalUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
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
