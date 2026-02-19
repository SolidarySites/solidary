import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { getPublicProfileAvatarUrl } from "../../../features/auth/services/user-profile";
import type { NoticeKind } from "../../../types/notice";
import {
  isUserOwnedProfileAvatarPath,
  MAX_PROFILE_AVATAR_FILE_BYTES,
  removeProfileAvatar,
  uploadProfileAvatar
} from "../services/profile-avatar-upload";
import {
  getProfileSessionData,
  saveProfileSettings
} from "../services/profile-settings";

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

export const useProfileRouteController = () => {
  const { session } = useAuth();

  const profileData = useMemo(
    () => getProfileSessionData(session),
    [session]
  );

  const [displayName, setDisplayName] = useState(
    profileData.settings.displayName
  );
  const [savedDisplayName, setSavedDisplayName] = useState(
    profileData.settings.displayName
  );
  const [avatarPath, setAvatarPath] = useState(profileData.avatarPath);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(
    null
  );
  const [selectedAvatarPreviewUrl, setSelectedAvatarPreviewUrl] = useState<
    string | null
  >(null);
  const [removeAvatarRequested, setRemoveAvatarRequested] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    setDisplayName(profileData.settings.displayName);
    setSavedDisplayName(profileData.settings.displayName);
    setAvatarPath(profileData.avatarPath);
    setSelectedAvatarFile(null);
    setRemoveAvatarRequested(false);
    setNotice(null);
    setNoticeKind(null);
  }, [profileData.avatarPath, profileData.settings.displayName]);

  useEffect(() => {
    if (!selectedAvatarFile) {
      setSelectedAvatarPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedAvatarFile);
    setSelectedAvatarPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedAvatarFile]);

  const savedAvatarPublicUrl = useMemo(
    () => getPublicProfileAvatarUrl(avatarPath),
    [avatarPath]
  );
  const solidaryAvatarUrl = removeAvatarRequested
    ? null
    : selectedAvatarPreviewUrl || savedAvatarPublicUrl || null;
  const githubAvatarUrl = profileData.githubAvatarUrl || null;
  const displayNameTooLong = displayName.length > 20;
  const hasChanges =
    displayName.trim() !== savedDisplayName.trim() ||
    Boolean(selectedAvatarFile) ||
    (removeAvatarRequested && Boolean(avatarPath));

  const resetSettings = () => {
    setDisplayName(savedDisplayName);
    setSelectedAvatarFile(null);
    setRemoveAvatarRequested(false);
    setNotice(null);
    setNoticeKind(null);
  };

  const onAvatarFileChange = (file: File | null) => {
    if (!file) {
      setSelectedAvatarFile(null);
      return;
    }

    const validationError = getFileValidationError(file);
    if (validationError) {
      setNotice(validationError);
      setNoticeKind("error");
      return;
    }

    setSelectedAvatarFile(file);
    setRemoveAvatarRequested(false);
    setNotice(null);
    setNoticeKind(null);
  };

  const onRemoveAvatar = () => {
    if (!solidaryAvatarUrl) {
      return;
    }

    setSelectedAvatarFile(null);
    setRemoveAvatarRequested(true);
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
    const previousAvatarPath = avatarPath;
    let uploadedAvatarPath: string | null = null;
    let nextAvatarPath = removeAvatarRequested ? "" : avatarPath;

    setSaveBusy(true);
    setNotice(null);
    setNoticeKind(null);

    try {
      if (selectedAvatarFile) {
        const upload = await uploadProfileAvatar({
          file: selectedAvatarFile,
          userId: session.user.id
        });
        uploadedAvatarPath = upload.storagePath;
        nextAvatarPath = upload.storagePath;
      }

      await saveProfileSettings(
        {
          displayName: trimmedDisplayName
        },
        nextAvatarPath
      );

      setDisplayName(trimmedDisplayName);
      setSavedDisplayName(trimmedDisplayName);
      setAvatarPath(nextAvatarPath);
      setSelectedAvatarFile(null);
      setRemoveAvatarRequested(false);
      setNotice("Profile settings saved.");
      setNoticeKind("notice");

      if (
        previousAvatarPath &&
        previousAvatarPath !== nextAvatarPath &&
        isUserOwnedProfileAvatarPath(previousAvatarPath, session.user.id)
      ) {
        void removeProfileAvatar(previousAvatarPath).catch(() => undefined);
      }
    } catch (error) {
      if (uploadedAvatarPath) {
        void removeProfileAvatar(uploadedAvatarPath).catch(() => undefined);
      }

      setNotice(getSaveErrorMessage(error));
      setNoticeKind("error");
    } finally {
      setSaveBusy(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanges || saveBusy || displayNameTooLong) {
      return;
    }

    void saveSettings();
  };

  return {
    displayName,
    connectedGithub: profileData.connectedGithub,
    githubAvatarUrl,
    solidaryAvatarUrl,
    canRemoveAvatar: Boolean(solidaryAvatarUrl),
    displayNameTooLong,
    hasChanges,
    saveBusy,
    notice,
    noticeKind,
    onSubmit,
    onReset: resetSettings,
    onDisplayNameChange: setDisplayName,
    onAvatarFileChange,
    onRemoveAvatar
  };
};
