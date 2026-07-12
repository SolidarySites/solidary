import {
  MAX_SITE_DESCRIPTION_LENGTH,
  MAX_SITE_TITLE_LENGTH
} from "../../services/site-metadata";
import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import IndexCreateInlineCopyValue from "./components/IndexCreateInlineCopyValue";
import IndexCreateProgressBar from "./components/IndexCreateProgressBar";
import IndexCreateWizardStep from "./components/IndexCreateWizardStep";
import { useIndexCreateRouteController } from "./hooks/useIndexCreateRouteController";
import {
  getIndexProvisionProgress,
  INDEX_PROVISION_PROGRESS_SEGMENT_COUNT
} from "./services/provision-progress";
import type { IndexCreateWizardStepKey, IndexCreateWizardStepStatus } from "./services/wizard-progress";
import "./IndexCreateRoute.css";

const SUPABASE_ACCOUNT_TOKENS_URL = "https://supabase.com/dashboard/account/tokens";
const SUPABASE_DASHBOARD_URL = "https://supabase.com/dashboard";

type Controller = ReturnType<typeof useIndexCreateRouteController>;

const getVisibleAuthSetupMessage = (value: string | null | undefined) => {
  const trimmedValue = value?.trim() ?? "";
  if (!trimmedValue) {
    return null;
  }

  return /^forbidden resource\.?$/i.test(trimmedValue) ? null : trimmedValue;
};

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
        : controller.indexId
          ? "Supabase organization selected during creation."
          : "Choose which Supabase organization will own the child project.";
    case "details":
      return controller.indexId
        ? "Index details saved."
        : controller.detailsConfirmed
        ? `Index details confirmed. Repo slug: ${controller.computedSlug}.`
        : "Name the index and confirm the GitHub repo name is available.";
    case "provision":
      return controller.indexId
        ? "Child repo and Supabase project created."
        : "Solidary will create the repo, project, and base configuration.";
    case "supabase_pat":
      return controller.supabasePatConfirmed || controller.setup?.authSetup.localAuthReady
        ? "Supabase Personal Access Token added for the remaining setup steps."
        : "Create a Supabase Personal Access Token before continuing.";
    case "github_oauth":
      return controller.setup?.authSetup.localAuthReady
        ? "GitHub sign-in is configured for the child project."
        : getVisibleAuthSetupMessage(controller.setup?.authSetup.message) ||
            "Create the GitHub OAuth app and paste its credentials here.";
    case "finalization":
      return controller.setup?.finalization.isFinalized
        ? "Standalone app copied into the child repo."
        : controller.setup?.finalization.progressTotal
          ? `${controller.setup.finalization.progressCurrent ?? 0}/${controller.setup.finalization.progressTotal} files processed.`
        : controller.setup?.finalization.step || "Copy the standalone app into the child repo.";
    case "functions":
      return controller.functionsDeploymentDisplayStatus === "deployed"
        ? "Child deploy workflow completed."
        : controller.functionsDeploymentDisplayMessage || "Waiting for GitHub to finish the child deploy workflow.";
    case "launch":
      return "Your site is live.";
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
  const visibleAuthSetupMessage = getVisibleAuthSetupMessage(authSetup?.message);
  const functionsDeploymentStatus = controller.functionsDeploymentDisplayStatus;
  const functionsDeploymentMessage = controller.functionsDeploymentDisplayMessage;
  const provisionProgress = getIndexProvisionProgress(controller.provisionStep);
  const finalizationProgressCurrent = finalization?.progressCurrent ?? 0;
  const finalizationProgressTotal = finalization?.progressTotal ?? 0;
  const finalizationProgressPercent = finalization?.isFinalized
    ? 100
    : finalizationProgressTotal > 0
      ? (finalizationProgressCurrent / finalizationProgressTotal) * 100
      : 0;
  const finalizationProgressLabel = finalization?.isFinalized
    ? "Completed"
    : finalizationProgressTotal > 0
      ? `${finalizationProgressCurrent} / ${finalizationProgressTotal} files`
      : "Waiting to start";

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
            All fields are required.
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
              Admin password
              <input
                type="password"
                value={controller.adminPassword}
                onChange={(event) => controller.onAdminPasswordChange(event.target.value)}
                autoComplete="new-password"
              />
              <span className="index-create-field-hint">
                This unlocks the child index&apos;s self-hosted <code>/admin</code> after setup.
              </span>
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
          <div className="index-create-provision-card">
            <IndexCreateProgressBar
              label={controller.isProvisioning ? "Creating your index" : "Ready to create"}
              value={controller.isProvisioning ? provisionProgress.percent : 0}
              valueLabel={controller.isProvisioning ? `${Math.round(provisionProgress.percent)}%` : "0%"}
              segmentCount={INDEX_PROVISION_PROGRESS_SEGMENT_COUNT}
              detail={controller.provisionStep}
            />
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
            <li>
              Open GitHub&apos;s{" "}
              {authSetup?.githubOauthAppUrl ? (
                <a href={authSetup.githubOauthAppUrl} rel="noreferrer" target="_blank">
                  OAuth app page
                </a>
              ) : (
                "OAuth app page"
              )}
              .
            </li>
            <li>
              Use these exact values:
              <div className="index-create-inline-copy-list">
                <IndexCreateInlineCopyValue
                  label="Name"
                  value={authSetup?.githubOauthAppName || ""}
                  copyLabel="Copy"
                  onCopy={controller.onCopyValue}
                />
                <IndexCreateInlineCopyValue
                  label="Homepage"
                  value={authSetup?.siteUrl || ""}
                  copyLabel="Copy"
                  onCopy={controller.onCopyValue}
                />
                <IndexCreateInlineCopyValue
                  label="Callback"
                  value={authSetup?.callbackUrl || ""}
                  copyLabel="Copy"
                  onCopy={controller.onCopyValue}
                />
              </div>
            </li>
            <li>Paste the new client id and client secret here, then continue.</li>
          </ol>
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
          {visibleAuthSetupMessage ? (
            <p className="index-create-step-note">{visibleAuthSetupMessage}</p>
          ) : null}
          <div className="form-actions">
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
              {controller.configuringStandaloneAuth ? "Configuring..." : "Continue"}
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
            <li>Open the Supabase <a href={SUPABASE_ACCOUNT_TOKENS_URL} target="_blank" rel="noreferrer">token page</a>.</li>
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
          <div className="index-create-provision-card">
            <IndexCreateProgressBar
              label="Progress"
              value={finalizationProgressPercent}
              valueLabel={finalizationProgressLabel}
              segmentCount={finalizationProgressTotal || 1}
              detail={`Current step: ${finalization?.step || "Waiting to start."}`}
            />
          </div>
          {finalization?.error ? (
            <p className="site-create-field-error">{finalization.error}</p>
          ) : null}
          <div className="form-actions">
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
          </div>
        </>
      );
    case "functions":
      return (
        <>
          <p className="index-create-step-lead">
            After finalization, the child repo uses its own deploy workflow to build the site and
            deploy its Supabase functions.
          </p>
          <ol className="index-create-step-instructions">
            <li>Wait here while Solidary checks the child deploy workflow.</li>
            <li>Open the workflow if you want to inspect the live GitHub Actions logs directly.</li>
          </ol>
          <div className="index-create-status-grid">
            <div>
              <strong>Deployment status</strong>
              <span>{functionsDeploymentStatus}</span>
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
          {functionsDeploymentMessage ? (
            <p className="index-create-step-note">{functionsDeploymentMessage}</p>
          ) : null}
          {functionsDeployment?.latestRun ? (
            <div className="index-create-status-grid">
              <div>
                <strong>Run status</strong>
                <span>
                  {functionsDeployment.latestRun.status || "unknown"}
                  {functionsDeployment.latestRun.conclusion
                    ? ` / ${functionsDeployment.latestRun.conclusion}`
                    : ""}
                </span>
              </div>
              <div>
                <strong>Last update</strong>
                <span>{functionsDeployment.latestRun.updatedAt || "Unknown"}</span>
              </div>
              {functionsDeployment.latestRun.jobs.map((job) => (
                <div key={job.name}>
                  <strong>{job.name}</strong>
                  <span>
                    {job.status || "unknown"}
                    {job.conclusion ? ` / ${job.conclusion}` : ""}
                    {job.steps.length
                      ? ` - ${job.steps
                          .map((step) =>
                            `${step.name}: ${step.status || "unknown"}${
                              step.conclusion ? ` (${step.conclusion})` : ""
                            }`
                          )
                          .join(" | ")}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
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
          </div>
        </>
      );
    case "launch":
      return (
        <>
          <p className="index-create-step-lead">
            Your site is live.
          </p>
          <p className="index-create-step-note">
            Use the admin password you created earlier in this wizard to unlock the live{" "}
            <code>/admin</code> page.
          </p>
          <div className="index-create-launch-grid">
            {controller.setup?.liveUrl ? (
              <a href={controller.setup.liveUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
                Open live index
              </a>
            ) : null}
            {controller.setup?.standaloneAdminUrl ? (
              <a
                href={controller.setup.standaloneAdminUrl}
                target="_blank"
                rel="noreferrer"
                className="site-card-action-link"
              >
                Open child /admin
              </a>
            ) : null}
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
            <h1>Create your own publishing platform with a Supabase postgREST backend</h1>
            <p>
              Your platform will be free to run and fully customizable within Supabase free tier limits.
            </p>
          </div>
          <div className="index-create-hero-actions">
            <span className="index-create-progress-pill">
              Step {currentStepIndex + 1} of {controller.steps.length}
            </span>
            <button type="button" className="ghost" onClick={controller.onBackToStudio}>
              Back to Studio
            </button>
            {controller.indexId ? (
              <button type="button" className="ghost" onClick={controller.onOpenAdvancedAdmin}>
                {controller.setup?.standaloneAdminUrl ? "Open child /admin" : "Open index admin"}
              </button>
            ) : null}
          </div>
        </section>

        {controller.indexId && controller.setup ? (
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
