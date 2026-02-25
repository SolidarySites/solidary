import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { getPublicProfileAvatarUrl } from "../../../features/auth/services/user-profile";
import type { NoticeKind } from "../../../types/notice";
import {
  isUserOwnedProfileAvatarPath,
  MAX_PROFILE_AVATAR_FILE_BYTES,
  removeProfileAvatar,
  uploadProfileAvatar
} from "../services/profile-avatar-upload";
import { getProfileSessionData, saveProfileSettings } from "../services/profile-settings";

const MAX_PROFILE_AVATAR_OPTIONS = 5;

type AvatarPill = {
  key: string;
  path: string;
  imageUrl: string | null;
};

const getSaveErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Could not save profile settings.";
};

const getFileValidationError = (file: File): string | null => {
  if (!file.type.startsWith("image/")) {
    return "Select an image file.";
  }

  if (file.size > MAX_PROFILE_AVATAR_FILE_BYTES) {
    return "Avatar image is too large. Max upload size is 1 MB.";
  }

  return null;
};

const normalizeAvatarPaths = (paths: string[]) => {
  const seen = new Set<string>();
  return paths
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    })
    .slice(0, MAX_PROFILE_AVATAR_OPTIONS);
};

const normalizeAvatarSelection = ({
  avatarPaths,
  activeAvatarPath
}: {
  avatarPaths: string[];
  activeAvatarPath: string;
}) => {
  const normalizedActiveAvatarPath = activeAvatarPath.trim();
  const nextAvatarPaths = normalizeAvatarPaths(
    normalizedActiveAvatarPath
      ? [normalizedActiveAvatarPath, ...avatarPaths]
      : avatarPaths
  );

  const nextActiveAvatarPath =
    normalizedActiveAvatarPath && nextAvatarPaths.includes(normalizedActiveAvatarPath)
      ? normalizedActiveAvatarPath
      : "";

  return {
    avatarPaths: nextAvatarPaths,
    activeAvatarPath: nextActiveAvatarPath
  };
};

const areArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

const getPersistedActiveAvatarPath = (
  avatarPaths: string[],
  persistedAvatarPath: string
) => {
  const normalizedPersistedAvatarPath = persistedAvatarPath.trim();
  if (
    normalizedPersistedAvatarPath &&
    avatarPaths.includes(normalizedPersistedAvatarPath)
  ) {
    return normalizedPersistedAvatarPath;
  }

  return "";
};

export const useProfileRouteController = () => {
  const { session, connectGitHubApp } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const profileData = useMemo(() => getProfileSessionData(session), [session]);
  const initialAvatarSelection = useMemo(
    () =>
      normalizeAvatarSelection({
        avatarPaths: profileData.avatarPaths,
        activeAvatarPath: profileData.avatarPath
      }),
    [profileData.avatarPath, profileData.avatarPaths]
  );

  const [displayName, setDisplayName] = useState(profileData.settings.displayName);
  const [savedDisplayName, setSavedDisplayName] = useState(
    profileData.settings.displayName
  );
  const [avatarPath, setAvatarPath] = useState(initialAvatarSelection.activeAvatarPath);
  const [savedAvatarPath, setSavedAvatarPath] = useState(
    initialAvatarSelection.activeAvatarPath
  );
  const [avatarPaths, setAvatarPaths] = useState(initialAvatarSelection.avatarPaths);
  const [savedAvatarPaths, setSavedAvatarPaths] = useState(
    initialAvatarSelection.avatarPaths
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [avatarAddBusy, setAvatarAddBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);

  useEffect(() => {
    const nextAvatarSelection = normalizeAvatarSelection({
      avatarPaths: profileData.avatarPaths,
      activeAvatarPath: profileData.avatarPath
    });

    setDisplayName(profileData.settings.displayName);
    setSavedDisplayName(profileData.settings.displayName);
    setAvatarPath(nextAvatarSelection.activeAvatarPath);
    setSavedAvatarPath(nextAvatarSelection.activeAvatarPath);
    setAvatarPaths(nextAvatarSelection.avatarPaths);
    setSavedAvatarPaths(nextAvatarSelection.avatarPaths);
    setNotice(null);
    setNoticeKind(null);
  }, [profileData.avatarPath, profileData.avatarPaths, profileData.settings.displayName]);

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
      setNotice("GitHub App connected.");
      setNoticeKind("notice");
      return;
    }

    setNotice(githubAppMessage || "Could not connect GitHub App.");
    setNoticeKind("error");
  }, [location.hash, location.pathname, location.search, navigate]);

  const solidaryAvatarUrl = useMemo(
    () => getPublicProfileAvatarUrl(avatarPath),
    [avatarPath]
  );
  const githubAvatarUrl = profileData.githubAvatarUrl || null;

  const avatarPills = useMemo<AvatarPill[]>(() => {
    return avatarPaths
      .filter((path) => path !== avatarPath)
      .map((path) => ({
        key: path,
        path,
        imageUrl: getPublicProfileAvatarUrl(path)
      }));
  }, [avatarPath, avatarPaths]);

  const displayNameTooLong = displayName.length > 20;
  const canAddAvatar =
    savedAvatarPaths.length < MAX_PROFILE_AVATAR_OPTIONS && !avatarAddBusy;
  const hasChanges =
    displayName.trim() !== savedDisplayName.trim() ||
    avatarPath !== savedAvatarPath ||
    !areArraysEqual(avatarPaths, savedAvatarPaths);

  const resetSettings = () => {
    setDisplayName(savedDisplayName);
    setAvatarPath(savedAvatarPath);
    setAvatarPaths(savedAvatarPaths);
    setNotice(null);
    setNoticeKind(null);
  };

  const onAvatarFileChange = (file: File | null) => {
    if (!file) {
      return;
    }

    if (!session) {
      setNotice("Sign in with GitHub to add avatar images.");
      setNoticeKind("error");
      return;
    }

    const validationError = getFileValidationError(file);
    if (validationError) {
      setNotice(validationError);
      setNoticeKind("error");
      return;
    }

    if (savedAvatarPaths.length >= MAX_PROFILE_AVATAR_OPTIONS) {
      setNotice(
        `You can save up to ${MAX_PROFILE_AVATAR_OPTIONS} avatar images. Remove one to add another.`
      );
      setNoticeKind("error");
      return;
    }

    const userId = session.user.id;
    const persistedDisplayName = savedDisplayName.trim();
    const persistedActiveAvatarPath = savedAvatarPath;
    setAvatarAddBusy(true);
    setNotice(null);
    setNoticeKind(null);

    void (async () => {
      let uploadedAvatarPath: string | null = null;
      try {
        const upload = await uploadProfileAvatar({
          file,
          userId
        });
        uploadedAvatarPath = upload.storagePath;

        const normalizedPersistedAvatarPaths = normalizeAvatarPaths([
          ...savedAvatarPaths,
          upload.storagePath
        ]);
        const normalizedPersistedActiveAvatarPath = getPersistedActiveAvatarPath(
          normalizedPersistedAvatarPaths,
          persistedActiveAvatarPath
        );
        const normalizedDraftAvatarPaths = normalizeAvatarPaths([
          ...avatarPaths,
          upload.storagePath
        ]);
        const normalizedDraftActiveAvatarPath = getPersistedActiveAvatarPath(
          normalizedDraftAvatarPaths,
          avatarPath
        );

        await saveProfileSettings(
          {
            displayName: persistedDisplayName
          },
          normalizedPersistedActiveAvatarPath,
          normalizedPersistedAvatarPaths
        );

        setAvatarPaths(normalizedDraftAvatarPaths);
        setAvatarPath(normalizedDraftActiveAvatarPath);
        setSavedAvatarPaths(normalizedPersistedAvatarPaths);
        setSavedAvatarPath(normalizedPersistedActiveAvatarPath);
        setNotice("Avatar added.");
        setNoticeKind("notice");
      } catch (error) {
        if (uploadedAvatarPath) {
          void removeProfileAvatar(uploadedAvatarPath).catch(() => undefined);
        }

        setNotice(getSaveErrorMessage(error));
        setNoticeKind("error");
      } finally {
        setAvatarAddBusy(false);
      }
    })();
  };

  const onSelectAvatar = (path: string) => {
    const normalizedPath = path.trim();
    if (!normalizedPath || !avatarPaths.includes(normalizedPath)) {
      return;
    }

    setAvatarPath(normalizedPath);
    setNotice(null);
    setNoticeKind(null);
  };

  const onRemoveAvatar = () => {
    const normalizedActivePath = avatarPath.trim();
    if (!normalizedActivePath) {
      return;
    }

    setAvatarPath("");
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
    const previousAvatarPaths = [...savedAvatarPaths];
    const normalizedAvatarPaths = normalizeAvatarPaths(avatarPaths);
    const normalizedAvatarPath = getPersistedActiveAvatarPath(
      normalizedAvatarPaths,
      avatarPath
    );

    setSaveBusy(true);
    setNotice(null);
    setNoticeKind(null);

    try {
      await saveProfileSettings(
        {
          displayName: trimmedDisplayName
        },
        normalizedAvatarPath,
        normalizedAvatarPaths
      );

      setDisplayName(trimmedDisplayName);
      setSavedDisplayName(trimmedDisplayName);
      setAvatarPath(normalizedAvatarPath);
      setSavedAvatarPath(normalizedAvatarPath);
      setAvatarPaths(normalizedAvatarPaths);
      setSavedAvatarPaths(normalizedAvatarPaths);
      setNotice("Profile settings saved.");
      setNoticeKind("notice");

      const removedPaths = previousAvatarPaths.filter(
        (path) => !normalizedAvatarPaths.includes(path)
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
    if (!hasChanges || saveBusy || avatarAddBusy || displayNameTooLong) {
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
          error instanceof Error
            ? error.message
            : "Could not start GitHub App connection.";
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
    solidaryAvatarUrl,
    avatarPills,
    canRemoveAvatar: Boolean(avatarPath),
    canAddAvatar,
    maxAvatarOptions: MAX_PROFILE_AVATAR_OPTIONS,
    displayNameTooLong,
    hasChanges,
    saveBusy,
    avatarAddBusy,
    connectBusy,
    notice,
    noticeKind,
    onSubmit,
    onReset: resetSettings,
    onDisplayNameChange: setDisplayName,
    onAvatarFileChange,
    onSelectAvatar,
    onRemoveAvatar,
    onConnectGitHubApp
  };
};
