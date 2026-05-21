import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { buildIndexCreateWizardSteps } from "../services/wizard-progress";
import {
  buildPrerequisites,
  getFunctionsDeploymentDisplay
} from "./indexCreateShared";
import { useIndexCreateConnections } from "./useIndexCreateConnections";
import { useIndexCreateProvisioning } from "./useIndexCreateProvisioning";
import { useIndexCreateSetup } from "./useIndexCreateSetup";
import type { NoticeKind } from "../../../types/notice";

export const useIndexCreateRouteController = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const indexId = searchParams.get("indexId")?.trim() ?? "";

  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [manualSelectedOrganizationId, setManualSelectedOrganizationId] = useState("");
  const [organizationConfirmed, setOrganizationConfirmed] = useState(false);

  const setRouteNotice = useCallback((message: string | null, kind: NoticeKind) => {
    setNotice(message);
    setNoticeKind(kind);
  }, []);

  const connections = useIndexCreateConnections({
    location,
    navigate,
    setRouteNotice
  });

  const organizations = useMemo(
    () => connections.supabaseStatus?.organizations ?? [],
    [connections.supabaseStatus]
  );

  const setup = useIndexCreateSetup({
    indexId,
    setRouteNotice
  });

  const selectedOrganizationId =
    manualSelectedOrganizationId ||
    (!indexId && organizations.length === 1 ? organizations[0]?.id ?? "" : "");

  const prerequisites = useMemo(
    () =>
      buildPrerequisites({
        githubConnected: connections.githubConnected,
        supabaseStatus: connections.supabaseStatus,
        selectedOrganizationId
      }),
    [connections.githubConnected, connections.supabaseStatus, selectedOrganizationId]
  );

  const provisioning = useIndexCreateProvisioning({
    searchParams,
    setSearchParams,
    selectedOrganizationId,
    prerequisites,
    adminPassword: setup.adminPassword,
    refreshSetup: setup.refreshSetup,
    setRouteNotice
  });

  const selectedOrganization =
    organizations.find((entry) => entry.id === selectedOrganizationId) ?? null;

  const steps = useMemo(
    () =>
      buildIndexCreateWizardSteps({
        prerequisites,
        organizationConfirmed,
        detailsConfirmed: provisioning.detailsConfirmed,
        supabasePatConfirmed: setup.supabasePatConfirmed,
        indexId,
        setup: setup.setup,
        isProvisioning: provisioning.isProvisioning
      }),
    [
      indexId,
      prerequisites,
      provisioning.detailsConfirmed,
      provisioning.isProvisioning,
      organizationConfirmed,
      setup.setup,
      setup.supabasePatConfirmed
    ]
  );

  const activeStepKey = steps.find((step) => step.status === "current")?.key ?? "github_app";
  const functionsDeploymentDisplay = getFunctionsDeploymentDisplay({
    functionsDeploymentPending: setup.functionsDeploymentPending,
    setup: setup.setup
  });

  const handleCopyValue = useCallback(
    async (value: string, successMessage: string) => {
      if (!value.trim() || typeof navigator === "undefined" || !navigator.clipboard) {
        setRouteNotice("Clipboard access is not available in this browser.", "error");
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        setRouteNotice(successMessage, "notice");
      } catch {
        setRouteNotice("Could not copy that value to the clipboard.", "error");
      }
    },
    [setRouteNotice]
  );

  return {
    notice,
    noticeKind,
    indexId,
    activeStepKey,
    steps,
    statusLoading: connections.statusLoading,
    setupLoading: setup.setupLoading,
    githubConnectBusy: connections.githubConnectBusy,
    supabaseConnectBusy: connections.supabaseConnectBusy,
    configuringStandaloneAuth: setup.configuringStandaloneAuth,
    savingFunctionAccess: setup.savingFunctionAccess,
    startingFinalization: setup.startingFinalization,
    deployingFunctions: setup.deployingFunctions,
    githubConnected: connections.githubConnected,
    supabaseStatus: connections.supabaseStatus,
    title: provisioning.title,
    description: provisioning.description,
    imagePreview: provisioning.imagePreview,
    repoConflict: provisioning.repoConflict,
    repoCheckInFlight: provisioning.repoCheckInFlight,
    githubConnectionMessage: connections.githubConnectionMessage,
    prerequisites,
    organizations,
    selectedOrganization,
    selectedOrganizationId,
    organizationConfirmed,
    detailsConfirmed: provisioning.detailsConfirmed,
    supabasePatConfirmed: setup.supabasePatConfirmed,
    detailsCanContinue: provisioning.detailsCanContinue,
    computedSlug: provisioning.computedSlug,
    isProvisioning: provisioning.isProvisioning,
    provisionStep: provisioning.provisionStep,
    setup: setup.setup,
    functionsDeploymentDisplayMessage: functionsDeploymentDisplay.message,
    functionsDeploymentDisplayStatus: functionsDeploymentDisplay.status,
    githubClientId: setup.githubClientId,
    githubClientSecret: setup.githubClientSecret,
    supabasePersonalAccessToken: setup.supabasePersonalAccessToken,
    adminPassword: setup.adminPassword,
    onRefreshStatuses: () => {
      void connections.refreshStatuses();
    },
    onRefreshSetup: () => {
      void setup.refreshSetup(indexId, {
        supabasePersonalAccessToken:
          activeStepKey === "github_oauth" ? setup.supabasePersonalAccessToken : undefined
      });
    },
    onConnectGitHubApp: () => {
      void connections.handleConnectGitHubApp();
    },
    onConnectSupabase: () => {
      void connections.handleConnectSupabase();
    },
    onTitleChange: provisioning.onTitleChange,
    onTitleBlur: provisioning.onTitleBlur,
    onDescriptionChange: provisioning.onDescriptionChange,
    onAdminPasswordChange: (value: string) => {
      provisioning.setDetailsConfirmed(false);
      setup.setAdminPassword(value);
    },
    onImageChange: provisioning.onImageChange,
    onSelectedOrganizationChange: (value: string) => {
      setManualSelectedOrganizationId(value);
      setOrganizationConfirmed(false);
      provisioning.setDetailsConfirmed(false);
    },
    onContinueOrganization: () => {
      if (!provisioning.validateOrganizationSelection()) {
        return;
      }
      setOrganizationConfirmed(true);
    },
    onContinueSupabasePersonalAccessToken: () => {
      void setup.handleContinueSupabasePersonalAccessToken();
    },
    onContinueDetails: provisioning.onContinueDetails,
    onCreateIndex: provisioning.onCreateIndex,
    onGithubClientIdChange: setup.setGithubClientId,
    onGithubClientSecretChange: setup.setGithubClientSecret,
    onConfigureStandaloneAuth: () => {
      void setup.handleConfigureStandaloneAuth();
    },
    onSupabasePersonalAccessTokenChange: (value: string) => {
      setup.setSupabasePersonalAccessToken(value);
      setup.setSupabasePatConfirmed(false);
    },
    onDeployFunctions: () => {
      void setup.handleDeployFunctions();
    },
    onFinalizeIndex: () => {
      void setup.handleFinalizeIndex();
    },
    onCopyValue: (value: string, successMessage: string) => {
      void handleCopyValue(value, successMessage);
    },
    onBackToStudio: () => navigate("/studio"),
    onOpenAdvancedAdmin: () => {
      if (setup.setup?.standaloneAdminUrl) {
        window.open(setup.setup.standaloneAdminUrl, "_blank", "noopener,noreferrer");
        return;
      }
      const params = new URLSearchParams();
      params.set("indexId", indexId);
      if (setup.bridgeToken) {
        params.set("bridge", setup.bridgeToken);
      }
      navigate(`/admin?${params.toString()}`);
    }
  };
};
