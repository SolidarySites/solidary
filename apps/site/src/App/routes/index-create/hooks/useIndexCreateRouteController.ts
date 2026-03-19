import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  connectGitHubAppForCurrentUser,
  getGitHubAuthStatusForCurrentUser,
  GITHUB_APP_CONNECT_RESULT_MESSAGE_TYPE,
  parseGitHubAppConnectResultFromSearch,
  parseGitHubAppConnectResultMessagePayload,
  requireFreshSupabaseAuth
} from "../../../features/auth/services/github-auth";
import {
  connectSupabaseManagementForCurrentUser,
  getSupabaseManagementStatusForCurrentUser,
  parseSupabaseManagementConnectResultFromSearch,
  parseSupabaseManagementConnectResultMessagePayload,
  SUPABASE_MANAGEMENT_CONNECT_RESULT_MESSAGE_TYPE,
  type SupabaseManagementConnectionStatus
} from "../../../features/supabase-management/services/supabase-management";
import { toBase64 } from "../../../lib/base64";
import { slugify } from "../../../lib/slugify";
import { supabaseFunctionUrl } from "../../../lib/supabase";
import type { NoticeKind } from "../../../types/notice";
import {
  clampSiteDescription,
  clampSiteTitle
} from "../../../services/site-metadata";
import {
  configureIndexAdminStandaloneAuth,
  deployIndexAdminChildFunctions,
  finalizeIndexAdmin,
  readIndexAdmin
} from "../../admin/services/index-admin";
import type { IndexAdminSetup } from "../../admin/services/types";
import { buildIndexCreateWizardSteps } from "../services/wizard-progress";
import {
  hasRequiredSupabaseManagementScopes,
  startIndexProvisioning,
  waitForIndexProvisioningJob
} from "../services/index-create-provisioning";
import type {
  IndexCreateOrganizationOption,
  IndexCreatePrerequisites
} from "../services/types";

const GITHUB_CONNECT_POPUP_NAME = "solidary_github_app_connect";
const SUPABASE_CONNECT_POPUP_NAME = "solidary_supabase_management_connect";
const INITIAL_PROVISION_STEP = "Preparing your index...";

const shouldAwaitFunctionsDeploymentRun = (
  status: IndexAdminSetup["functionsDeployment"]["status"] | null | undefined
) => status == null || status === "ready_to_run" || status === "unknown";

type RepoConflict = {
  repoName: string;
  repoUrl: string;
  repositoriesUrl: string;
};

type RepoNameCheckPayload = {
  exists?: boolean;
  owner_login?: string;
  repo_name?: string;
  repo_url?: string;
  repositories_url?: string;
};

const openCenteredPopup = ({
  name,
  width = 920,
  height = 860
}: {
  name: string;
  width?: number;
  height?: number;
}) => {
  if (typeof window === "undefined") {
    return null;
  }

  const popupWidth = Math.min(width, Math.max(720, Math.floor(window.outerWidth * 0.84)));
  const popupHeight = Math.min(height, Math.max(720, Math.floor(window.outerHeight * 0.9)));
  const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - popupWidth) / 2));
  const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - popupHeight) / 2));
  const features = [
    "popup=yes",
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes"
  ].join(",");

  const popupWindow = window.open("about:blank", name, features);
  if (popupWindow) {
    return popupWindow;
  }

  return window.open("about:blank", "_blank");
};

const extractBridgeTokenFromStandaloneAdminUrl = (value: string | null | undefined) => {
  const rawValue = value?.trim() ?? "";
  if (!rawValue) {
    return "";
  }

  try {
    return new URL(rawValue).searchParams.get("bridge")?.trim() ?? "";
  } catch {
    return "";
  }
};

const buildPrerequisites = ({
  githubConnected,
  supabaseStatus,
  selectedOrganizationId
}: {
  githubConnected: boolean;
  supabaseStatus: SupabaseManagementConnectionStatus | null;
  selectedOrganizationId: string;
}): IndexCreatePrerequisites => {
  const supabaseReady = Boolean(supabaseStatus?.connected);
  const supabaseScopesReady = hasRequiredSupabaseManagementScopes(
    supabaseStatus?.grantedScopes ?? []
  );

  let blockingMessage: string | null = null;
  if (!githubConnected) {
    blockingMessage = "Connect the GitHub App to let Solidary create and manage your index repo.";
  } else if (!supabaseReady) {
    blockingMessage =
      "Connect your Supabase account so Solidary can create and configure the child project.";
  } else if (!supabaseScopesReady) {
    blockingMessage =
      "Reconnect your Supabase account with the scopes needed to create projects and configure auth.";
  } else if (!selectedOrganizationId) {
    blockingMessage = "Choose which Supabase organization should own the new child project.";
  }

  return {
    githubReady: githubConnected,
    supabaseReady,
    supabaseScopesReady,
    ready: !blockingMessage,
    blockingMessage
  };
};

export const useIndexCreateRouteController = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const archiveId = searchParams.get("archiveId")?.trim() ?? "";

  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);

  const [statusLoading, setStatusLoading] = useState(true);
  const [githubConnectBusy, setGitHubConnectBusy] = useState(false);
  const [supabaseConnectBusy, setSupabaseConnectBusy] = useState(false);
  const [githubConnected, setGitHubConnected] = useState(false);
  const [githubConnectionMessage, setGitHubConnectionMessage] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseManagementConnectionStatus | null>(
    null
  );

  const [title, setTitle] = useState("New Index");
  const [description, setDescription] = useState(
    "Describe what this archive will track and publish."
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [organizationConfirmed, setOrganizationConfirmed] = useState(false);
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [repoConflict, setRepoConflict] = useState<RepoConflict | null>(null);
  const [repoCheckInFlight, setRepoCheckInFlight] = useState(false);

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState(INITIAL_PROVISION_STEP);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setup, setSetup] = useState<IndexAdminSetup | null>(null);
  const [bridgeToken, setBridgeToken] = useState("");
  const [configuringStandaloneAuth, setConfiguringStandaloneAuth] = useState(false);
  const [savingFunctionAccess, setSavingFunctionAccess] = useState(false);
  const [startingFinalization, setStartingFinalization] = useState(false);
  const [deployingFunctions, setDeployingFunctions] = useState(false);
  const [functionsDeploymentPending, setFunctionsDeploymentPending] = useState(false);

  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [supabasePersonalAccessToken, setSupabasePersonalAccessToken] = useState("");
  const [supabasePatConfirmed, setSupabasePatConfirmed] = useState(false);

  const repoCheckRequestIdRef = useRef(0);
  const autoDeployArchiveIdRef = useRef<string | null>(null);
  const autoDeployInFlightRef = useRef(false);
  const previousFunctionsStatusRef = useRef<string | null>(null);

  const organizations = useMemo<IndexCreateOrganizationOption[]>(
    () => supabaseStatus?.organizations ?? [],
    [supabaseStatus]
  );
  const selectedOrganization = organizations.find((entry) => entry.id === selectedOrganizationId) ?? null;
  const computedSlug = useMemo(() => slugify(title), [title]);
  const prerequisites = useMemo(
    () =>
      buildPrerequisites({
        githubConnected,
        supabaseStatus,
        selectedOrganizationId
      }),
    [githubConnected, selectedOrganizationId, supabaseStatus]
  );
  const detailsCanContinue =
    Boolean(title.trim()) &&
    Boolean(description.trim()) &&
    Boolean(adminPassword.trim()) &&
    Boolean(computedSlug) &&
    !repoCheckInFlight &&
    !repoConflict;

  const steps = useMemo(
    () =>
      buildIndexCreateWizardSteps({
        prerequisites,
        organizationConfirmed,
        detailsConfirmed,
        supabasePatConfirmed,
        archiveId,
        setup,
        isProvisioning
      }),
    [
      archiveId,
      detailsConfirmed,
      isProvisioning,
      organizationConfirmed,
      prerequisites,
      setup,
      supabasePatConfirmed
    ]
  );

  const activeStepKey = steps.find((step) => step.status === "current")?.key ?? "github_app";
  const functionsDeploymentDisplayStatus =
    functionsDeploymentPending &&
      shouldAwaitFunctionsDeploymentRun(setup?.functionsDeployment.status)
      ? "running"
      : setup?.functionsDeployment.status ?? "not_ready";
  const functionsDeploymentDisplayMessage =
    functionsDeploymentPending &&
      shouldAwaitFunctionsDeploymentRun(setup?.functionsDeployment.status)
      ? "Deployment requested. Waiting for GitHub Actions to report the child workflow run."
      : setup?.functionsDeployment.message ?? null;

  useEffect(() => {
    if (!image) {
      setImagePreview(null);
      return;
    }

    const nextUrl = URL.createObjectURL(image);
    setImagePreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image]);

  const syncBridgeTokenFromSetup = useCallback((nextSetup: IndexAdminSetup | null) => {
    const nextBridgeToken = extractBridgeTokenFromStandaloneAdminUrl(nextSetup?.standaloneAdminUrl);
    if (!nextBridgeToken) {
      return;
    }
    setBridgeToken((currentBridgeToken) => currentBridgeToken || nextBridgeToken);
  }, []);

  const refreshStatuses = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [githubStatus, nextSupabaseStatus] = await Promise.all([
        getGitHubAuthStatusForCurrentUser(),
        getSupabaseManagementStatusForCurrentUser()
      ]);
      setGitHubConnected(Boolean(githubStatus.githubAppConnected));
      setGitHubConnectionMessage(githubStatus.githubAppConnectionMessage);
      setSupabaseStatus(nextSupabaseStatus);
    } catch (error) {
      setGitHubConnected(false);
      setGitHubConnectionMessage(null);
      setSupabaseStatus(null);
      setNotice(error instanceof Error ? error.message : "Could not load account connections.");
      setNoticeKind("error");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const refreshSetup = useCallback(
    async (
      requestedArchiveId = archiveId,
      {
        supabasePersonalAccessToken: nextSupabasePersonalAccessToken
      }: {
        supabasePersonalAccessToken?: string;
      } = {}
    ) => {
      const normalizedArchiveId = requestedArchiveId.trim();
      if (!normalizedArchiveId) {
        setSetup(null);
        return null;
      }

      setSetupLoading(true);
      try {
        const response = await readIndexAdmin(normalizedArchiveId, {
          bridgeToken: bridgeToken || undefined,
          supabasePersonalAccessToken: nextSupabasePersonalAccessToken?.trim() || undefined
        });
        setSetup(response.setup);
        syncBridgeTokenFromSetup(response.setup);
        return response;
      } catch (error) {
        setSetup(null);
        setNotice(error instanceof Error ? error.message : "Could not load the child setup state.");
        setNoticeKind("error");
        return null;
      } finally {
        setSetupLoading(false);
      }
    },
    [archiveId, bridgeToken, syncBridgeTokenFromSetup]
  );

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  useEffect(() => {
    if (!archiveId) {
      setSetup(null);
      setBridgeToken("");
      setFunctionsDeploymentPending(false);
      previousFunctionsStatusRef.current = null;
      return;
    }

    void refreshSetup(archiveId);
  }, [archiveId, refreshSetup]);

  useEffect(() => {
    const nextStatus = setup?.functionsDeployment.status ?? null;
    const previousStatus = previousFunctionsStatusRef.current;

    if (!archiveId) {
      previousFunctionsStatusRef.current = null;
      return;
    }

    if (nextStatus && previousStatus && nextStatus !== previousStatus) {
      if (
        (previousStatus === "running" || functionsDeploymentPending) &&
        nextStatus === "deployed"
      ) {
        setNotice("Child functions deployed. The standalone index is ready.");
        setNoticeKind("notice");
      } else if (
        (previousStatus === "running" || functionsDeploymentPending) &&
        nextStatus === "failed"
      ) {
        setNotice("Child function deployment failed. Review the latest workflow output below.");
        setNoticeKind("error");
      }
    }

    previousFunctionsStatusRef.current = nextStatus;
  }, [archiveId, functionsDeploymentPending, setup?.functionsDeployment.status]);

  useEffect(() => {
    if (!archiveId) {
      setFunctionsDeploymentPending(false);
      setDeployingFunctions(false);
      return;
    }

    if (
      functionsDeploymentPending &&
      !shouldAwaitFunctionsDeploymentRun(setup?.functionsDeployment.status)
    ) {
      setFunctionsDeploymentPending(false);
    }
    if (
      deployingFunctions &&
      !shouldAwaitFunctionsDeploymentRun(setup?.functionsDeployment.status)
    ) {
      setDeployingFunctions(false);
    }
  }, [archiveId, deployingFunctions, functionsDeploymentPending, setup?.functionsDeployment.status]);

  useEffect(() => {
    if (archiveId || selectedOrganizationId || organizations.length !== 1) {
      return;
    }
    setSelectedOrganizationId(organizations[0]?.id ?? "");
  }, [archiveId, organizations, selectedOrganizationId]);

  useEffect(() => {
    if (!archiveId) {
      return;
    }
    if (
      !setup?.finalization.isRunning &&
      setup?.functionsDeployment.status !== "running" &&
      !functionsDeploymentPending
    ) {
      return;
    }

    let cancelled = false;
    let refreshInFlight = false;
    const intervalId = window.setInterval(() => {
      if (cancelled || refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      void refreshSetup(archiveId).finally(() => {
        refreshInFlight = false;
      });
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    archiveId,
    functionsDeploymentPending,
    refreshSetup,
    setup?.finalization.isRunning,
    setup?.functionsDeployment.status
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const githubPayload = parseGitHubAppConnectResultMessagePayload(event.data);
      if (githubPayload) {
        if (githubPayload.status === "connected") {
          void refreshStatuses();
          setNotice("GitHub App connected.");
          setNoticeKind("notice");
        } else {
          setNotice(githubPayload.message || "Could not connect the GitHub App.");
          setNoticeKind("error");
        }
        return;
      }

      const supabasePayload = parseSupabaseManagementConnectResultMessagePayload(event.data);
      if (!supabasePayload) {
        return;
      }

      if (supabasePayload.status === "connected") {
        void refreshStatuses();
        setNotice("Supabase account connected.");
        setNoticeKind("notice");
      } else {
        setNotice(supabasePayload.message || "Could not connect your Supabase account.");
        setNoticeKind("error");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refreshStatuses]);

  useEffect(() => {
    const githubResult = parseGitHubAppConnectResultFromSearch(location.search);
    if (!githubResult) {
      return;
    }

    const params = new URLSearchParams(location.search);
    params.delete("github_app");
    params.delete("github_app_message");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, {
      replace: true
    });

    if (typeof window !== "undefined" && window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(
          {
            type: GITHUB_APP_CONNECT_RESULT_MESSAGE_TYPE,
            status: githubResult.status,
            message: githubResult.message || null
          },
          window.location.origin
        );
      } catch {
        // Ignore popup relay failures and fall back to local handling.
      }

      try {
        window.close();
        return;
      } catch {
        // Browser may block closing; continue with local handling.
      }
    }

    if (githubResult.status === "connected") {
      void refreshStatuses();
      setNotice("GitHub App connected.");
      setNoticeKind("notice");
      return;
    }

    setNotice(githubResult.message || "Could not connect the GitHub App.");
    setNoticeKind("error");
  }, [location.hash, location.pathname, location.search, navigate, refreshStatuses]);

  useEffect(() => {
    const supabaseResult = parseSupabaseManagementConnectResultFromSearch(location.search);
    if (!supabaseResult) {
      return;
    }

    const params = new URLSearchParams(location.search);
    params.delete("supabase_management");
    params.delete("supabase_management_message");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, {
      replace: true
    });

    if (typeof window !== "undefined" && window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(
          {
            type: SUPABASE_MANAGEMENT_CONNECT_RESULT_MESSAGE_TYPE,
            status: supabaseResult.status,
            message: supabaseResult.message || null
          },
          window.location.origin
        );
      } catch {
        // Ignore popup relay failures and fall back to local handling.
      }

      try {
        window.close();
        return;
      } catch {
        // Browser may block closing; continue with local handling.
      }
    }

    if (supabaseResult.status === "connected") {
      void refreshStatuses();
      setNotice("Supabase account connected.");
      setNoticeKind("notice");
      return;
    }

    setNotice(supabaseResult.message || "Could not connect your Supabase account.");
    setNoticeKind("error");
  }, [location.hash, location.pathname, location.search, navigate, refreshStatuses]);

  const checkRepoConflict = useCallback(
    async ({
      repoName,
      supabaseAccessToken
    }: {
      repoName: string;
      supabaseAccessToken: string;
    }) => {
      const response = await fetch(supabaseFunctionUrl("github-check-repo-name"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${supabaseAccessToken}`
        },
        body: JSON.stringify({ name: repoName })
      });
      const payload = (await response.json().catch(() => ({}))) as RepoNameCheckPayload;
      if (!response.ok || !payload.exists) {
        return null;
      }

      const ownerLogin = payload.owner_login?.trim() ?? "";
      const normalizedRepoName = payload.repo_name?.trim() || repoName;
      return {
        repoName: normalizedRepoName,
        repoUrl:
          payload.repo_url?.trim() ||
          (ownerLogin
            ? `https://github.com/${ownerLogin}/${normalizedRepoName}`
            : `https://github.com/${normalizedRepoName}`),
        repositoriesUrl:
          payload.repositories_url?.trim() ||
          (ownerLogin ? `https://github.com/${ownerLogin}?tab=repositories` : "https://github.com")
      } satisfies RepoConflict;
    },
    []
  );

  const runRepoAvailabilityCheck = useCallback(async () => {
    const repoName = slugify(title);
    if (!repoName) {
      setRepoConflict(null);
      return null;
    }

    let freshAuth: Awaited<ReturnType<typeof requireFreshSupabaseAuth>>;
    try {
      freshAuth = await requireFreshSupabaseAuth();
    } catch {
      return null;
    }

    const requestId = ++repoCheckRequestIdRef.current;
    setRepoCheckInFlight(true);
    try {
      const nextConflict = await checkRepoConflict({
        repoName,
        supabaseAccessToken: freshAuth.supabaseAccessToken
      });
      if (repoCheckRequestIdRef.current === requestId) {
        setRepoConflict(nextConflict);
      }
      return nextConflict;
    } catch {
      if (repoCheckRequestIdRef.current === requestId) {
        setRepoConflict(null);
      }
      return null;
    } finally {
      if (repoCheckRequestIdRef.current === requestId) {
        setRepoCheckInFlight(false);
      }
    }
  }, [checkRepoConflict, title]);

  const handleTitleBlur = useCallback(async () => {
    await runRepoAvailabilityCheck();
  }, [runRepoAvailabilityCheck]);

  const handleConnectGitHubApp = async () => {
    setGitHubConnectBusy(true);
    setNotice(null);
    setNoticeKind(null);

    const popupWindow = openCenteredPopup({ name: GITHUB_CONNECT_POPUP_NAME });
    const openMode = popupWindow ? "popup" : "same_tab";
    try {
      await connectGitHubAppForCurrentUser({
        returnTo: `${location.pathname}${location.search}${location.hash}`,
        force: true,
        openMode,
        navigationWindow: popupWindow
      });
    } catch (error) {
      if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
      }
      setNotice(error instanceof Error ? error.message : "Could not start the GitHub App connect flow.");
      setNoticeKind("error");
    } finally {
      setGitHubConnectBusy(false);
    }
  };

  const handleConnectSupabase = async () => {
    setSupabaseConnectBusy(true);
    setNotice(null);
    setNoticeKind(null);

    const popupWindow = openCenteredPopup({ name: SUPABASE_CONNECT_POPUP_NAME });
    const openMode = popupWindow ? "popup" : "same_tab";
    try {
      await connectSupabaseManagementForCurrentUser({
        returnTo: `${location.pathname}${location.search}${location.hash}`,
        force: true,
        openMode,
        navigationWindow: popupWindow
      });
    } catch (error) {
      if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
      }
      setNotice(error instanceof Error ? error.message : "Could not start the Supabase connect flow.");
      setNoticeKind("error");
    } finally {
      setSupabaseConnectBusy(false);
    }
  };

  const handleContinueDetails = async () => {
    setNotice(null);
    setNoticeKind(null);

    if (!title.trim() || !description.trim()) {
      setNotice("Add a title, description, and admin password before continuing.");
      setNoticeKind("error");
      return;
    }
    if (!computedSlug) {
      setNotice("Choose a title that can become a GitHub repository name.");
      setNoticeKind("error");
      return;
    }
    if (!prerequisites.ready) {
      setNotice(prerequisites.blockingMessage || "Complete the required account connections first.");
      setNoticeKind("error");
      return;
    }

    const nextConflict = await runRepoAvailabilityCheck();
    if (nextConflict) {
      setNotice("Choose a different title before creating your index.");
      setNoticeKind("error");
      return;
    }

    setDetailsConfirmed(true);
  };

  const handleContinueOrganization = () => {
    setNotice(null);
    setNoticeKind(null);

    if (!selectedOrganizationId.trim()) {
      setNotice("Choose which Supabase organization should own this index.");
      setNoticeKind("error");
      return;
    }

    setOrganizationConfirmed(true);
  };

  const handleContinueSupabasePersonalAccessToken = async () => {
    setNotice(null);
    setNoticeKind(null);

    if (!supabasePersonalAccessToken.trim()) {
      setNotice("Create a Supabase Personal Access Token before continuing.");
      setNoticeKind("error");
      return;
    }

    if (!archiveId) {
      setNotice("Create the index before saving the deployment token.");
      setNoticeKind("error");
      return;
    }

    setSavingFunctionAccess(true);
    try {
      const response = await deployIndexAdminChildFunctions({
        archiveId,
        supabasePersonalAccessToken,
        adminPassword,
        dispatchWorkflow: false
      }, {
        bridgeToken: bridgeToken || undefined
      });
      setSetup(response.setup);
      syncBridgeTokenFromSetup(response.setup);
      setSupabasePatConfirmed(true);
      setNotice("Deployment token saved for the child repo.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not save the child repo deployment token."
      );
      setNoticeKind("error");
    } finally {
      setSavingFunctionAccess(false);
    }
  };

  const handleCreateIndex = async () => {
    setNotice(null);
    setNoticeKind(null);

    if (!detailsConfirmed) {
      setNotice("Finish the index details step before creating your index.");
      setNoticeKind("error");
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshSupabaseAuth();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    try {
      const nextConflict = await checkRepoConflict({
        repoName: computedSlug,
        supabaseAccessToken: freshAuth.supabaseAccessToken
      });
      if (nextConflict) {
        setRepoConflict(nextConflict);
        setNotice("Choose a different title. You already have a GitHub repository with that name.");
        setNoticeKind("error");
        return;
      }
      setRepoConflict(null);
    } catch {
      // Non-blocking preflight failure; the backend still enforces conflicts.
    }

    setIsProvisioning(true);
    setProvisionStep(INITIAL_PROVISION_STEP);

    try {
      const imageContentB64 = image ? toBase64(await image.arrayBuffer()) : undefined;
      const { jobId, initialStep } = await startIndexProvisioning({
        supabaseAccessToken: freshAuth.supabaseAccessToken,
        slug: computedSlug,
        title: title.trim(),
        description: description.trim(),
        organizationId: selectedOrganizationId,
        imageContentB64
      });
      setProvisionStep(initialStep);
      const completedJob = await waitForIndexProvisioningJob({
        jobId,
        supabaseAccessToken: freshAuth.supabaseAccessToken,
        onStep: setProvisionStep
      });

      const createdArchiveId = completedJob.archive?.id?.trim() ?? "";
      if (!createdArchiveId) {
        throw new Error("The new index was created, but the setup route is missing the archive id.");
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("archiveId", createdArchiveId);
      setSearchParams(nextParams, { replace: true });
      await refreshSetup(createdArchiveId);
      setNotice("Index created. Continue with the next setup step.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong while creating the index.");
      setNoticeKind("error");
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleConfigureStandaloneAuth = async () => {
    if (!archiveId) {
      return;
    }

    setNotice(null);
    setNoticeKind(null);
    setConfiguringStandaloneAuth(true);
    try {
      const response = await configureIndexAdminStandaloneAuth({
        archiveId,
        githubClientId,
        githubClientSecret,
        supabasePersonalAccessToken
      }, {
        bridgeToken: bridgeToken || undefined
      });
      setSetup(response.setup);
      syncBridgeTokenFromSetup(response.setup);
      setGithubClientSecret("");
      setNotice("GitHub sign-in configured for the child project.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not configure GitHub sign-in for the child project."
      );
      setNoticeKind("error");
    } finally {
      setConfiguringStandaloneAuth(false);
    }
  };

  const handleFinalizeIndex = async () => {
    if (!archiveId) {
      return;
    }

    setNotice(null);
    setNoticeKind(null);
    setStartingFinalization(true);
    try {
      const response = await finalizeIndexAdmin({ archiveId }, {
        bridgeToken: bridgeToken || undefined
      });
      setSetup(response.setup);
      syncBridgeTokenFromSetup(response.setup);
      setNotice("Child setup started. Solidary is copying the standalone app now.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not finalize the child setup.");
      setNoticeKind("error");
    } finally {
      setStartingFinalization(false);
    }
  };

  const handleDeployFunctions = async () => {
    if (!archiveId) {
      return;
    }

    setNotice(null);
    setNoticeKind(null);
    setDeployingFunctions(true);
    setFunctionsDeploymentPending(true);
    try {
      const response = await deployIndexAdminChildFunctions({
        archiveId,
        supabasePersonalAccessToken,
        adminPassword
      }, {
        bridgeToken: bridgeToken || undefined
      });
      setSetup(response.setup);
      syncBridgeTokenFromSetup(response.setup);
      setFunctionsDeploymentPending(
        shouldAwaitFunctionsDeploymentRun(response.setup.functionsDeployment.status)
      );
      setSupabasePersonalAccessToken("");
      setNotice("Child function deployment started. Solidary is checking GitHub Actions now.");
      setNoticeKind("notice");
    } catch (error) {
      setFunctionsDeploymentPending(false);
      setNotice(error instanceof Error ? error.message : "Could not deploy child functions.");
      setNoticeKind("error");
    } finally {
      setDeployingFunctions(false);
    }
  };

  useEffect(() => {
    if (!archiveId || !setup?.finalization.isFinalized) {
      autoDeployArchiveIdRef.current = null;
      autoDeployInFlightRef.current = false;
      return;
    }
    if (setup.functionsDeployment.status !== "ready_to_run" || deployingFunctions) {
      return;
    }
    if (autoDeployInFlightRef.current) {
      return;
    }
    if (autoDeployArchiveIdRef.current === archiveId) {
      return;
    }

    autoDeployArchiveIdRef.current = archiveId;
    autoDeployInFlightRef.current = true;

    void (async () => {
      setNotice("Child repo is finalized. Starting the function deployment.");
      setNoticeKind("notice");
      setDeployingFunctions(true);
      setFunctionsDeploymentPending(true);
      try {
        const response = await deployIndexAdminChildFunctions({
          archiveId,
          supabasePersonalAccessToken: "",
          adminPassword
        }, {
          bridgeToken: bridgeToken || undefined
        });
        setSetup(response.setup);
        syncBridgeTokenFromSetup(response.setup);
        setFunctionsDeploymentPending(
          shouldAwaitFunctionsDeploymentRun(response.setup.functionsDeployment.status)
        );
        setNotice("Child function deployment started. Solidary is checking GitHub Actions now.");
        setNoticeKind("notice");
      } catch (error) {
        autoDeployArchiveIdRef.current = null;
        setFunctionsDeploymentPending(false);
        setNotice(
          error instanceof Error ? error.message : "Could not deploy child functions."
        );
        setNoticeKind("error");
      } finally {
        autoDeployInFlightRef.current = false;
        setDeployingFunctions(false);
      }
    })();
  }, [
    archiveId,
    bridgeToken,
    deployingFunctions,
    setup?.finalization.isFinalized,
    setup?.functionsDeployment.status,
    syncBridgeTokenFromSetup
  ]);

  const handleCopyValue = async (value: string, successMessage: string) => {
    if (!value.trim() || typeof navigator === "undefined" || !navigator.clipboard) {
      setNotice("Clipboard access is not available in this browser.");
      setNoticeKind("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
      setNoticeKind("notice");
    } catch {
      setNotice("Could not copy that value to the clipboard.");
      setNoticeKind("error");
    }
  };

  return {
    notice,
    noticeKind,
    archiveId,
    activeStepKey,
    steps,
    statusLoading,
    setupLoading,
    githubConnectBusy,
    supabaseConnectBusy,
    configuringStandaloneAuth,
    savingFunctionAccess,
    startingFinalization,
    deployingFunctions,
    githubConnected,
    supabaseStatus,
    title,
    description,
    imagePreview,
    repoConflict,
    repoCheckInFlight,
    githubConnectionMessage,
    prerequisites,
    organizations,
    selectedOrganization,
    selectedOrganizationId,
    organizationConfirmed,
    detailsConfirmed,
    supabasePatConfirmed,
    detailsCanContinue,
    computedSlug,
    isProvisioning,
    provisionStep,
    setup,
    functionsDeploymentDisplayMessage,
    functionsDeploymentDisplayStatus,
    githubClientId,
    githubClientSecret,
    supabasePersonalAccessToken,
    adminPassword,
    onRefreshStatuses: () => {
      void refreshStatuses();
    },
    onRefreshSetup: () => {
      void refreshSetup(archiveId, {
        supabasePersonalAccessToken:
          activeStepKey === "github_oauth" ? supabasePersonalAccessToken : undefined
      });
    },
    onConnectGitHubApp: () => {
      void handleConnectGitHubApp();
    },
    onConnectSupabase: () => {
      void handleConnectSupabase();
    },
    onTitleChange: (value: string) => {
      repoCheckRequestIdRef.current += 1;
      setRepoCheckInFlight(false);
      setRepoConflict(null);
      setDetailsConfirmed(false);
      setTitle(clampSiteTitle(value));
    },
    onTitleBlur: () => {
      void handleTitleBlur();
    },
    onDescriptionChange: (value: string) => {
      setDetailsConfirmed(false);
      setDescription(clampSiteDescription(value));
    },
    onAdminPasswordChange: (value: string) => {
      setDetailsConfirmed(false);
      setAdminPassword(value);
    },
    onImageChange: (value: File | null) => {
      setDetailsConfirmed(false);
      setImage(value);
    },
    onSelectedOrganizationChange: (value: string) => {
      setSelectedOrganizationId(value);
      setOrganizationConfirmed(false);
      setDetailsConfirmed(false);
    },
    onContinueOrganization: handleContinueOrganization,
    onContinueSupabasePersonalAccessToken: handleContinueSupabasePersonalAccessToken,
    onContinueDetails: () => {
      void handleContinueDetails();
    },
    onCreateIndex: () => {
      void handleCreateIndex();
    },
    onGithubClientIdChange: setGithubClientId,
    onGithubClientSecretChange: setGithubClientSecret,
    onConfigureStandaloneAuth: () => {
      void handleConfigureStandaloneAuth();
    },
    onSupabasePersonalAccessTokenChange: (value: string) => {
      setSupabasePersonalAccessToken(value);
      setSupabasePatConfirmed(false);
    },
    onDeployFunctions: () => {
      void handleDeployFunctions();
    },
    onFinalizeIndex: () => {
      void handleFinalizeIndex();
    },
    onCopyValue: (value: string, successMessage: string) => {
      void handleCopyValue(value, successMessage);
    },
    onBackToStudio: () => navigate("/studio"),
    onOpenAdvancedAdmin: () => {
      const params = new URLSearchParams();
      params.set("archiveId", archiveId);
      if (bridgeToken) {
        params.set("bridge", bridgeToken);
      }
      navigate(`/admin?${params.toString()}`);
    }
  };
};
