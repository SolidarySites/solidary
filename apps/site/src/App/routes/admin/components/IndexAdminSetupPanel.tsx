import type { IndexAdminArchiveState, IndexAdminSetup } from "../services/types";

const FINALIZATION_SOURCE_STATUS_LABELS = {
  child_lineage: "Stored on child index",
  solidary_lineage: "Recovered from Solidary",
  root_fallback: "Solidary root fallback",
  missing: "Missing lineage"
} as const;

const FUNCTIONS_DEPLOY_STATUS_LABELS = {
  not_ready: "Not ready",
  needs_secrets: "Needs repo secrets",
  ready_to_run: "Ready to deploy",
  running: "Workflow running",
  failed: "Workflow failed",
  deployed: "Functions deployed",
  unknown: "Status unavailable"
} as const;

type IndexAdminSetupPanelProps = {
  archive: IndexAdminArchiveState;
  setup: IndexAdminSetup | null;
  highlight: boolean;
  startingFinalization: boolean;
  onFinalizeIndex: () => void;
};

export default function IndexAdminSetupPanel({
  archive,
  setup,
  highlight,
  startingFinalization,
  onFinalizeIndex
}: IndexAdminSetupPanelProps) {
  const finalization = setup?.finalization;
  const canFinalize = Boolean(finalization?.available) && !startingFinalization;
  const isRunning = Boolean(finalization?.isRunning);
  const isFinalized = Boolean(finalization?.isFinalized);
  const functionsReady = finalization?.functionsDeployStatus === "deployed";
  const showFunctionsSetup = isFinalized && !functionsReady;
  const finalizationHeading = !isFinalized
    ? "Finalise Index"
    : functionsReady
      ? "Standalone app ready"
      : "Finalize Index Setup";
  const finalizationLead = !isFinalized
    ? "Copy the parent index app into this child repo once the standalone auth setup is working."
    : functionsReady
      ? "The child repo now runs its own Search, Explorer, Studio, and functions."
      : "The child repo has been copied. Add the required repo secrets and run the Deploy Supabase Functions workflow to make the copied runtime operational.";

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

          <div className="admin-setup-card">
            <h3>{finalizationHeading}</h3>
            <p>{finalizationLead}</p>

            <dl>
              <div>
                <dt>Status</dt>
                <dd>{finalization?.status ?? "idle"}</dd>
              </div>
              <div>
                <dt>Step</dt>
                  <dd>{finalization?.step || "-"}</dd>
                </div>
                <div>
                  <dt>Functions deploy</dt>
                  <dd>
                    {finalization
                      ? FUNCTIONS_DEPLOY_STATUS_LABELS[finalization.functionsDeployStatus]
                      : "-"}
                  </dd>
                </div>
              <div>
                <dt>Source repo</dt>
                <dd>
                  {finalization?.sourceRepoUrl ? (
                    <a href={finalization.sourceRepoUrl} target="_blank" rel="noreferrer">
                      {finalization.sourceRepoFullName || finalization.sourceRepoUrl}
                    </a>
                  ) : (
                    finalization?.sourceRepoFullName || "-"
                  )}
                </dd>
              </div>
              <div>
                <dt>Source status</dt>
                <dd>
                  {finalization
                    ? FINALIZATION_SOURCE_STATUS_LABELS[finalization.sourceRepoStatus]
                    : "-"}
                </dd>
              </div>
              {finalization?.sourceRepoMessage && (
                <div>
                  <dt>Source note</dt>
                  <dd>{finalization.sourceRepoMessage}</dd>
                </div>
              )}
              {finalization?.functionsDeployMessage && (
                <div>
                  <dt>Deploy note</dt>
                  <dd>{finalization.functionsDeployMessage}</dd>
                </div>
              )}
              {finalization?.error && (
                <div>
                  <dt>Latest error</dt>
                  <dd>{finalization.error}</dd>
                </div>
              )}
            </dl>

            {showFunctionsSetup && (
              <div className="admin-setup-card">
                <h4>Required repo secrets</h4>
                <dl>
                  {finalization?.requiredRepoSecrets.map((secret) => (
                    <div key={secret.name}>
                      <dt>{secret.name}</dt>
                      <dd>
                        {secret.isConfigured ? "Configured" : "Missing"}
                        {secret.value ? ` — ${secret.value}` : ""}
                        {secret.description ? ` — ${secret.description}` : ""}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="admin-finalization-actions">
              {!isFinalized && (
                <button
                  type="button"
                  className="site-card-action-link admin-finalization-button"
                  onClick={onFinalizeIndex}
                  disabled={!canFinalize || isRunning}
                >
                  {startingFinalization || isRunning ? "Finalising..." : "Finalise Index"}
                </button>
              )}

              {showFunctionsSetup && finalization?.functionsDeployWorkflowUrl && (
                <a
                  href={finalization.functionsDeployWorkflowUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open Deploy Functions workflow
                </a>
              )}
              {showFunctionsSetup && finalization?.functionsDeployRunUrl && (
                <a
                  href={finalization.functionsDeployRunUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open latest workflow run
                </a>
              )}

              {functionsReady && finalization?.targetSearchUrl && (
                <a href={finalization.targetSearchUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
                  Open Search
                </a>
              )}
              {functionsReady && finalization?.targetExplorerUrl && (
                <a
                  href={finalization.targetExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open Explorer
                </a>
              )}
              {functionsReady && finalization?.targetStudioUrl && (
                <a href={finalization.targetStudioUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
                  Open Studio
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
