import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NoticeKind } from "../../../types/notice";
import {
  parseStudioSettingsSection,
  STUDIO_SETTINGS_SECTION_LABELS,
  STUDIO_SETTINGS_SECTION_ORDER
} from "../../studio/routes/site-settings/services/settings-sections";
import { listAccessibleIndexAdmins, readIndexAdmin } from "../services/index-admin";
import type { IndexAdminListItem, IndexAdminReadResponse, IndexAdminSetup, IndexAdminState } from "../services/types";
import {
  buildIndexListItemFromState,
  buildSearchParams,
  getFriendlyErrorMessage,
  resetAdminFormFields
} from "./adminRouteShared";
import type { CollaboratorSearchResult } from "../../studio/routes/site-builder/services/types";
import { readAdminBridgeToken, rememberAdminBridgeToken } from "../../index-create/hooks/indexCreateShared";

type SetRouteNotice = (message: string | null, kind: NoticeKind) => void;

export const useAdminRouteData = ({
  setRouteNotice,
  setTitle,
  setDescription,
  setDomainInput,
  setImageFile,
  setSelectedSuggestion,
  setSuggestions
}: {
  setRouteNotice: SetRouteNotice;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setDomainInput: (value: string) => void;
  setImageFile: (value: File | null) => void;
  setSelectedSuggestion: (value: CollaboratorSearchResult | null) => void;
  setSuggestions: (value: CollaboratorSearchResult[]) => void;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [indexes, setIndexes] = useState<IndexAdminListItem[]>([]);
  const [indexesLoading, setIndexesLoading] = useState(true);
  const [stateLoading, setStateLoading] = useState(false);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [state, setState] = useState<IndexAdminState | null>(null);
  const [setup, setSetup] = useState<IndexAdminSetup | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const previousFunctionsStatusRef = useRef<string | null>(null);

  const activeSection = parseStudioSettingsSection(searchParams.get("section")) ?? "general";
  const requestedIndexId = searchParams.get("indexId")?.trim() ?? "";
  const bridgeTokenFromUrl = searchParams.get("bridge")?.trim() ?? "";
  const bridgeToken = bridgeTokenFromUrl || readAdminBridgeToken(requestedIndexId);
  const isBridgeMode = Boolean(bridgeToken);
  const createdMode = searchParams.get("created") === "1";

  useEffect(() => {
    if (!bridgeTokenFromUrl) return;
    if (requestedIndexId) {
      rememberAdminBridgeToken({ indexId: requestedIndexId, token: bridgeTokenFromUrl });
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("bridge");
    setSearchParams(nextParams, { replace: true });
  }, [bridgeTokenFromUrl, requestedIndexId, searchParams, setSearchParams]);

  const selectedArchiveId = useMemo(() => {
    if (isBridgeMode) {
      if (requestedIndexId && indexes.some((entry) => entry.id === requestedIndexId)) {
        return requestedIndexId;
      }
      return state?.index.id || indexes[0]?.id || "";
    }
    if (!indexes.length) return "";
    if (requestedIndexId && indexes.some((entry) => entry.id === requestedIndexId)) {
      return requestedIndexId;
    }
    return indexes[0]?.id ?? "";
  }, [indexes, isBridgeMode, requestedIndexId, state?.index.id]);

  const buildReadOptions = useCallback(
    ({
      supabasePersonalAccessToken
    }: {
      supabasePersonalAccessToken?: string;
    } = {}) => ({
      bridgeToken: isBridgeMode ? bridgeToken : undefined,
      supabasePersonalAccessToken: supabasePersonalAccessToken?.trim() || undefined
    }),
    [bridgeToken, isBridgeMode]
  );

  const applyResponse = useCallback(
    (
      response: IndexAdminReadResponse,
      { resetFields = true }: { resetFields?: boolean } = {}
    ) => {
      setState(response.state);
      setSetup(response.setup);
      if (isBridgeMode) {
        setIndexes([buildIndexListItemFromState(response.state)]);
        setIndexesLoading(false);
      }
      if (!resetFields) {
        return;
      }
      resetAdminFormFields({
        state: response.state,
        setTitle,
        setDescription,
        setDomainInput,
        setImageFile,
        setSelectedSuggestion,
        setSuggestions
      });
    },
    [isBridgeMode, setDescription, setDomainInput, setImageFile, setSelectedSuggestion, setSuggestions, setTitle]
  );

  useEffect(() => {
    if (isBridgeMode) {
      return;
    }

    let cancelled = false;
    setIndexesLoading(true);

    void (async () => {
      try {
        const items = await listAccessibleIndexAdmins();
        if (cancelled) return;
        setIndexes(items);
      } catch (error) {
        if (cancelled) return;
        setIndexes([]);
        setRouteNotice(getFriendlyErrorMessage(error, "Could not load your index admin list."), "error");
      } finally {
        if (!cancelled) {
          setIndexesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isBridgeMode, setRouteNotice]);

  useEffect(() => {
    if (!indexes.length) return;
    if (requestedIndexId && indexes.some((entry) => entry.id === requestedIndexId)) {
      return;
    }

    const nextArchiveId = indexes[0]?.id ?? "";
    if (!nextArchiveId) return;
    setSearchParams(buildSearchParams({ current: searchParams, indexId: nextArchiveId, section: activeSection }), {
      replace: true
    });
  }, [activeSection, indexes, requestedIndexId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedArchiveId && !isBridgeMode) {
      setState(null);
      setSetup(null);
      previousFunctionsStatusRef.current = null;
      return;
    }

    let cancelled = false;
    setStateLoading(true);
    setCollaboratorsLoading(true);

    void (async () => {
      try {
        const response = await readIndexAdmin(selectedArchiveId, buildReadOptions());
        if (cancelled) return;
        applyResponse(response);
        setRouteNotice(createdMode ? "Index created. Finish the standalone OAuth setup below." : null, createdMode ? "notice" : null);
      } catch (error) {
        if (cancelled) return;
        setState(null);
        setSetup(null);
        setRouteNotice(getFriendlyErrorMessage(error, "Could not load index admin."), "error");
      } finally {
        if (!cancelled) {
          if (isBridgeMode) {
            setIndexesLoading(false);
          }
          setStateLoading(false);
          setCollaboratorsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyResponse, buildReadOptions, createdMode, isBridgeMode, selectedArchiveId, setRouteNotice]);

  useEffect(() => {
    const nextStatus = setup?.functionsDeployment.status ?? null;
    const previousStatus = previousFunctionsStatusRef.current;

    if (!selectedArchiveId) {
      previousFunctionsStatusRef.current = null;
      return;
    }

    if (nextStatus && previousStatus && nextStatus !== previousStatus) {
      if (previousStatus === "running" && nextStatus === "deployed") {
        setRouteNotice("Child functions deployed. The standalone index is ready.", "notice");
      } else if (previousStatus === "running" && nextStatus === "failed") {
        setRouteNotice("Child function deployment failed. Review the latest workflow output below.", "error");
      }
    }

    previousFunctionsStatusRef.current = nextStatus;
  }, [selectedArchiveId, setRouteNotice, setup?.functionsDeployment.status]);

  useEffect(() => {
    if (
      !selectedArchiveId ||
      (!setup?.finalization.isRunning && setup?.functionsDeployment.status !== "running")
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
      void (async () => {
        setSetupLoading(true);
        try {
          const response = await readIndexAdmin(selectedArchiveId, buildReadOptions());
          if (cancelled) {
            return;
          }
          applyResponse(response, { resetFields: false });
        } catch (error) {
          if (cancelled) {
            return;
          }
          setRouteNotice(getFriendlyErrorMessage(error, "Could not refresh finalization status."), "error");
        } finally {
          refreshInFlight = false;
          if (!cancelled) {
            setSetupLoading(false);
          }
        }
      })();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeSection,
    applyResponse,
    buildReadOptions,
    selectedArchiveId,
    setRouteNotice,
    setup?.finalization.isRunning,
    setup?.functionsDeployment.status
  ]);

  const refreshSetup = useCallback(
    async ({
      supabasePersonalAccessToken
    }: {
      supabasePersonalAccessToken?: string;
    } = {}) => {
      if (!selectedArchiveId) {
        return;
      }

      setSetupLoading(true);
      try {
        const response = await readIndexAdmin(
          selectedArchiveId,
          buildReadOptions({ supabasePersonalAccessToken })
        );
        applyResponse(response, { resetFields: false });
      } catch (error) {
        setRouteNotice(getFriendlyErrorMessage(error, "Could not refresh setup status."), "error");
      } finally {
        setSetupLoading(false);
      }
    },
    [applyResponse, buildReadOptions, selectedArchiveId, setRouteNotice]
  );

  const sectionButtons = useMemo(
    () =>
      STUDIO_SETTINGS_SECTION_ORDER.map((section) => ({
        section,
        label: STUDIO_SETTINGS_SECTION_LABELS[section],
        disabled: false,
        lockedByOther: false,
        lockHolderName: null,
        lockHolderAvatarUrl: null
      })),
    []
  );

  const selectedIndex = indexes.find((entry) => entry.id === selectedArchiveId) ?? null;

  return {
    searchParams,
    setSearchParams,
    indexes,
    indexesLoading,
    stateLoading,
    collaboratorsLoading,
    state,
    setup,
    setupLoading,
    activeSection,
    createdMode,
    bridgeToken,
    isBridgeMode,
    selectedArchiveId,
    selectedIndex,
    sectionButtons,
    applyResponse,
    refreshSetup,
    buildReadOptions
  };
};
