import {
  MAX_SITE_DESCRIPTION_LENGTH,
  MAX_SITE_TITLE_LENGTH
} from "../../services/site-metadata";
import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import IndexCreateCopyField from "./components/IndexCreateCopyField";
import IndexCreateWizardStep from "./components/IndexCreateWizardStep";
import { useIndexCreateRouteController } from "./hooks/useIndexCreateRouteController";
import type { IndexCreateWizardStepKey, IndexCreateWizardStepStatus } from "./services/wizard-progress";
import "./IndexCreateRoute.css";

const SUPABASE_ACCOUNT_TOKENS_URL = "https://supabase.com/dashboard/account/tokens";
const SUPABASE_DASHBOARD_URL = "https://supabase.com/dashboard";
const FINALIZATION_PHASE_LABELS = {
  prepare_manifest: "Preparing manifest",
  materialize_blobs: "Writing files",
  commit_finalize: "Finishing setup"
} as const;

type Controller = ReturnType<typeof useIndexCreateRouteController>;

const getStepSummary = ({
  controller,
  stepKey,
  status
}: {
  controller: Controller;
  stepKey: IndexCreateWizardStepKey;
  status: IndexCreateWizardStepStatus;
}) => {
  if (status === "locked") {
    return "Complete the previous step to unlock this.";
  }

  switch (stepKey) {
    case "github_app":
      return controller.githubConnected
        ? "GitHub App connected."
        : "Connect the GitHub App so Solidary can create your child repo.";
    case "supabase":
      return controller.prerequisites.supabaseReady && controller.prerequisites.supabaseScopesReady
        ? "Supabase account connected with the required scopes."
        : "Connect Supabase so Solidary can create and configure the child project.";
    case "organization":
      return controller.selectedOrganization
        ? `${controller.selectedOrganization.name} selected.`
        : controller.archiveId
          ? "Supabase organization selected during creation."
          : "Choose which Supabase organization will own the child project.";
    case "details":
      return controller.archiveId
        ? "Index details saved."
        : controller.detailsConfirmed
        ? `Index details confirmed. Repo slug: ${controller.computedSlug}.`
        : "Name the index and confirm the GitHub repo name is available.";
    case "provision":
      return controller.archiveId
        ? "Child repo and Supabase project created."
        : "Solidary will create the repo, project, and base configuration.";
    case "supabase_pat":
      return controller.supabasePatConfirmed || controller.setup?.authSetup.localAuthReady
        ? "Supabase Personal Access Token added for the remaining setup steps."
        : "Create a Supabase Personal Access Token before continuing.";
    case "github_oauth":
      return controller.setup?.authSetup.localAuthReady
        ? "GitHub sign-in is configured for the child project."
        : controller.setup?.authSetup.message || "Create the GitHub OAuth app and paste its credentials here.";
    case "finalization":
      return controller.setup?.finalization.isFinalized
        ? "Standalone app copied into the child repo."
        : controller.setup?.finalization.progressTotal
          ? `${controller.setup.finalization.progressCurrent ?? 0}/${controller.setup.finalization.progressTotal} files processed.`
        : controller.setup?.finalization.step || "Copy the standalone app into the child repo.";
    case "functions":
      return controller.setup?.functionsDeployment.status === "deployed"
        ? "Child functions deployed."
        : controller.setup?.functionsDeployment.message || "Deploy the child Supabase functions.";
    case "launch":
      return "Open the standalone index and start using the child app directly.";
    default:
      return null;
  }
};

const renderStepContent = ({
  controller,
  stepKey
}: {
  controller: Controller;
  stepKey: IndexCreateWizardStepKey;
}) => {
  const authSetup = controller.setup?.authSetup ?? null;
  const finalization = controller.setup?.finalization ?? null;
  const functionsDeployment = controller.setup?.functionsDeployment ?? null;
  const finalizationProgressLabel = finalization?.progressTotal
    ? `${finalization.progressCurrent ?? 0} / ${finalization.progressTotal}`
    : "Waiting to start.";

  switch (stepKey) {
    case "github_app":
      return (
        <>
          <p className="index-create-step-lead">
            Solidary opens the GitHub App install flow and re-checks the connection when you come
            back.
          </p>
          <ol className="index-create-step-instructions">
            <li>Open the GitHub App connection window.</li>
            <li>Approve access for the account that should own the new index repo.</li>
            <li>Return here and click Check if this step does not advance on its own.</li>
          </ol>
          {controller.githubConnectionMessage ? (
            <p className="index-create-step-note">{controller.githubConnectionMessage}</p>
          ) : null}
          <div className="form-actions">
            <button
              type="button"
              className="primary"
              onClick={controller.onConnectGitHubApp}
              disabled={controller.githubConnectBusy}
            >
              {controller.githubConnected ? "Reconnect GitHub App" : "Connect GitHub App"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={controller.onRefreshStatuses}
              disabled={controller.statusLoading || controller.githubConnectBusy}
            >
              {controller.statusLoading ? "Checking..." : "Check connection"}
            </button>
          </div>
        </>
      );
    case "supabase":
      return (
        <>
          <p className="index-create-step-lead">
            Solidary uses your Supabase Management access to create the child project and configure
            its auth settings for you.
          </p>
          <ol className="index-create-step-instructions">
            <li>Open the Supabase connection window.</li>
            <li>Approve the requested project and auth-management scopes.</li>
            <li>Return here and click Check if this step does not advance on its own.</li>
          </ol>
          {controller.supabaseStatus?.message ? (
            <p className="index-create-step-note">{controller.supabaseStatus.message}</p>
          ) : null}
          <div className="form-actions">
            <button
              type="button"
              className="primary"
              onClick={controller.onConnectSupabase}
              disabled={controller.supabaseConnectBusy}
            >
              {controller.prerequisites.supabaseReady && controller.prerequisites.supabaseScopesReady
                ? "Reconnect Supabase"
                : "Connect Supabase"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={controller.onRefreshStatuses}
              disabled={controller.statusLoading || controller.supabaseConnectBusy}
            >
              {controller.statusLoading ? "Checking..." : "Check connection"}
            </button>
            <a
              href={SUPABASE_DASHBOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="site-card-action-link"
            >
              Open Supabase dashboard
            </a>
          </div>
        </>
      );
    case "organization":
      return (
        <>
          <p className="index-create-step-lead">
            Solidary will create the child project inside the organization you select here.
          </p>
          <ol className="index-create-step-instructions">
            <li>Pick the Supabase organization that should own the new project.</li>
            <li>Click Continue to lock this choice before moving on.</li>
          </ol>
          <div className="form-grid">
            <label>
              Supabase organization
              <select
                value={controller.selectedOrganizationId}
                onChange={(event) => controller.onSelectedOrganizationChange(event.target.value)}
                disabled={!controller.organizations.length}
              >
                <option value="">Select an organization</option>
                {controller.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                    {organization.slug ? ` (${organization.slug})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <a
              href={SUPABASE_DASHBOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="site-card-action-link"
            >
              Open organizations
            </a>
            <button
              type="button"
              className="primary"
              onClick={controller.onContinueOrganization}
              disabled={!controller.selectedOrganizationId}
            >
              Continue
            </button>
          </div>
        </>
      );
    case "details":
      return (
        <>
          <p className="index-create-step-lead">
            Solidary checks the repo name for conflicts before anything is created.
          </p>
          <div className="form-grid index-create-details-grid">
            <label>
              Index title
              <input
                value={controller.title}
                maxLength={MAX_SITE_TITLE_LENGTH}
                className={controller.repoConflict ? "site-create-input-error" : undefined}
                aria-invalid={controller.repoConflict ? "true" : undefined}
                onChange={(event) => controller.onTitleChange(event.target.value)}
                onBlur={controller.onTitleBlur}
              />
            </label>

            <label>
              Description
              <textarea
                value={controller.description}
                maxLength={MAX_SITE_DESCRIPTION_LENGTH}
                rows={4}
                onChange={(event) => controller.onDescriptionChange(event.target.value)}
              />
            </label>

            <label>
              GitHub repo name
              <input value={controller.computedSlug} readOnly />
            </label>

            <label>
              Index image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => controller.onImageChange(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {controller.imagePreview ? (
            <img className="preview-image" src={controller.imagePreview} alt="Index image preview" />
          ) : null}
          {controller.repoConflict ? (
            <p className="site-create-field-error">
              Pick a different title. You already have a GitHub repository named{" "}
              <a href={controller.repoConflict.repoUrl} target="_blank" rel="noreferrer">
                {controller.repoConflict.repoName}
              </a>
              .{" "}
              <a href={controller.repoConflict.repositoriesUrl} target="_blank" rel="noreferrer">
                View your repositories
              </a>
              .
            </p>
          ) : null}
          {!controller.repoConflict && controller.repoCheckInFlight ? (
            <p className="index-create-step-note">Checking GitHub repository availability...</p>
          ) : null}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={controller.onBackToStudio}>
              Back to Studio
            </button>
            <button
              type="button"
              className="primary"
              onClick={controller.onContinueDetails}
              disabled={!controller.detailsCanContinue}
            >
              Continue
            </button>
          </div>
        </>
      );
    case "provision":
      return (
        <>
          <p className="index-create-step-lead">
            Solidary now creates the child GitHub repo, Supabase project, and the initial index
            records for you.
          </p>
          <ol className="index-create-step-instructions">
            <li>Click Create index once.</li>
            <li>Keep this page open while the setup finishes.</li>
          </ol>
          <div className="index-create-provision-card">
            <div className="spinner" aria-hidden="true" />
            <div>
              <strong>{controller.isProvisioning ? "Creating your index" : "Ready to create"}</strong>
              <p>{controller.provisionStep}</p>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="primary"
              onClick={controller.onCreateIndex}
              disabled={controller.isProvisioning}
            >
              {controller.isProvisioning ? "Creating..." : "Create index"}
            </button>
          </div>
        </>
      );
    case "github_oauth":
      return (
        <>
          <p className="index-create-step-lead">
            You create the GitHub OAuth app once. Solidary then writes the child project auth
            settings for you and verifies them.
          </p>
          <ol className="index-create-step-instructions">
            <li>Open GitHub&apos;s OAuth app page.</li>
            <li>Use the copied name, homepage URL, and callback URL exactly as shown.</li>
            <li>Paste the new client id and client secret here, then click Check and continue.</li>
          </ol>
          <div className="index-create-copy-grid">
            <IndexCreateCopyField
              label="Suggested app name"
              value={authSetup?.githubOauthAppName || ""}
              copyLabel="Copy name"
              onCopy={controller.onCopyValue}
            />
            <IndexCreateCopyField
              label="Homepage URL"
              value={authSetup?.siteUrl || ""}
              copyLabel="Copy URL"
              onCopy={controller.onCopyValue}
            />
            <IndexCreateCopyField
              label="Authorization callback URL"
              value={authSetup?.callbackUrl || ""}
              copyLabel="Copy callback"
              onCopy={controller.onCopyValue}
            />
          </div>
          <div className="form-grid index-create-details-grid">
            <label>
              GitHub client id
              <input
                value={controller.githubClientId}
                onChange={(event) => controller.onGithubClientIdChange(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              GitHub client secret
              <input
                type="password"
                value={controller.githubClientSecret}
                onChange={(event) => controller.onGithubClientSecretChange(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          {authSetup?.message ? <p className="index-create-step-note">{authSetup.message}</p> : null}
          <div className="form-actions">
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
            <button
              type="button"
              className="primary"
              onClick={controller.onConfigureStandaloneAuth}
              disabled={
                controller.configuringStandaloneAuth ||
                !controller.githubClientId.trim() ||
                !controller.githubClientSecret.trim()
              }
            >
              {controller.configuringStandaloneAuth ? "Configuring..." : "Check and continue"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={controller.onRefreshSetup}
              disabled={controller.setupLoading || controller.configuringStandaloneAuth}
            >
              {controller.setupLoading ? "Checking..." : "Check setup"}
            </button>
          </div>
        </>
      );
    case "supabase_pat":
      return (
        <>
          <p className="index-create-step-lead">
            This token is required for the rest of the setup. Solidary uses it now for Auth setup
            and later stores it as the child repo&apos;s deployment secret for GitHub Actions.
          </p>
          <ol className="index-create-step-instructions">
            <li>Open the Supabase token page.</li>
            <li>Create a Personal Access Token for your account.</li>
            <li>Paste it here, then click Continue.</li>
          </ol>
          <div className="form-grid">
            <label>
              Supabase personal access token
              <input
                type="password"
                value={controller.supabasePersonalAccessToken}
                onChange={(event) => controller.onSupabasePersonalAccessTokenChange(event.target.value)}
                autoComplete="new-password"
              />
              <span className="index-create-field-hint">
                Recommended: use a long-lived token. This repo uses it again for future function
                deployments.
              </span>
            </label>
          </div>
          <div className="form-actions">
            <a
              href={SUPABASE_ACCOUNT_TOKENS_URL}
              target="_blank"
              rel="noreferrer"
              className="site-card-action-link"
            >
              Open token page
            </a>
            <button
              type="button"
              className="primary"
              onClick={controller.onContinueSupabasePersonalAccessToken}
              disabled={
                controller.savingFunctionAccess || !controller.supabasePersonalAccessToken.trim()
              }
            >
              {controller.savingFunctionAccess ? "Saving..." : "Continue"}
            </button>
          </div>
        </>
      );
    case "finalization":
      return (
        <>
          <p className="index-create-step-lead">
            Solidary copies the standalone app from the parent index into the child repo and wires
            up the managed runtime.
          </p>
          <ol className="index-create-step-instructions">
            <li>Click Finish child setup to start the copy.</li>
            <li>Wait here while Solidary updates the repo.</li>
          </ol>
          <div className="index-create-status-grid">
            <div>
              <strong>Status</strong>
              <span>{finalization?.status || "idle"}</span>
            </div>
            <div>
              <strong>Phase</strong>
              <span>
                {finalization?.phase ? FINALIZATION_PHASE_LABELS[finalization.phase] : "Waiting to start."}
              </span>
            </div>
            <div>
              <strong>Current step</strong>
              <span>{finalization?.step || "Waiting to start."}</span>
            </div>
            <div>
              <strong>Progress</strong>
              <span>{finalizationProgressLabel}</span>
            </div>
            <div>
              <strong>Source repo</strong>
              <span>{finalization?.sourceRepoFullName || "Unavailable"}</span>
            </div>
            <div>
              <strong>Source note</strong>
              <span>{finalization?.sourceRepoMessage || "Parent index source is ready."}</span>
            </div>
          </div>
          {finalization?.error ? (
            <p className="site-create-field-error">{finalization.error}</p>
          ) : null}
          <div className="form-actions">
            {controller.setup?.repoUrl ? (
              <a
                href={controller.setup.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open child repo
              </a>
            ) : null}
            <button
              type="button"
              className="primary"
              onClick={controller.onFinalizeIndex}
              disabled={controller.startingFinalization || finalization?.isRunning || !finalization?.available}
            >
              {controller.startingFinalization || finalization?.isRunning
                ? "Finishing..."
                : finalization?.canRetry
                  ? "Retry child setup"
                  : "Finish child setup"}
            </button>
            {!finalization?.isRunning ? (
              <button
                type="button"
                className="ghost"
                onClick={controller.onRefreshSetup}
                disabled={controller.setupLoading || controller.startingFinalization}
              >
                {controller.setupLoading ? "Checking..." : "Check status"}
              </button>
            ) : null}
          </div>
        </>
      );
    case "functions":
      return (
        <>
          <p className="index-create-step-lead">
            Solidary uses the deployment token you already provided to run the child function
            deployment workflow automatically after finalization.
          </p>
          <ol className="index-create-step-instructions">
            <li>Wait here while Solidary checks the child workflow.</li>
            <li>If deployment fails, use Retry deployment once and then Check deployment.</li>
          </ol>
          <div className="index-create-status-grid">
            <div>
              <strong>Deployment status</strong>
              <span>{functionsDeployment?.status || "not_ready"}</span>
            </div>
            <div>
              <strong>What Solidary needs</strong>
              <span>
                {functionsDeployment?.requiredSecrets
                  .filter((secret) => !secret.isConfigured)
                  .map((secret) => secret.name)
                  .join(", ") || "No missing secrets."}
              </span>
            </div>
          </div>
          {functionsDeployment?.message ? (
            <p className="index-create-step-note">{functionsDeployment.message}</p>
          ) : null}
          <div className="form-actions">
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
            {functionsDeployment?.status === "ready_to_run" ||
            functionsDeployment?.status === "failed" ? (
              <button
                type="button"
                className="primary"
                onClick={controller.onDeployFunctions}
                disabled={controller.deployingFunctions}
              >
                {controller.deployingFunctions
                  ? "Deploying..."
                  : functionsDeployment?.status === "failed"
                    ? "Retry deployment"
                    : "Deploy child functions"}
              </button>
            ) : null}
            <button
              type="button"
              className="ghost"
              onClick={controller.onRefreshSetup}
              disabled={controller.setupLoading || controller.deployingFunctions}
            >
              {controller.setupLoading ? "Checking..." : "Check deployment"}
            </button>
          </div>
        </>
      );
    case "launch":
      return (
        <>
          <p className="index-create-step-lead">
            The standalone index is ready. Open the child app directly from now on.
          </p>
          <div className="index-create-launch-grid">
            {controller.setup?.liveUrl ? (
              <a href={controller.setup.liveUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
                Open standalone index
              </a>
            ) : null}
            {finalization?.targetSearchUrl ? (
              <a
                href={finalization.targetSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open Search
              </a>
            ) : null}
            {finalization?.targetExplorerUrl ? (
              <a
                href={finalization.targetExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open Explorer
              </a>
            ) : null}
            {finalization?.targetStudioUrl ? (
              <a
                href={finalization.targetStudioUrl}
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open Studio
              </a>
            ) : null}
            {controller.setup?.standaloneAdminUrl ? (
              <a
                href={controller.setup.standaloneAdminUrl}
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open standalone /admin
              </a>
            ) : null}
          </div>
          <div className="form-actions">
            <button type="button" className="ghost" onClick={controller.onOpenAdvancedAdmin}>
              Open advanced fallback
            </button>
          </div>
        </>
      );
    default:
      return null;
  }
};

export default function IndexCreateRoute() {
  const controller = useIndexCreateRouteController();
  const currentStepIndex = Math.max(
    0,
    controller.steps.findIndex((step) => step.key === controller.activeStepKey)
  );

  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell index-create-route">
      <main className="main-content">
        <section className="index-create-hero">
          <div className="index-create-hero-copy">
            <p className="index-create-masthead-label">Index Setup Wizard</p>
            <h1>Create a standalone index, one step at a time.</h1>
            <p>
              Solidary handles everything it can automatically. You only see the next action that
              still needs your input.
            </p>
          </div>
          <div className="index-create-hero-actions">
            <span className="index-create-progress-pill">
              Step {currentStepIndex + 1} of {controller.steps.length}
            </span>
            <button type="button" className="ghost" onClick={controller.onBackToStudio}>
              Back to Studio
            </button>
            {controller.archiveId ? (
              <button type="button" className="ghost" onClick={controller.onOpenAdvancedAdmin}>
                Open advanced /admin
              </button>
            ) : null}
          </div>
        </section>

        {controller.archiveId && controller.setup ? (
          <section className="index-create-overview">
            <a href={controller.setup.liveUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
              Open live index
            </a>
            {controller.setup.repoUrl ? (
              <a href={controller.setup.repoUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
                Open GitHub repo
              </a>
            ) : null}
            {controller.setup.supabaseDashboardUrl ? (
              <a
                href={controller.setup.supabaseDashboardUrl}
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open Supabase project
              </a>
            ) : null}
          </section>
        ) : null}

        <div className="index-create-steps">
          {controller.steps.map((step, index) => (
            <IndexCreateWizardStep
              key={step.key}
              index={index + 1}
              title={step.title}
              status={step.status}
              summary={getStepSummary({
                controller,
                stepKey: step.key,
                status: step.status
              })}
            >
              {renderStepContent({
                controller,
                stepKey: step.key
              })}
            </IndexCreateWizardStep>
          ))}
        </div>
      </main>
    </div>
  );
}
