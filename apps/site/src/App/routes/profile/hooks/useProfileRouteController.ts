import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import {
  getGitHubAuthStatusForCurrentUser,
  type GitHubAuthMode
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

const getSaveErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Could not save profile settings.";
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
  const [githubAuthMode, setGithubAuthMode] = useState<GitHubAuthMode>("solidary");
  const [githubAppConnected, setGithubAppConnected] = useState(false);
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
      setGithubAuthMode("solidary");
      setGithubAppConnected(false);
      setGithubAuthStatusLoading(false);
      return;
    }

    setGithubAuthStatusLoading(true);
    try {
      const status = await getGitHubAuthStatusForCurrentUser();
      setGithubAuthMode(status.authMode);
      setGithubAppConnected(status.githubAppConnected);
    } catch {
      // Keep previous status when the request fails.
    } finally {
      setGithubAuthStatusLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refreshGitHubAuthStatus();
  }, [refreshGitHubAuthStatus]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const githubAppStatus = params.get("github_app")?.trim() ?? "";
    const githubAppMessage = params.get("github_app_message")?.trim() ?? "";
    if (!githubAppStatus) return;

    params.delete("github_app");
    params.delete("github_app_message");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, {
      replace: true
    });

    if (githubAppStatus === "connected") {
      void refreshGitHubAuthStatus();
      setNotice("GitHub App connected.");
      setNoticeKind("notice");
      return;
    }

    setNotice(githubAppMessage || "Could not connect GitHub App.");
    setNoticeKind("error");
  }, [location.hash, location.pathname, location.search, navigate, refreshGitHubAuthStatus]);

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
    void connectGitHubApp(returnTo)
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Could not start GitHub App connection.";
        setNotice(message);
        setNoticeKind("error");
      })
      .finally(() => {
        setConnectBusy(false);
      });
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
    githubAuthMode,
    githubAppConnected,
    githubAuthStatusLoading,
    notice,
    noticeKind,
    onSubmit,
    onReset: resetSettings,
    onDisplayNameChange: setDisplayName,
    onAvatarFileChange: avatarController.onAvatarFileChange,
    onSelectAvatar: avatarController.onSelectAvatar,
    onRemoveAvatar: avatarController.onRemoveAvatar,
    onConnectGitHubApp
  };
};
