import { describe, expect, it } from "vitest";
import type { IndexAdminSetup } from "../../admin/services/types";
import {
  buildPrerequisites,
  extractBridgeTokenFromStandaloneAdminUrl,
  getFunctionsDeploymentDisplay,
  shouldAwaitFunctionsDeploymentRun
} from "./indexCreateShared";

const buildSetup = (
  overrides: Partial<IndexAdminSetup["functionsDeployment"]> = {}
): IndexAdminSetup => ({
  authSetup: {
    siteUrl: "",
    callbackUrl: "",
    providerSettingsUrl: "",
    githubOauthAppUrl: "",
    githubOauthAppName: "",
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
    phase: null,
    progressCurrent: null,
    progressTotal: null,
    canRetry: false,
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
    latestRun: null,
    requiredSecrets: [],
    canDispatch: false,
    ...overrides
  },
  liveUrl: "",
  repoUrl: null,
  supabaseDashboardUrl: null,
  standaloneAdminUrl: "",
  authCallbackUrl: "",
  authProvidersDashboardUrl: "",
  nextSteps: [],
  solidaryAdminUrl: ""
});

describe("indexCreateShared", () => {
  it("blocks prerequisites when Supabase scopes are missing", () => {
    const prerequisites = buildPrerequisites({
      githubConnected: true,
      supabaseStatus: {
        connected: true,
        state: "connected",
        grantedScopes: ["projects:read"],
        organizations: [],
        projects: [],
        projectsTruncated: false,
        message: null
      },
      selectedOrganizationId: "org-1"
    });

    expect(prerequisites.supabaseReady).toBe(true);
    expect(prerequisites.supabaseScopesReady).toBe(false);
    expect(prerequisites.ready).toBe(false);
    expect(prerequisites.blockingMessage).toMatch(/Reconnect your Supabase account/);
  });

  it("extracts the bridge token from the standalone admin url", () => {
    expect(
      extractBridgeTokenFromStandaloneAdminUrl("https://example.com/admin?bridge=abc123")
    ).toBe("abc123");
    expect(extractBridgeTokenFromStandaloneAdminUrl("not a url")).toBe("");
  });

  it("keeps the deploy status in running while the workflow run is still being discovered", () => {
    const display = getFunctionsDeploymentDisplay({
      functionsDeploymentPending: true,
      setup: buildSetup({
        status: "ready_to_run",
        message: "Queued"
      })
    });

    expect(display.status).toBe("running");
    expect(display.message).toMatch(/Waiting for GitHub Actions/);
    expect(shouldAwaitFunctionsDeploymentRun("ready_to_run")).toBe(true);
    expect(shouldAwaitFunctionsDeploymentRun("deployed")).toBe(false);
  });
});
