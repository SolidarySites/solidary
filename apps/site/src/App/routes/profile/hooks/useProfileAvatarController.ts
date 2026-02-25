import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { NoticeKind } from "../../../types/notice";
import { getPublicProfileAvatarUrl } from "../../../features/auth/services/user-profile";
import {
  isUserOwnedProfileAvatarPath,
  MAX_PROFILE_AVATAR_FILE_BYTES,
  removeProfileAvatar,
  uploadProfileAvatar
} from "../services/profile-avatar-upload";
import { saveProfileSettings, type ProfileSessionData } from "../services/profile-settings";

export const MAX_PROFILE_AVATAR_OPTIONS = 5;

export type ProfileAvatarPill = {
  key: string;
  path: string;
  imageUrl: string | null;
};

type UseProfileAvatarControllerParams = {
  session: Session | null;
  profileData: Pick<ProfileSessionData, "avatarPath" | "avatarPaths">;
  savedDisplayName: string;
  setNotice: (message: string | null) => void;
  setNoticeKind: (kind: NoticeKind) => void;
  getSaveErrorMessage: (error: unknown) => string;
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
    normalizedActiveAvatarPath ? [normalizedActiveAvatarPath, ...avatarPaths] : avatarPaths
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

const getPersistedActiveAvatarPath = (avatarPaths: string[], persistedAvatarPath: string) => {
  const normalizedPersistedAvatarPath = persistedAvatarPath.trim();
  if (normalizedPersistedAvatarPath && avatarPaths.includes(normalizedPersistedAvatarPath)) {
    return normalizedPersistedAvatarPath;
  }

  return "";
};

export const useProfileAvatarController = ({
  session,
  profileData,
  savedDisplayName,
  setNotice,
  setNoticeKind,
  getSaveErrorMessage
}: UseProfileAvatarControllerParams) => {
  const initialAvatarSelection = useMemo(
    () =>
      normalizeAvatarSelection({
        avatarPaths: profileData.avatarPaths,
        activeAvatarPath: profileData.avatarPath
      }),
    [profileData.avatarPath, profileData.avatarPaths]
  );

  const [avatarPath, setAvatarPath] = useState(initialAvatarSelection.activeAvatarPath);
  const [savedAvatarPath, setSavedAvatarPath] = useState(initialAvatarSelection.activeAvatarPath);
  const [avatarPaths, setAvatarPaths] = useState(initialAvatarSelection.avatarPaths);
  const [savedAvatarPaths, setSavedAvatarPaths] = useState(initialAvatarSelection.avatarPaths);
  const [avatarAddBusy, setAvatarAddBusy] = useState(false);
  const [avatarRemoveBusy, setAvatarRemoveBusy] = useState(false);

  useEffect(() => {
    const nextAvatarSelection = normalizeAvatarSelection({
      avatarPaths: profileData.avatarPaths,
      activeAvatarPath: profileData.avatarPath
    });

    setAvatarPath(nextAvatarSelection.activeAvatarPath);
    setSavedAvatarPath(nextAvatarSelection.activeAvatarPath);
    setAvatarPaths(nextAvatarSelection.avatarPaths);
    setSavedAvatarPaths(nextAvatarSelection.avatarPaths);
  }, [profileData.avatarPath, profileData.avatarPaths]);

  const solidaryAvatarUrl = useMemo(
    () => getPublicProfileAvatarUrl(avatarPath),
    [avatarPath]
  );

  const avatarPills = useMemo<ProfileAvatarPill[]>(() => {
    return avatarPaths
      .filter((path) => path !== avatarPath)
      .map((path) => ({
        key: path,
        path,
        imageUrl: getPublicProfileAvatarUrl(path)
      }));
  }, [avatarPath, avatarPaths]);

  const canAddAvatar =
    savedAvatarPaths.length < MAX_PROFILE_AVATAR_OPTIONS && !avatarAddBusy && !avatarRemoveBusy;
  const hasAvatarChanges =
    avatarPath !== savedAvatarPath || !areArraysEqual(avatarPaths, savedAvatarPaths);

  const resetAvatarDraft = () => {
    setAvatarPath(savedAvatarPath);
    setAvatarPaths(savedAvatarPaths);
  };

  const getSavePayload = () => {
    const normalizedAvatarPaths = normalizeAvatarPaths(avatarPaths);
    const normalizedAvatarPath = getPersistedActiveAvatarPath(normalizedAvatarPaths, avatarPath);

    return {
      avatarPath: normalizedAvatarPath,
      avatarPaths: normalizedAvatarPaths,
      previousSavedAvatarPaths: [...savedAvatarPaths]
    };
  };

  const applySavedSelection = ({
    avatarPath: nextAvatarPath,
    avatarPaths: nextAvatarPaths
  }: {
    avatarPath: string;
    avatarPaths: string[];
  }) => {
    setAvatarPath(nextAvatarPath);
    setSavedAvatarPath(nextAvatarPath);
    setAvatarPaths(nextAvatarPaths);
    setSavedAvatarPaths(nextAvatarPaths);
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

    if (!session) {
      setNotice("Sign in with GitHub to remove avatar images.");
      setNoticeKind("error");
      return;
    }

    const persistedDisplayName = savedDisplayName.trim();
    const nextPersistedAvatarPaths = normalizeAvatarPaths(
      savedAvatarPaths.filter((path) => path !== normalizedActivePath)
    );
    const nextPersistedAvatarPath = getPersistedActiveAvatarPath(
      nextPersistedAvatarPaths,
      savedAvatarPath === normalizedActivePath ? "" : savedAvatarPath
    );
    const nextDraftAvatarPaths = normalizeAvatarPaths(
      avatarPaths.filter((path) => path !== normalizedActivePath)
    );

    setAvatarRemoveBusy(true);
    setNotice(null);
    setNoticeKind(null);

    void (async () => {
      try {
        await saveProfileSettings(
          {
            displayName: persistedDisplayName
          },
          nextPersistedAvatarPath,
          nextPersistedAvatarPaths
        );

        setAvatarPath("");
        setAvatarPaths(nextDraftAvatarPaths);
        setSavedAvatarPath(nextPersistedAvatarPath);
        setSavedAvatarPaths(nextPersistedAvatarPaths);

        if (isUserOwnedProfileAvatarPath(normalizedActivePath, session.user.id)) {
          try {
            await removeProfileAvatar(normalizedActivePath);
          } catch {
            setNotice("Avatar removed from profile, but file cleanup failed.");
            setNoticeKind("error");
            return;
          }
        }

        setNotice("Avatar removed.");
        setNoticeKind("notice");
      } catch (error) {
        setNotice(getSaveErrorMessage(error));
        setNoticeKind("error");
      } finally {
        setAvatarRemoveBusy(false);
      }
    })();
  };

  return {
    solidaryAvatarUrl,
    avatarPills,
    canAddAvatar,
    canRemoveAvatar: Boolean(avatarPath),
    avatarAddBusy,
    avatarRemoveBusy,
    hasAvatarChanges,
    onAvatarFileChange,
    onSelectAvatar,
    onRemoveAvatar,
    resetAvatarDraft,
    getSavePayload,
    applySavedSelection
  };
};
