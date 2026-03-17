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

const FINALIZATION_PHASE_LABELS = {
  prepare_manifest: "Preparing manifest",
  materialize_blobs: "Writing files",
  commit_finalize: "Finishing setup"
} as const;

type IndexAdminSetupPanelProps = {
  archive: IndexAdminArchiveState;
  setup: IndexAdminSetup | null;
  highlight: boolean;
  startingFinalization: boolean;
  configuringStandaloneAuth: boolean;
  deployingFunctions: boolean;
  setupLoading: boolean;
  githubClientId: string;
  githubClientSecret: string;
  supabasePersonalAccessToken: string;
  onGithubClientIdChange: (value: string) => void;
  onGithubClientSecretChange: (value: string) => void;
  onSupabasePersonalAccessTokenChange: (value: string) => void;
  onConfigureStandaloneAuth: () => void;
  onFinalizeIndex: () => void;
  onDeployFunctions: () => void;
  onRefreshSetup: () => void;
  onCopyValue: (value: string, successMessage: string) => void;
};

type CopyValueRowProps = {
  label: string;
  value: string | null | undefined;
  onCopyValue: (value: string, successMessage: string) => void;
};

function CopyValueRow({ label, value, onCopyValue }: CopyValueRowProps) {
  const trimmedValue = value?.trim() ?? "";

  return (
    <div className="admin-copy-row">
      <div>
        <dt>{label}</dt>
        <dd>{trimmedValue || "-"}</dd>
      </div>
      <button
        type="button"
        className="ghost admin-inline-copy-button"
        onClick={() => onCopyValue(trimmedValue, `${label} copied.`)}
        disabled={!trimmedValue}
      >
        Copy
      </button>
    </div>
  );
}

export default function IndexAdminSetupPanel({
  archive,
  setup,
  highlight,
  startingFinalization,
  configuringStandaloneAuth,
  deployingFunctions,
  setupLoading,
  githubClientId,
  githubClientSecret,
  supabasePersonalAccessToken,
  onGithubClientIdChange,
  onGithubClientSecretChange,
  onSupabasePersonalAccessTokenChange,
  onConfigureStandaloneAuth,
  onFinalizeIndex,
  onDeployFunctions,
  onRefreshSetup,
  onCopyValue
}: IndexAdminSetupPanelProps) {
  const authSetup = setup?.authSetup ?? null;
  const finalization = setup?.finalization ?? null;
  const functionsDeployment = setup?.functionsDeployment ?? null;
  const canFinalize = Boolean(finalization?.available) && !startingFinalization;
  const isFinalized = Boolean(finalization?.isFinalized);
  const canConfigureAuth =
    !configuringStandaloneAuth && githubClientId.trim().length > 0 && githubClientSecret.trim().length > 0;
  const canDeployFunctions =
    !deployingFunctions &&
    (
      supabasePersonalAccessToken.trim().length > 0 ||
      functionsDeployment?.requiredSecrets.every((secret) => secret.isConfigured)
    ) &&
    functionsDeployment?.status !== "running";

  return (
    <section className={`builder-section admin-setup-panel ${highlight ? "is-highlighted" : ""}`.trim()}>
      <div className="section-header">
        <h2>{highlight ? "Index created" : "Standalone setup"}</h2>
        <p>
          {highlight
            ? "Stay here until the child index can run on its own."
            : "This fallback view reads the same setup state as the guided wizard."}
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
        <button type="button" className="ghost" onClick={onRefreshSetup} disabled={setupLoading}>
          {setupLoading ? "Checking..." : "Check setup"}
        </button>
      </div>

      {setup && (
        <div className="admin-setup-grid">
          <div className="admin-setup-card">
            <h3>Child auth</h3>
            <p>Paste the GitHub OAuth app credentials once. Solidary configures the child project for you.</p>

            <dl>
              <CopyValueRow label="Site URL" value={authSetup?.siteUrl} onCopyValue={onCopyValue} />
              <CopyValueRow
                label="Auth callback URL"
                value={authSetup?.callbackUrl}
                onCopyValue={onCopyValue}
              />
              <CopyValueRow
                label="Suggested app name"
                value={authSetup?.githubOauthAppName}
                onCopyValue={onCopyValue}
              />
              <div>
                <dt>Status</dt>
                <dd>{authSetup?.message || "Status unavailable."}</dd>
              </div>
              <div>
                <dt>Provider ready</dt>
                <dd>{authSetup?.localAuthReady ? "Ready" : "Still needs setup"}</dd>
              </div>
            </dl>

            <label>
              GitHub client id
              <input
                value={githubClientId}
                onChange={(event) => onGithubClientIdChange(event.target.value)}
                autoComplete="off"
              />
            </label>

            <label>
              GitHub client secret
              <input
                type="password"
                value={githubClientSecret}
                onChange={(event) => onGithubClientSecretChange(event.target.value)}
                autoComplete="new-password"
              />
            </label>

            <label>
              Supabase personal access token
              <input
                type="password"
                value={supabasePersonalAccessToken}
                onChange={(event) => onSupabasePersonalAccessTokenChange(event.target.value)}
                autoComplete="new-password"
              />
              <span className="admin-field-hint">
                Optional fallback if Supabase blocks the automatic Auth update.
              </span>
            </label>

            <div className="admin-finalization-actions">
              {authSetup?.githubOauthAppUrl ? (
                <a
                  href={authSetup.githubOauthAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open GitHub OAuth apps
                </a>
              ) : null}
              {authSetup?.providerSettingsUrl ? (
                <a
                  href={authSetup.providerSettingsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open provider settings
                </a>
              ) : null}
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open token page
              </a>
              <button
                type="button"
                className="site-card-action-link admin-finalization-button"
                onClick={onConfigureStandaloneAuth}
                disabled={!canConfigureAuth}
              >
                {configuringStandaloneAuth ? "Configuring..." : "Configure child auth"}
              </button>
            </div>
          </div>

          <div className="admin-setup-card">
            <h3>Finalize child repo</h3>
            <p>Copy the standalone app into the child repo once local auth is ready.</p>

            <dl>
              <div>
                <dt>Status</dt>
                <dd>{finalization?.status ?? "idle"}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{finalization?.phase ? FINALIZATION_PHASE_LABELS[finalization.phase] : "-"}</dd>
              </div>
              <div>
                <dt>Current step</dt>
                <dd>{finalization?.step || "-"}</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>
                  {finalization?.progressTotal
                    ? `${finalization.progressCurrent ?? 0} / ${finalization.progressTotal}`
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
              {finalization?.sourceRepoMessage ? (
                <div>
                  <dt>Source note</dt>
                  <dd>{finalization.sourceRepoMessage}</dd>
                </div>
              ) : null}
              {finalization?.error ? (
                <div>
                  <dt>Latest error</dt>
                  <dd>{finalization.error}</dd>
                </div>
              ) : null}
            </dl>

            <div className="admin-finalization-actions">
              {!isFinalized && (
                <button
                  type="button"
                  className="site-card-action-link admin-finalization-button"
                  onClick={onFinalizeIndex}
                  disabled={!canFinalize || finalization?.isRunning}
                >
                  {startingFinalization || finalization?.isRunning
                    ? "Finalising..."
                    : finalization?.canRetry
                      ? "Retry child setup"
                      : "Finish child setup"}
                </button>
              )}
              {setup.repoUrl ? (
                <a href={setup.repoUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
                  Open child repo
                </a>
              ) : null}
            </div>
          </div>

          <div className="admin-setup-card">
            <h3>Deploy child functions</h3>
            <p>Paste a Supabase personal access token once to save the workflow secrets. After that, retries can run without re-entering it.</p>

            <dl>
              <div>
                <dt>Status</dt>
                <dd>
                  {functionsDeployment
                    ? FUNCTIONS_DEPLOY_STATUS_LABELS[functionsDeployment.status]
                    : "-"}
                </dd>
              </div>
              {functionsDeployment?.message ? (
                <div>
                  <dt>Deploy note</dt>
                  <dd>{functionsDeployment.message}</dd>
                </div>
              ) : null}
            </dl>

            <div className="admin-required-secrets">
              <h4>Required repo secrets</h4>
              <dl>
                {functionsDeployment?.requiredSecrets.map((secret) => (
                  <div key={secret.name}>
                    <dt>{secret.name}</dt>
                    <dd>
                      {secret.isConfigured ? "Configured" : "Missing"}
                      {secret.value ? ` - ${secret.value}` : ""}
                      {secret.description ? ` - ${secret.description}` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <label>
              Supabase personal access token
              <input
                type="password"
                value={supabasePersonalAccessToken}
                onChange={(event) => onSupabasePersonalAccessTokenChange(event.target.value)}
                autoComplete="new-password"
              />
            </label>

            <div className="admin-finalization-actions">
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open token page
              </a>
              {functionsDeployment?.workflowUrl ? (
                <a
                  href={functionsDeployment.workflowUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open workflow
                </a>
              ) : null}
              {functionsDeployment?.runUrl ? (
                <a
                  href={functionsDeployment.runUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open latest run
                </a>
              ) : null}
              <button
                type="button"
                className="site-card-action-link admin-finalization-button"
                onClick={onDeployFunctions}
                disabled={!canDeployFunctions}
              >
                {deployingFunctions ? "Deploying..." : "Deploy child functions"}
              </button>
            </div>
          </div>

          <div className="admin-setup-card">
            <h3>Launch</h3>
            <p>Open the standalone child app directly once the setup is complete.</p>

            <div className="admin-setup-links">
              {archive.canonicalUrl && (
                <a href={archive.canonicalUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
                  Open index
                </a>
              )}
              {finalization?.targetSearchUrl && (
                <a
                  href={finalization.targetSearchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open Search
                </a>
              )}
              {finalization?.targetExplorerUrl && (
                <a
                  href={finalization.targetExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
                  Open Explorer
                </a>
              )}
              {finalization?.targetStudioUrl && (
                <a
                  href={finalization.targetStudioUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="site-card-action-link"
                >
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
