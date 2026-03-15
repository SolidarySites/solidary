import type { IndexAdminArchiveState, IndexAdminSetup } from "../services/types";

type IndexAdminSetupPanelProps = {
  archive: IndexAdminArchiveState;
  setup: IndexAdminSetup | null;
  highlight: boolean;
};

export default function IndexAdminSetupPanel({
  archive,
  setup,
  highlight
}: IndexAdminSetupPanelProps) {
  return (
    <section className={`builder-section admin-setup-panel ${highlight ? "is-highlighted" : ""}`.trim()}>
      <div className="section-header">
        <h2>{highlight ? "Index created" : "Standalone admin"}</h2>
        <p>
          {highlight
            ? "Your index is live. Finish the standalone OAuth setup below, then use the bridge link until local auth is ready."
            : "Solidary and the standalone /admin surface both manage this same index."}
        </p>
      </div>

      <div className="admin-setup-links">
        {archive.canonicalUrl && (
          <a href={archive.canonicalUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
            Open live index
          </a>
        )}
        {setup?.standaloneAdminUrl && (
          <a
            href={setup.standaloneAdminUrl}
            target="_blank"
            rel="noreferrer"
            className="site-card-action-link"
          >
            Open standalone /admin
          </a>
        )}
        {archive.repoUrl && (
          <a href={archive.repoUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
            Open GitHub repo
          </a>
        )}
        {archive.supabaseDashboardUrl && (
          <a
            href={archive.supabaseDashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="site-card-action-link"
          >
            Open Supabase project
          </a>
        )}
      </div>

      {setup && (
        <div className="admin-setup-grid">
          <div className="admin-setup-card">
            <h3>OAuth setup</h3>
            <p>Use these values when configuring GitHub auth for the standalone index.</p>
            <dl>
              <div>
                <dt>Site URL</dt>
                <dd>{setup.liveUrl || archive.canonicalUrl || "-"}</dd>
              </div>
              <div>
                <dt>Auth callback</dt>
                <dd>{setup.authCallbackUrl || "-"}</dd>
              </div>
              <div>
                <dt>Providers page</dt>
                <dd>
                  {setup.authProvidersDashboardUrl ? (
                    <a href={setup.authProvidersDashboardUrl} target="_blank" rel="noreferrer">
                      Open provider settings
                    </a>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="admin-setup-card">
            <h3>Next steps</h3>
            <ol className="admin-setup-steps">
              {setup.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
