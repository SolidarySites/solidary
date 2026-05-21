import { useCallback, useEffect, useRef, useState } from "react";
import type { NoticeKind } from "../../../types/notice";
import {
  configureIndexAdminStandaloneAuth,
  deployIndexAdminChildFunctions,
  finalizeIndexAdmin,
  readIndexAdmin
} from "../../admin/services/index-admin";
import type { IndexAdminSetup } from "../../admin/services/types";
import {
  extractBridgeTokenFromStandaloneAdminUrl,
  shouldAwaitFunctionsDeploymentRun
} from "./indexCreateShared";

type SetRouteNotice = (message: string | null, kind: NoticeKind) => void;

export const useIndexCreateSetup = ({
  indexId,
  setRouteNotice
}: {
  indexId: string;
  setRouteNotice: SetRouteNotice;
}) => {
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
  const previousFunctionsStatusRef = useRef<string | null>(null);

  const syncBridgeTokenFromSetup = useCallback((nextSetup: IndexAdminSetup | null) => {
    const nextBridgeToken = extractBridgeTokenFromStandaloneAdminUrl(nextSetup?.standaloneAdminUrl);
    if (!nextBridgeToken) {
      return;
    }
    setBridgeToken((currentBridgeToken) => currentBridgeToken || nextBridgeToken);
  }, []);

  const applySetupResponse = useCallback(
    (nextSetup: IndexAdminSetup | null) => {
      setSetup(nextSetup);
      syncBridgeTokenFromSetup(nextSetup);
    },
    [syncBridgeTokenFromSetup]
  );

  const refreshSetup = useCallback(
    async (
      requestedIndexId = indexId,
      {
        supabasePersonalAccessToken: nextSupabasePersonalAccessToken
      }: {
        supabasePersonalAccessToken?: string;
      } = {}
    ) => {
      const normalizedIndexId = requestedIndexId.trim();
      if (!normalizedIndexId) {
        setSetup(null);
        return null;
      }

      setSetupLoading(true);
      try {
        const response = await readIndexAdmin(normalizedIndexId, {
          bridgeToken: bridgeToken || undefined,
          supabasePersonalAccessToken: nextSupabasePersonalAccessToken?.trim() || undefined
        });
        applySetupResponse(response.setup);
        return response;
      } catch (error) {
        setSetup(null);
        setRouteNotice(
          error instanceof Error ? error.message : "Could not load the child setup state.",
          "error"
        );
        return null;
      } finally {
        setSetupLoading(false);
      }
    },
    [applySetupResponse, bridgeToken, indexId, setRouteNotice]
  );

  useEffect(() => {
    if (!indexId) {
      setSetup(null);
      setBridgeToken("");
      setFunctionsDeploymentPending(false);
      previousFunctionsStatusRef.current = null;
      return;
    }

    void refreshSetup(indexId);
  }, [indexId, refreshSetup]);

  useEffect(() => {
    const nextStatus = setup?.functionsDeployment.status ?? null;
    const previousStatus = previousFunctionsStatusRef.current;

    if (!indexId) {
      previousFunctionsStatusRef.current = null;
      return;
    }

    if (nextStatus && previousStatus && nextStatus !== previousStatus) {
      if (
        (previousStatus === "running" || functionsDeploymentPending) &&
        nextStatus === "deployed"
      ) {
        setRouteNotice("Child deploy workflow completed. The standalone index is ready.", "notice");
      } else if (
        (previousStatus === "running" || functionsDeploymentPending) &&
        nextStatus === "failed"
      ) {
        setRouteNotice(
          "Child deploy workflow failed. Review the latest workflow output below.",
          "error"
        );
      }
    }

    previousFunctionsStatusRef.current = nextStatus;
  }, [functionsDeploymentPending, indexId, setRouteNotice, setup?.functionsDeployment.status]);

  useEffect(() => {
    if (!indexId) {
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
  }, [deployingFunctions, functionsDeploymentPending, indexId, setup?.functionsDeployment.status]);

  useEffect(() => {
    if (
      !indexId ||
      (!setup?.finalization.isRunning &&
        setup?.functionsDeployment.status !== "running" &&
        !functionsDeploymentPending)
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
      void refreshSetup(indexId).finally(() => {
        refreshInFlight = false;
      });
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    functionsDeploymentPending,
    indexId,
    refreshSetup,
    setup?.finalization.isRunning,
    setup?.functionsDeployment.status
  ]);

  useEffect(() => {
    if (!indexId || !setup?.finalization.isFinalized) {
      return;
    }
    if (deployingFunctions || functionsDeploymentPending) {
      return;
    }
    if (setup.functionsDeployment.latestRun) {
      return;
    }
    if (!shouldAwaitFunctionsDeploymentRun(setup.functionsDeployment.status)) {
      return;
    }

    setFunctionsDeploymentPending(true);
    setRouteNotice(
      "Child repo is finalized. Waiting for GitHub Actions to start the child deploy workflow.",
      "notice"
    );
  }, [
    deployingFunctions,
    functionsDeploymentPending,
    indexId,
    setRouteNotice,
    setup?.finalization.isFinalized,
    setup?.functionsDeployment.latestRun,
    setup?.functionsDeployment.status
  ]);

  const handleContinueSupabasePersonalAccessToken = useCallback(async () => {
    setRouteNotice(null, null);

    if (!supabasePersonalAccessToken.trim()) {
      setRouteNotice("Create a Supabase Personal Access Token before continuing.", "error");
      return;
    }

    if (!indexId) {
      setRouteNotice("Create the index before saving the deployment token.", "error");
      return;
    }

    setSavingFunctionAccess(true);
    try {
      const response = await deployIndexAdminChildFunctions(
        {
          indexId,
          supabasePersonalAccessToken,
          adminPassword,
          dispatchWorkflow: false
        },
        {
          bridgeToken: bridgeToken || undefined
        }
      );
      applySetupResponse(response.setup);
      setSupabasePatConfirmed(true);
      setRouteNotice("Deployment token saved for the child repo.", "notice");
    } catch (error) {
      setRouteNotice(
        error instanceof Error
          ? error.message
          : "Could not save the child repo deployment token.",
        "error"
      );
    } finally {
      setSavingFunctionAccess(false);
    }
  }, [
    adminPassword,
    applySetupResponse,
    bridgeToken,
    indexId,
    setRouteNotice,
    supabasePersonalAccessToken
  ]);

  const handleConfigureStandaloneAuth = useCallback(async () => {
    if (!indexId) {
      return;
    }

    setRouteNotice(null, null);
    setConfiguringStandaloneAuth(true);
    try {
      const response = await configureIndexAdminStandaloneAuth(
        {
          indexId,
          githubClientId,
          githubClientSecret,
          supabasePersonalAccessToken
        },
        {
          bridgeToken: bridgeToken || undefined
        }
      );
      applySetupResponse(response.setup);
      setGithubClientSecret("");
      setRouteNotice("GitHub sign-in configured for the child project.", "notice");
    } catch (error) {
      setRouteNotice(
        error instanceof Error
          ? error.message
          : "Could not configure GitHub sign-in for the child project.",
        "error"
      );
    } finally {
      setConfiguringStandaloneAuth(false);
    }
  }, [
    applySetupResponse,
    bridgeToken,
    githubClientId,
    githubClientSecret,
    indexId,
    setRouteNotice,
    supabasePersonalAccessToken
  ]);

  const handleFinalizeIndex = useCallback(async () => {
    if (!indexId) {
      return;
    }

    setRouteNotice(null, null);
    setStartingFinalization(true);
    try {
      const response = await finalizeIndexAdmin(
        { indexId },
        {
          bridgeToken: bridgeToken || undefined
        }
      );
      applySetupResponse(response.setup);
      setRouteNotice("Child setup started. Solidary is copying the standalone app now.", "notice");
    } catch (error) {
      setRouteNotice(
        error instanceof Error ? error.message : "Could not finalize the child setup.",
        "error"
      );
    } finally {
      setStartingFinalization(false);
    }
  }, [applySetupResponse, bridgeToken, indexId, setRouteNotice]);

  const handleDeployFunctions = useCallback(async () => {
    if (!indexId) {
      return;
    }

    setRouteNotice(null, null);
    setDeployingFunctions(true);
    setFunctionsDeploymentPending(true);
    try {
      const response = await deployIndexAdminChildFunctions(
        {
          indexId,
          supabasePersonalAccessToken,
          adminPassword
        },
        {
          bridgeToken: bridgeToken || undefined
        }
      );
      applySetupResponse(response.setup);
      setFunctionsDeploymentPending(
        shouldAwaitFunctionsDeploymentRun(response.setup.functionsDeployment.status)
      );
      setSupabasePersonalAccessToken("");
      setRouteNotice(
        "Child deploy workflow started. Solidary is checking GitHub Actions now.",
        "notice"
      );
    } catch (error) {
      setFunctionsDeploymentPending(false);
      setRouteNotice(
        error instanceof Error ? error.message : "Could not run the child deploy workflow.",
        "error"
      );
    } finally {
      setDeployingFunctions(false);
    }
  }, [
    adminPassword,
    applySetupResponse,
    bridgeToken,
    indexId,
    setRouteNotice,
    supabasePersonalAccessToken
  ]);

  return {
    setupLoading,
    setup,
    bridgeToken,
    configuringStandaloneAuth,
    savingFunctionAccess,
    startingFinalization,
    deployingFunctions,
    functionsDeploymentPending,
    githubClientId,
    githubClientSecret,
    adminPassword,
    supabasePersonalAccessToken,
    supabasePatConfirmed,
    refreshSetup,
    setSetup: applySetupResponse,
    setBridgeToken,
    setGithubClientId,
    setGithubClientSecret,
    setAdminPassword,
    setSupabasePersonalAccessToken,
    setSupabasePatConfirmed,
    handleContinueSupabasePersonalAccessToken,
    handleConfigureStandaloneAuth,
    handleFinalizeIndex,
    handleDeployFunctions
  };
};
