import { useCallback, useEffect, useState } from "react";
import type { NoticeKind } from "../../../types/notice";
import type { CollaboratorRole } from "../../studio/routes/site-builder/services/types";
import type { StudioSettingsSection } from "../../studio/routes/site-settings/services/settings-sections";
import {
  configureIndexAdminStandaloneAuth,
  deployIndexAdminChildFunctions,
  finalizeIndexAdmin,
  processIndexAdminImage,
  saveIndexAdminAdvanced,
  saveIndexAdminGeneral,
  updateIndexAdminConnectionRequest
} from "../services/index-admin";
import { buildSearchParams, getFriendlyErrorMessage } from "./adminRouteShared";
import { useAdminCollaborators } from "./useAdminCollaborators";
import { useAdminRouteData } from "./useAdminRouteData";

export const useAdminRouteController = () => {
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [updatingConnectionRequestId, setUpdatingConnectionRequestId] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [savingAdvanced, setSavingAdvanced] = useState(false);
  const [startingFinalization, setStartingFinalization] = useState(false);
  const [configuringStandaloneAuth, setConfiguringStandaloneAuth] = useState(false);
  const [deployingFunctions, setDeployingFunctions] = useState(false);
  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [supabasePersonalAccessToken, setSupabasePersonalAccessToken] = useState("");

  const setRouteNotice = useCallback((message: string | null, kind: NoticeKind) => {
    setNotice(message);
    setNoticeKind(kind);
  }, []);

  const data = useAdminRouteData({
    setRouteNotice,
    setTitle,
    setDescription,
    setDomainInput,
    setImageFile,
    setSelectedSuggestion: () => {},
    setSuggestions: () => {}
  });

  const collaborators = useAdminCollaborators({
    selectedArchiveId: data.selectedArchiveId,
    state: data.state,
    bridgeToken: data.bridgeToken,
    isBridgeMode: data.isBridgeMode,
    setRouteNotice,
    applyResponse: data.applyResponse
  });

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(data.state?.index.imageUrl || null);
      return;
    }

    const nextUrl = URL.createObjectURL(imageFile);
    setImagePreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [data.state?.index.imageUrl, imageFile]);

  const handleSaveGeneral = async () => {
    if (!data.state || !data.selectedArchiveId) return;
    setSavingGeneral(true);
    try {
      const processedImage = imageFile ? await processIndexAdminImage(imageFile) : null;
      const response = await saveIndexAdminGeneral(
        {
          indexId: data.selectedArchiveId,
          title: title.trim(),
          description: description.trim(),
          imageContentB64: processedImage?.imageContentB64,
          imageThumbContentB64: processedImage?.imageThumbContentB64
        },
        {
          bridgeToken: data.isBridgeMode ? data.bridgeToken : undefined
        }
      );
      data.applyResponse(response);
      setRouteNotice("General settings saved.", "notice");
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not save general settings."), "error");
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleConnectionRequestAction = async (
    requestId: string,
    action: "approve" | "reject" | "disconnect"
  ) => {
    if (!data.selectedArchiveId) return;
    setUpdatingConnectionRequestId(requestId);
    try {
      const response = await updateIndexAdminConnectionRequest(
        {
          indexId: data.selectedArchiveId,
          requestId,
          action
        },
        {
          bridgeToken: data.isBridgeMode ? data.bridgeToken : undefined
        }
      );
      data.applyResponse(response);
      setRouteNotice(
        action === "approve"
          ? "Connection approved."
          : action === "reject"
            ? "Connection request rejected."
            : "Connection removed.",
        "notice"
      );
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not update connection."), "error");
    } finally {
      setUpdatingConnectionRequestId(null);
    }
  };

  const handleSaveDomain = async (domain: string | null) => {
    if (!data.selectedArchiveId) return;
    setSavingAdvanced(true);
    try {
      const response = await saveIndexAdminAdvanced(
        {
          indexId: data.selectedArchiveId,
          domain
        },
        {
          bridgeToken: data.isBridgeMode ? data.bridgeToken : undefined
        }
      );
      data.applyResponse(response);
      setRouteNotice(domain ? "Custom domain updated." : "Reset back to GitHub Pages.", "notice");
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not update custom domain."), "error");
    } finally {
      setSavingAdvanced(false);
    }
  };

  const handleFinalizeIndex = async () => {
    if (!data.selectedArchiveId || !data.setup?.finalization.available) {
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
      const response = await finalizeIndexAdmin(
        {
          indexId: data.selectedArchiveId
        },
        {
          bridgeToken: data.isBridgeMode ? data.bridgeToken : undefined
        }
      );
      data.applyResponse(response, { resetFields: false });
      setRouteNotice(
        "Index finalization started. This page will keep refreshing until the copy finishes.",
        "notice"
      );
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not start index finalization."), "error");
    } finally {
      setStartingFinalization(false);
    }
  };

  const handleRefreshSetup = async () => {
    const shouldUseSupabasePersonalAccessToken =
      !data.setup?.authSetup.localAuthReady &&
      !data.setup?.finalization.isRunning &&
      data.setup?.functionsDeployment.status !== "running" &&
      Boolean(supabasePersonalAccessToken.trim());

    await data.refreshSetup({
      supabasePersonalAccessToken: shouldUseSupabasePersonalAccessToken
        ? supabasePersonalAccessToken
        : undefined
    });
  };

  const handleConfigureStandaloneAuth = async () => {
    if (!data.selectedArchiveId) {
      return;
    }

    setConfiguringStandaloneAuth(true);
    try {
      const response = await configureIndexAdminStandaloneAuth(
        {
          indexId: data.selectedArchiveId,
          githubClientId,
          githubClientSecret,
          supabasePersonalAccessToken
        },
        {
          bridgeToken: data.isBridgeMode ? data.bridgeToken : undefined
        }
      );
      data.applyResponse(response, { resetFields: false });
      setGithubClientSecret("");
      setRouteNotice("GitHub sign-in configured for the child project.", "notice");
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not configure child GitHub auth."), "error");
    } finally {
      setConfiguringStandaloneAuth(false);
    }
  };

  const handleDeployFunctions = async () => {
    if (!data.selectedArchiveId) {
      return;
    }

    setDeployingFunctions(true);
    try {
      const response = await deployIndexAdminChildFunctions(
        {
          indexId: data.selectedArchiveId,
          supabasePersonalAccessToken,
          adminPassword
        },
        {
          bridgeToken: data.isBridgeMode ? data.bridgeToken : undefined
        }
      );
      data.applyResponse(response, { resetFields: false });
      setSupabasePersonalAccessToken("");
      setRouteNotice("Child function deployment started.", "notice");
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not deploy child functions."), "error");
    } finally {
      setDeployingFunctions(false);
    }
  };

  const handleCopyValue = async (value: string, successMessage: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue || typeof navigator === "undefined" || !navigator.clipboard) {
      setRouteNotice("Clipboard access is not available in this browser.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmedValue);
      setRouteNotice(successMessage, "notice");
    } catch {
      setRouteNotice("Could not copy that value.", "error");
    }
  };

  return {
    notice,
    noticeKind,
    indexes: data.indexes,
    selectedIndex: data.selectedIndex,
    selectedArchiveId: data.selectedArchiveId,
    indexesLoading: data.indexesLoading,
    stateLoading: data.stateLoading,
    state: data.state,
    setup: data.setup,
    activeSection: data.activeSection,
    createdMode: data.createdMode,
    title,
    description,
    imagePreview,
    collaboratorQuery: collaborators.collaboratorQuery,
    collaboratorRole: collaborators.collaboratorRole,
    collaboratorSuggestions: collaborators.collaboratorSuggestions,
    selectedCollaboratorSuggestion: collaborators.selectedCollaboratorSuggestion,
    collaboratorSearchLoading: collaborators.collaboratorSearchLoading,
    collaboratorsLoading: data.collaboratorsLoading,
    updatingCollaboratorUserId: collaborators.updatingCollaboratorUserId,
    updatingConnectionRequestId,
    domainInput,
    savingGeneral,
    savingAdvanced,
    startingFinalization,
    setupLoading: data.setupLoading,
    configuringStandaloneAuth,
    deployingFunctions,
    githubClientId,
    githubClientSecret,
    adminPassword,
    supabasePersonalAccessToken,
    bridgeMode: data.isBridgeMode,
    settingsTopbarProps: {
      activeSection: data.activeSection,
      sectionButtons: data.sectionButtons,
      onSectionChange: (section: StudioSettingsSection) => {
        if (!data.selectedArchiveId) return;
        data.setSearchParams(
          buildSearchParams({
            current: data.searchParams,
            indexId: data.selectedArchiveId,
            section
          })
        );
      }
    },
    onSelectedArchiveChange: (indexId: string) => {
      if (!indexId) return;
      data.setSearchParams(
        buildSearchParams({
          current: data.searchParams,
          indexId,
          section: data.activeSection,
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
      collaborators.setCollaboratorQuery(value);
      collaborators.setSelectedCollaboratorSuggestion(null);
    },
    onCollaboratorRoleChange: collaborators.setCollaboratorRole,
    onCollaboratorSuggestionSelect: collaborators.setSelectedCollaboratorSuggestion,
    onInviteCollaborator: () => {
      void collaborators.handleInviteCollaborator();
    },
    onCollaboratorRoleUpdate: (userId: string, role: CollaboratorRole) => {
      void collaborators.handleCollaboratorRoleUpdate(userId, role);
    },
    onCollaboratorRemove: (userId: string) => {
      void collaborators.handleCollaboratorRemove(userId);
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
