import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NoticeKind } from "../../../types/notice";
import type {
  CollaboratorRole,
  CollaboratorSearchResult
} from "../../studio/routes/site-builder/services/types";
import {
  parseStudioSettingsSection,
  STUDIO_SETTINGS_SECTION_LABELS,
  STUDIO_SETTINGS_SECTION_ORDER,
  type StudioSettingsSection
} from "../../studio/routes/site-settings/services/settings-sections";
import {
  configureIndexAdminStandaloneAuth,
  deployIndexAdminChildFunctions,
  fileToBase64,
  finalizeIndexAdmin,
  listAccessibleIndexAdmins,
  readIndexAdmin,
  removeIndexAdminCollaborator,
  saveIndexAdminAdvanced,
  saveIndexAdminCollaborator,
  updateIndexAdminConnectionRequest,
  saveIndexAdminGeneral,
  searchIndexAdminCollaborators
} from "../services/index-admin";
import type { IndexAdminListItem, IndexAdminReadResponse, IndexAdminSetup, IndexAdminState } from "../services/types";

const getFriendlyErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const buildSearchParams = ({
  current,
  indexId,
  section,
  clearCreated = false
}: {
  current: URLSearchParams;
  indexId: string;
  section: StudioSettingsSection;
  clearCreated?: boolean;
}) => {
  const next = new URLSearchParams(current);
  next.set("indexId", indexId);
  next.set("section", section);
  if (clearCreated) {
    next.delete("created");
  }
  return next;
};

const applyStateToFields = ({
  state,
  setTitle,
  setDescription,
  setDomainInput,
  setImageFile,
  setSelectedSuggestion,
  setSuggestions
}: {
  state: IndexAdminState;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setDomainInput: (value: string) => void;
  setImageFile: (value: File | null) => void;
  setSelectedSuggestion: (value: CollaboratorSearchResult | null) => void;
  setSuggestions: (value: CollaboratorSearchResult[]) => void;
}) => {
  setTitle(state.index.title);
  setDescription(state.index.description);
  setDomainInput(state.index.canonicalUrl);
  setImageFile(null);
  setSelectedSuggestion(null);
  setSuggestions([]);
};

const buildIndexListItemFromState = (state: IndexAdminState): IndexAdminListItem => ({
  id: state.index.id,
  slug: state.index.slug,
  title: state.index.title,
  description: state.index.description,
  imageUrl: state.index.imageUrl,
  canonicalUrl: state.index.canonicalUrl,
  repoFullName: state.index.repoFullName,
  repoUrl: state.index.repoUrl,
  supabaseProjectRef: state.index.supabaseProjectRef,
  supabaseDashboardUrl: state.index.supabaseDashboardUrl,
  indexLevel: state.index.indexLevel,
  parentIndexId: state.index.parentIndexId,
  parentIndexUrl: state.index.parentIndexUrl,
  parentIndexLevel: state.index.parentIndexLevel,
  accessRole: state.actor.role
});

export const useAdminRouteController = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);

  const [indexes, setIndexes] = useState<IndexAdminListItem[]>([]);
  const [indexesLoading, setIndexesLoading] = useState(true);
  const [stateLoading, setStateLoading] = useState(false);
  const [state, setState] = useState<IndexAdminState | null>(null);
  const [setup, setSetup] = useState<IndexAdminSetup | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [savingGeneral, setSavingGeneral] = useState(false);

  const [collaboratorQuery, setCollaboratorQuery] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState<CollaboratorRole>("editor");
  const [collaboratorSuggestions, setCollaboratorSuggestions] = useState<CollaboratorSearchResult[]>(
    []
  );
  const [selectedCollaboratorSuggestion, setSelectedCollaboratorSuggestion] =
    useState<CollaboratorSearchResult | null>(null);
  const [collaboratorSearchLoading, setCollaboratorSearchLoading] = useState(false);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [updatingCollaboratorUserId, setUpdatingCollaboratorUserId] = useState<string | null>(null);

  const [updatingConnectionRequestId, setUpdatingConnectionRequestId] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [savingAdvanced, setSavingAdvanced] = useState(false);
  const [startingFinalization, setStartingFinalization] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [configuringStandaloneAuth, setConfiguringStandaloneAuth] = useState(false);
  const [deployingFunctions, setDeployingFunctions] = useState(false);
  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [supabasePersonalAccessToken, setSupabasePersonalAccessToken] = useState("");

  const queryRequestIdRef = useRef(0);
  const previousFunctionsStatusRef = useRef<string | null>(null);
  const activeSection = parseStudioSettingsSection(searchParams.get("section")) ?? "general";
  const requestedIndexId = searchParams.get("indexId")?.trim() ?? "";
  const bridgeToken = searchParams.get("bridge")?.trim() ?? "";
  const isBridgeMode = Boolean(bridgeToken);
  const createdMode = searchParams.get("created") === "1";

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
      supabasePersonalAccessToken: nextSupabasePersonalAccessToken
    }: {
      supabasePersonalAccessToken?: string;
    } = {}) => ({
      bridgeToken: isBridgeMode ? bridgeToken : undefined,
      supabasePersonalAccessToken: nextSupabasePersonalAccessToken?.trim() || undefined
    }),
    [bridgeToken, isBridgeMode]
  );

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(state?.index.imageUrl || null);
      return;
    }

    const nextUrl = URL.createObjectURL(imageFile);
    setImagePreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [imageFile, state?.index.imageUrl]);

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
        setNotice(getFriendlyErrorMessage(error, "Could not load your index admin list."));
        setNoticeKind("error");
      } finally {
        if (!cancelled) {
          setIndexesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isBridgeMode]);

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

  const applyResponse = useCallback((
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
    applyStateToFields({
      state: response.state,
      setTitle,
      setDescription,
      setDomainInput,
      setImageFile,
      setSelectedSuggestion: setSelectedCollaboratorSuggestion,
      setSuggestions: setCollaboratorSuggestions
    });
  }, [isBridgeMode]);

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
        setNotice(createdMode ? "Index created. Finish the standalone OAuth setup below." : null);
        setNoticeKind(createdMode ? "notice" : null);
      } catch (error) {
        if (cancelled) return;
        setState(null);
        setSetup(null);
        setNotice(getFriendlyErrorMessage(error, "Could not load index admin."));
        setNoticeKind("error");
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
  }, [applyResponse, buildReadOptions, createdMode, isBridgeMode, selectedArchiveId]);

  useEffect(() => {
    const nextStatus = setup?.functionsDeployment.status ?? null;
    const previousStatus = previousFunctionsStatusRef.current;

    if (!selectedArchiveId) {
      previousFunctionsStatusRef.current = null;
      return;
    }

    if (nextStatus && previousStatus && nextStatus !== previousStatus) {
      if (previousStatus === "running" && nextStatus === "deployed") {
        setNotice("Child functions deployed. The standalone index is ready.");
        setNoticeKind("notice");
      } else if (previousStatus === "running" && nextStatus === "failed") {
        setNotice("Child function deployment failed. Review the latest workflow output below.");
        setNoticeKind("error");
      }
    }

    previousFunctionsStatusRef.current = nextStatus;
  }, [selectedArchiveId, setup?.functionsDeployment.status]);

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
          setNotice(getFriendlyErrorMessage(error, "Could not refresh finalization status."));
          setNoticeKind("error");
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
    applyResponse,
    selectedArchiveId,
    setup?.finalization.isRunning,
    setup?.functionsDeployment.status,
    buildReadOptions
  ]);

  useEffect(() => {
    const query = collaboratorQuery.trim();
    if (!state?.actor.canManageCollaborators || query.length < 2 || !selectedArchiveId) {
      setCollaboratorSuggestions([]);
      setCollaboratorSearchLoading(false);
      return;
    }

    const requestId = ++queryRequestIdRef.current;
    const timeoutId = window.setTimeout(() => {
      setCollaboratorSearchLoading(true);
      void (async () => {
        try {
          const response = await searchIndexAdminCollaborators({
            indexId: selectedArchiveId,
            query,
            bridgeToken: isBridgeMode ? bridgeToken : undefined
          });
          if (queryRequestIdRef.current !== requestId) {
            return;
          }
          setCollaboratorSuggestions(response.results);
        } catch (error) {
          if (queryRequestIdRef.current !== requestId) {
            return;
          }
          setCollaboratorSuggestions([]);
          setNotice(getFriendlyErrorMessage(error, "Could not search collaborators."));
          setNoticeKind("error");
        } finally {
          if (queryRequestIdRef.current === requestId) {
            setCollaboratorSearchLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [bridgeToken, collaboratorQuery, isBridgeMode, selectedArchiveId, state?.actor.canManageCollaborators]);

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

  const handleSaveGeneral = async () => {
    if (!state || !selectedArchiveId) return;
    setSavingGeneral(true);
    try {
      const response = await saveIndexAdminGeneral({
        indexId: selectedArchiveId,
        title: title.trim(),
        description: description.trim(),
        imageContentB64: imageFile ? await fileToBase64(imageFile) : undefined
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response);
      setNotice("General settings saved.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not save general settings."));
      setNoticeKind("error");
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleConnectionRequestAction = async (
    requestId: string,
    action: "approve" | "reject" | "disconnect"
  ) => {
    if (!selectedArchiveId) return;
    setUpdatingConnectionRequestId(requestId);
    try {
      const response = await updateIndexAdminConnectionRequest({
        indexId: selectedArchiveId,
        requestId,
        action
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response);
      setNotice(
        action === "approve"
          ? "Connection approved."
          : action === "reject"
            ? "Connection request rejected."
            : "Connection removed."
      );
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not update connection."));
      setNoticeKind("error");
    } finally {
      setUpdatingConnectionRequestId(null);
    }
  };

  const handleInviteCollaborator = async () => {
    if (!selectedArchiveId || !selectedCollaboratorSuggestion) return;
    setUpdatingCollaboratorUserId(selectedCollaboratorSuggestion.userId);
    try {
      const response = await saveIndexAdminCollaborator({
        indexId: selectedArchiveId,
        collaboratorUserId: selectedCollaboratorSuggestion.userId,
        role: collaboratorRole
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response);
      setCollaboratorQuery("");
      setSelectedCollaboratorSuggestion(null);
      setNotice("Collaborator added.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not add collaborator."));
      setNoticeKind("error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  const handleCollaboratorRoleUpdate = async (userId: string, role: CollaboratorRole) => {
    if (!selectedArchiveId) return;
    setUpdatingCollaboratorUserId(userId);
    try {
      const response = await saveIndexAdminCollaborator({
        indexId: selectedArchiveId,
        collaboratorUserId: userId,
        role
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response);
      setNotice("Collaborator role updated.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not update collaborator role."));
      setNoticeKind("error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  const handleCollaboratorRemove = async (userId: string) => {
    if (!selectedArchiveId) return;
    setUpdatingCollaboratorUserId(userId);
    try {
      const response = await removeIndexAdminCollaborator({
        indexId: selectedArchiveId,
        collaboratorUserId: userId
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response);
      setNotice("Collaborator removed.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not remove collaborator."));
      setNoticeKind("error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  const handleSaveDomain = async (domain: string | null) => {
    if (!selectedArchiveId) return;
    setSavingAdvanced(true);
    try {
      const response = await saveIndexAdminAdvanced({
        indexId: selectedArchiveId,
        domain
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response);
      setNotice(domain ? "Custom domain updated." : "Reset back to GitHub Pages.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not update custom domain."));
      setNoticeKind("error");
    } finally {
      setSavingAdvanced(false);
    }
  };

  const handleFinalizeIndex = async () => {
    if (!selectedArchiveId || !setup?.finalization.available) {
      return;
    }

    const confirmed = window.confirm(
      "Finalise this index now? This copies the parent index app into the child repo and overwrites the managed app files."
    );
    if (!confirmed) {
      return;
    }

    setStartingFinalization(true);
    try {
      const response = await finalizeIndexAdmin({
        indexId: selectedArchiveId
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response, { resetFields: false });
      setNotice("Index finalization started. This page will keep refreshing until the copy finishes.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not start index finalization."));
      setNoticeKind("error");
    } finally {
      setStartingFinalization(false);
    }
  };

  const handleRefreshSetup = async () => {
    if (!selectedArchiveId) {
      return;
    }

    const shouldUseSupabasePersonalAccessToken =
      !setup?.authSetup.localAuthReady &&
      !setup?.finalization.isRunning &&
      setup?.functionsDeployment.status !== "running" &&
      Boolean(supabasePersonalAccessToken.trim());

    setSetupLoading(true);
    try {
      const response = await readIndexAdmin(
        selectedArchiveId,
        buildReadOptions({
          supabasePersonalAccessToken: shouldUseSupabasePersonalAccessToken
            ? supabasePersonalAccessToken
            : undefined
        })
      );
      applyResponse(response, { resetFields: false });
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not refresh setup status."));
      setNoticeKind("error");
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConfigureStandaloneAuth = async () => {
    if (!selectedArchiveId) {
      return;
    }

    setConfiguringStandaloneAuth(true);
    try {
      const response = await configureIndexAdminStandaloneAuth({
        indexId: selectedArchiveId,
        githubClientId,
        githubClientSecret,
        supabasePersonalAccessToken
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response, { resetFields: false });
      setGithubClientSecret("");
      setNotice("GitHub sign-in configured for the child project.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not configure child GitHub auth."));
      setNoticeKind("error");
    } finally {
      setConfiguringStandaloneAuth(false);
    }
  };

  const handleDeployFunctions = async () => {
    if (!selectedArchiveId) {
      return;
    }

    setDeployingFunctions(true);
    try {
      const response = await deployIndexAdminChildFunctions({
        indexId: selectedArchiveId,
        supabasePersonalAccessToken,
        adminPassword
      }, {
        bridgeToken: isBridgeMode ? bridgeToken : undefined
      });
      applyResponse(response, { resetFields: false });
      setSupabasePersonalAccessToken("");
      setNotice("Child function deployment started.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not deploy child functions."));
      setNoticeKind("error");
    } finally {
      setDeployingFunctions(false);
    }
  };

  const handleCopyValue = async (value: string, successMessage: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue || typeof navigator === "undefined" || !navigator.clipboard) {
      setNotice("Clipboard access is not available in this browser.");
      setNoticeKind("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmedValue);
      setNotice(successMessage);
      setNoticeKind("notice");
    } catch {
      setNotice("Could not copy that value.");
      setNoticeKind("error");
    }
  };

  return {
    notice,
    noticeKind,
    indexes,
    selectedIndex,
    selectedArchiveId,
    indexesLoading,
    stateLoading,
    state,
    setup,
    activeSection,
    createdMode,
    title,
    description,
    imagePreview,
    collaboratorQuery,
    collaboratorRole,
    collaboratorSuggestions,
    selectedCollaboratorSuggestion,
    collaboratorSearchLoading,
    collaboratorsLoading,
    updatingCollaboratorUserId,
    updatingConnectionRequestId,
    domainInput,
    savingGeneral,
    savingAdvanced,
    startingFinalization,
    setupLoading,
    configuringStandaloneAuth,
    deployingFunctions,
    githubClientId,
    githubClientSecret,
    adminPassword,
    supabasePersonalAccessToken,
    bridgeMode: isBridgeMode,
    settingsTopbarProps: {
      activeSection,
      sectionButtons,
      onSectionChange: (section: StudioSettingsSection) => {
        if (!selectedArchiveId) return;
        setSearchParams(buildSearchParams({ current: searchParams, indexId: selectedArchiveId, section }));
      }
    },
    onSelectedArchiveChange: (indexId: string) => {
      if (!indexId) return;
      setSearchParams(
        buildSearchParams({
          current: searchParams,
          indexId,
          section: activeSection,
          clearCreated: true
        })
      );
    },
    onTitleChange: setTitle,
    onDescriptionChange: setDescription,
    onImageChange: setImageFile,
    onSaveGeneral: () => {
      void handleSaveGeneral();
    },
    onCollaboratorQueryChange: (value: string) => {
      setCollaboratorQuery(value);
      setSelectedCollaboratorSuggestion(null);
    },
    onCollaboratorRoleChange: setCollaboratorRole,
    onCollaboratorSuggestionSelect: setSelectedCollaboratorSuggestion,
    onInviteCollaborator: () => {
      void handleInviteCollaborator();
    },
    onCollaboratorRoleUpdate: (userId: string, role: CollaboratorRole) => {
      void handleCollaboratorRoleUpdate(userId, role);
    },
    onCollaboratorRemove: (userId: string) => {
      void handleCollaboratorRemove(userId);
    },
    onConnectionRequestAction: (
      requestId: string,
      action: "approve" | "reject" | "disconnect"
    ) => {
      void handleConnectionRequestAction(requestId, action);
    },
    onDomainInputChange: setDomainInput,
    onSaveDomain: () => {
      void handleSaveDomain(domainInput.trim() || null);
    },
    onResetDomain: () => {
      void handleSaveDomain(null);
    },
    onFinalizeIndex: () => {
      void handleFinalizeIndex();
    },
    onRefreshSetup: () => {
      void handleRefreshSetup();
    },
    onGithubClientIdChange: setGithubClientId,
    onGithubClientSecretChange: setGithubClientSecret,
    onAdminPasswordChange: setAdminPassword,
    onConfigureStandaloneAuth: () => {
      void handleConfigureStandaloneAuth();
    },
    onSupabasePersonalAccessTokenChange: setSupabasePersonalAccessToken,
    onDeployFunctions: () => {
      void handleDeployFunctions();
    },
    onCopyValue: (value: string, successMessage: string) => {
      void handleCopyValue(value, successMessage);
    }
  };
};
