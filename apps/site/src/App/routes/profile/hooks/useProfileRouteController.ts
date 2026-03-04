import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import {
  getGitHubAuthStatusForCurrentUser,
  uninstallGitHubAppForCurrentUser,
  type GitHubAppConnectionState,
  type GitHubAppRepositorySelection
} from "../../../features/auth/services/github-auth";
import type { NoticeKind } from "../../../types/notice";
import {
  isUserOwnedProfileAvatarPath,
  removeProfileAvatar
} from "../services/profile-avatar-upload";
import { getProfileSessionData, saveProfileSettings } from "../services/profile-settings";
import {
  MAX_PROFILE_AVATAR_OPTIONS,
  useProfileAvatarController
} from "./useProfileAvatarController";

const GITHUB_APP_CONNECT_RESULT_MESSAGE_TYPE = "solidary:github-app-connect-result";

type GitHubAppConnectResultStatus = "connected" | "error";

const getSaveErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Could not save profile settings.";
};

const parseGitHubAppConnectResultStatus = (value: string): GitHubAppConnectResultStatus =>
  value === "connected" ? "connected" : "error";

const parseGitHubAppConnectResultMessagePayload = (
  value: unknown
): { status: GitHubAppConnectResultStatus; message: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const type = (value as { type?: unknown }).type;
  if (type !== GITHUB_APP_CONNECT_RESULT_MESSAGE_TYPE) {
    return null;
  }

  const rawStatus = (value as { status?: unknown }).status;
  if (typeof rawStatus !== "string") {
    return null;
  }

  const rawMessage = (value as { message?: unknown }).message;
  return {
    status: parseGitHubAppConnectResultStatus(rawStatus.trim()),
    message: typeof rawMessage === "string" ? rawMessage.trim() : ""
  };
};

export const useProfileRouteController = () => {
  const { session, connectGitHubApp } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const profileData = useMemo(() => getProfileSessionData(session), [session]);

  const [displayName, setDisplayName] = useState(profileData.settings.displayName);
  const [savedDisplayName, setSavedDisplayName] = useState(profileData.settings.displayName);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [hasGitHubCredentials, setHasGitHubCredentials] = useState(false);
  const [hasSolidaryCredentials, setHasSolidaryCredentials] = useState(false);
  const [githubAppConnected, setGithubAppConnected] = useState(false);
  const [githubAppConnectionState, setGithubAppConnectionState] =
    useState<GitHubAppConnectionState>("not_connected");
  const [githubAppConnectionMessage, setGithubAppConnectionMessage] = useState<string | null>(null);
  const [githubAppRepositorySelection, setGithubAppRepositorySelection] =
    useState<GitHubAppRepositorySelection>("unknown");
  const [githubAppSelectedRepositories, setGithubAppSelectedRepositories] = useState<string[]>([]);
  const [githubAppSelectedRepositoriesTruncated, setGithubAppSelectedRepositoriesTruncated] =
    useState(false);
  const [githubAuthStatusLoading, setGithubAuthStatusLoading] = useState(false);

  const avatarController = useProfileAvatarController({
    session,
    profileData,
    savedDisplayName,
    setNotice,
    setNoticeKind,
    getSaveErrorMessage
  });

  useEffect(() => {
    setDisplayName(profileData.settings.displayName);
    setSavedDisplayName(profileData.settings.displayName);
    setNotice(null);
    setNoticeKind(null);
  }, [profileData.settings.displayName]);

  const refreshGitHubAuthStatus = useCallback(async () => {
    if (!session) {
      setHasGitHubCredentials(false);
      setHasSolidaryCredentials(false);
      setGithubAppConnected(false);
      setGithubAppConnectionState("not_connected");
      setGithubAppConnectionMessage(null);
      setGithubAppRepositorySelection("unknown");
      setGithubAppSelectedRepositories([]);
      setGithubAppSelectedRepositoriesTruncated(false);
      setGithubAuthStatusLoading(false);
      return;
    }

    setGithubAuthStatusLoading(true);
    try {
      const status = await getGitHubAuthStatusForCurrentUser();
      setHasGitHubCredentials(status.hasGitHubCredentials);
      setHasSolidaryCredentials(status.hasSolidaryCredentials);
      setGithubAppConnected(status.githubAppConnected);
      setGithubAppConnectionState(status.githubAppConnectionState);
      setGithubAppConnectionMessage(status.githubAppConnectionMessage);
      setGithubAppRepositorySelection(status.githubAppRepositorySelection);
      setGithubAppSelectedRepositories(status.githubAppSelectedRepositories);
      setGithubAppSelectedRepositoriesTruncated(status.githubAppSelectedRepositoriesTruncated);
    } catch {
      // Keep previous status when the request fails.
    } finally {
      setGithubAuthStatusLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refreshGitHubAuthStatus();
  }, [refreshGitHubAuthStatus]);

  const applyGitHubAppConnectResult = useCallback(
    (status: GitHubAppConnectResultStatus, message: string) => {
      if (status === "connected") {
        void refreshGitHubAuthStatus();
        setNotice("GitHub App connected.");
        setNoticeKind("notice");
        return;
      }

      setNotice(message || "Could not connect GitHub App.");
      setNoticeKind("error");
    },
    [refreshGitHubAuthStatus]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const payload = parseGitHubAppConnectResultMessagePayload(event.data);
      if (!payload) return;

      applyGitHubAppConnectResult(payload.status, payload.message);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyGitHubAppConnectResult]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const githubAppStatusRaw = params.get("github_app")?.trim() ?? "";
    const githubAppMessage = params.get("github_app_message")?.trim() ?? "";
    if (!githubAppStatusRaw) return;

    const githubAppStatus = parseGitHubAppConnectResultStatus(githubAppStatusRaw);

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
            status: githubAppStatus,
            message: githubAppMessage || null
          },
          window.location.origin
        );
      } catch {
        // Ignore postMessage failures and fall back to local notice handling.
      }

      try {
        window.close();
        return;
      } catch {
        // If the browser blocks closing this tab, continue with local notice handling.
      }
    }

    applyGitHubAppConnectResult(githubAppStatus, githubAppMessage);
  }, [
    applyGitHubAppConnectResult,
    location.hash,
    location.pathname,
    location.search,
    navigate
  ]);

  const openGitHubAppConnectPopup = () => {
    if (typeof window === "undefined") return null;

    const width = Math.min(900, Math.max(720, Math.floor(window.outerWidth * 0.8)));
    const height = Math.min(900, Math.max(700, Math.floor(window.outerHeight * 0.9)));
    const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));

    const features = [
      "popup=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");

    const popupWindow = window.open("about:blank", "solidary_github_app_connect", features);
    if (popupWindow) {
      return popupWindow;
    }

    return window.open("about:blank", "_blank");
  };

  const onConnectGitHubApp = () => {
    if (!session) {
      setNotice("Sign in with GitHub to connect your GitHub App installation.");
      setNoticeKind("error");
      return;
    }

    setConnectBusy(true);
    setNotice(null);
    setNoticeKind(null);

    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const popupWindow = openGitHubAppConnectPopup();
    const openMode = popupWindow ? "popup" : "same_tab";

    void connectGitHubApp({
      returnTo,
      openMode,
      navigationWindow: popupWindow
    })
      .catch((error) => {
        if (popupWindow && !popupWindow.closed) {
          popupWindow.close();
        }
        const message =
          error instanceof Error ? error.message : "Could not start GitHub App connection.";
        setNotice(message);
        setNoticeKind("error");
      })
      .finally(() => {
        setConnectBusy(false);
      });
  };

  const onUninstallGitHubApp = () => {
    if (!session) {
      setNotice("Sign in with GitHub to manage GitHub App access.");
      setNoticeKind("error");
      return;
    }

    setConnectBusy(true);
    setNotice(null);
    setNoticeKind(null);

    void uninstallGitHubAppForCurrentUser()
      .then(async () => {
        await refreshGitHubAuthStatus();
        setNotice("GitHub App disconnected.");
        setNoticeKind("notice");
      })
      .catch((error) => {
        setNotice(error instanceof Error ? error.message : "Could not uninstall GitHub App.");
        setNoticeKind("error");
      })
      .finally(() => {
        setConnectBusy(false);
      });
  };

  const githubAvatarUrl = profileData.githubAvatarUrl || null;
  const displayNameTooLong = displayName.length > 20;
  const hasChanges =
    displayName.trim() !== savedDisplayName.trim() || avatarController.hasAvatarChanges;

  const resetSettings = () => {
    setDisplayName(savedDisplayName);
    avatarController.resetAvatarDraft();
    setNotice(null);
    setNoticeKind(null);
  };

  const saveSettings = async () => {
    if (!session) {
      setNotice("Sign in with GitHub to update profile settings.");
      setNoticeKind("error");
      return;
    }
    if (displayNameTooLong) {
      setNotice("Display name must be 20 characters or fewer.");
      setNoticeKind("error");
      return;
    }

    const trimmedDisplayName = displayName.trim();
    const { avatarPath, avatarPaths, previousSavedAvatarPaths } =
      avatarController.getSavePayload();

    setSaveBusy(true);
    setNotice(null);
    setNoticeKind(null);

    try {
      await saveProfileSettings(
        {
          displayName: trimmedDisplayName
        },
        avatarPath,
        avatarPaths
      );

      setDisplayName(trimmedDisplayName);
      setSavedDisplayName(trimmedDisplayName);
      avatarController.applySavedSelection({
        avatarPath,
        avatarPaths
      });
      setNotice("Profile settings saved.");
      setNoticeKind("notice");

      const removedPaths = previousSavedAvatarPaths.filter(
        (path) => !avatarPaths.includes(path)
      );
      if (removedPaths.length > 0) {
        for (const removedPath of removedPaths) {
          if (!isUserOwnedProfileAvatarPath(removedPath, session.user.id)) {
            continue;
          }

          void removeProfileAvatar(removedPath).catch(() => undefined);
        }
      }
    } catch (error) {
      setNotice(getSaveErrorMessage(error));
      setNoticeKind("error");
    } finally {
      setSaveBusy(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !hasChanges ||
      saveBusy ||
      avatarController.avatarAddBusy ||
      avatarController.avatarRemoveBusy ||
      displayNameTooLong
    ) {
      return;
    }

    void saveSettings();
  };

  return {
    displayName,
    connectedGithub: profileData.connectedGithub,
    githubAvatarUrl,
    solidaryAvatarUrl: avatarController.solidaryAvatarUrl,
    avatarPills: avatarController.avatarPills,
    canRemoveAvatar: avatarController.canRemoveAvatar,
    canAddAvatar: avatarController.canAddAvatar,
    maxAvatarOptions: MAX_PROFILE_AVATAR_OPTIONS,
    displayNameTooLong,
    hasChanges,
    saveBusy,
    avatarAddBusy: avatarController.avatarAddBusy,
    avatarRemoveBusy: avatarController.avatarRemoveBusy,
    connectBusy,
    hasGitHubCredentials,
    hasSolidaryCredentials,
    githubAppConnected,
    githubAppConnectionState,
    githubAppConnectionMessage,
    githubAppRepositorySelection,
    githubAppSelectedRepositories,
    githubAppSelectedRepositoriesTruncated,
    githubAuthStatusLoading,
    notice,
    noticeKind,
    onSubmit,
    onReset: resetSettings,
    onDisplayNameChange: setDisplayName,
    onAvatarFileChange: avatarController.onAvatarFileChange,
    onSelectAvatar: avatarController.onSelectAvatar,
    onRemoveAvatar: avatarController.onRemoveAvatar,
    onConnectGitHubApp,
    onUninstallGitHubApp
  };
};
