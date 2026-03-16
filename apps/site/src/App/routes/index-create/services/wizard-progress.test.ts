import { describe, expect, it } from "vitest";
import type { IndexAdminSetup } from "../../admin/services/types";
import { buildIndexCreateWizardSteps } from "./wizard-progress";

const buildSetup = (overrides: Partial<IndexAdminSetup> = {}): IndexAdminSetup => ({
  authSetup: {
    siteUrl: "https://example.com",
    callbackUrl: "https://example.supabase.co/auth/v1/callback",
    providerSettingsUrl: "https://supabase.com/dashboard/project/example/auth/providers",
    githubOauthAppUrl: "https://github.com/settings/applications/new",
    githubOauthAppName: "Solidary Example",
    githubProviderEnabled: false,
    githubClientIdConfigured: false,
    githubClientIdMatches: false,
    siteUrlMatches: false,
    uriAllowListMatches: false,
    localAuthReady: false,
    message: null
  },
  finalization: {
    available: false,
    isFinalized: false,
    isRunning: false,
    status: "idle",
    step: null,
    error: null,
    startedAt: null,
    completedAt: null,
    sourceRepoFullName: null,
    sourceRepoUrl: null,
    sourceRepoStatus: "missing",
    sourceRepoMessage: null,
    targetStudioUrl: "",
    targetExplorerUrl: "",
    targetSearchUrl: "",
    functionsDeployStatus: "not_ready",
    functionsDeployMessage: null,
    functionsDeployWorkflowUrl: null,
    functionsDeployRunUrl: null,
    requiredRepoSecrets: []
  },
  functionsDeployment: {
    status: "not_ready",
    message: null,
    workflowUrl: null,
    runUrl: null,
    requiredSecrets: [],
    canDispatch: false
  },
  liveUrl: "https://example.com",
  repoUrl: "https://github.com/owner/example",
  supabaseDashboardUrl: "https://supabase.com/dashboard/project/example",
  standaloneAdminUrl: "https://example.com/admin",
  authCallbackUrl: "https://example.supabase.co/auth/v1/callback",
  authProvidersDashboardUrl: "https://supabase.com/dashboard/project/example/auth/providers",
  nextSteps: [],
  solidaryAdminUrl: "https://solidary.app/admin?archiveId=archive-1",
  ...overrides
});

const buildPrerequisites = () => ({
  githubReady: true,
  supabaseReady: true,
  supabaseScopesReady: true,
  ready: true,
  blockingMessage: null
});

describe("buildIndexCreateWizardSteps", () => {
  it("keeps exactly one current step before provisioning", () => {
    const steps = buildIndexCreateWizardSteps({
      prerequisites: buildPrerequisites(),
      organizationConfirmed: true,
      detailsConfirmed: false,
      archiveId: "",
      setup: null,
      isProvisioning: false
    });

    expect(steps.filter((step) => step.status === "current")).toHaveLength(1);
    expect(steps.find((step) => step.key === "details")?.status).toBe("current");
    expect(steps.find((step) => step.key === "organization")?.status).toBe("complete");
    expect(steps.find((step) => step.key === "provision")?.status).toBe("locked");
  });

  it("resumes after creation at the auth setup step", () => {
    const steps = buildIndexCreateWizardSteps({
      prerequisites: buildPrerequisites(),
      organizationConfirmed: false,
      detailsConfirmed: false,
      archiveId: "archive-1",
      setup: buildSetup(),
      isProvisioning: false
    });

    expect(steps.find((step) => step.key === "provision")?.status).toBe("complete");
    expect(steps.find((step) => step.key === "github_oauth")?.status).toBe("current");
  });

  it("unlocks launch after auth, finalization, and deployment are complete", () => {
    const steps = buildIndexCreateWizardSteps({
      prerequisites: buildPrerequisites(),
      organizationConfirmed: false,
      detailsConfirmed: false,
      archiveId: "archive-1",
      setup: buildSetup({
        authSetup: {
          ...buildSetup().authSetup,
          localAuthReady: true
        },
        finalization: {
          ...buildSetup().finalization,
          isFinalized: true,
          status: "finalized"
        },
        functionsDeployment: {
          ...buildSetup().functionsDeployment,
          status: "deployed"
        }
      }),
      isProvisioning: false
    });

    expect(steps.find((step) => step.key === "functions")?.status).toBe("complete");
    expect(steps.find((step) => step.key === "launch")?.status).toBe("current");
  });
});
