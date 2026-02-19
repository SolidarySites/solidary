import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import {
  getSessionDisplayName,
  getSessionGithubAvatarUrl,
  getSessionGithubEmail,
  getSessionGithubProfileUrl,
  getSessionGithubUsername,
  getSessionProfileAvatarPath,
  PROFILE_AVATAR_METADATA_KEY
} from "../../../features/auth/services/user-profile";

export type ProfileSettings = {
  displayName: string;
};

export type ConnectedGithubAccount = {
  username: string;
  profileUrl: string | null;
  email: string;
};

export type ProfileSessionData = {
  settings: ProfileSettings;
  connectedGithub: ConnectedGithubAccount;
  githubAvatarUrl: string;
  avatarPath: string;
};

export const getProfileSessionData = (
  session: Session | null
): ProfileSessionData => {
  const username = getSessionGithubUsername(session);

  return {
    settings: {
      displayName: getSessionDisplayName(session)
    },
    connectedGithub: {
      username,
      profileUrl: getSessionGithubProfileUrl(session),
      email: getSessionGithubEmail(session)
    },
    githubAvatarUrl: getSessionGithubAvatarUrl(session),
    avatarPath: getSessionProfileAvatarPath(session)
  };
};

export const saveProfileSettings = async (
  settings: ProfileSettings,
  avatarPath: string
): Promise<void> => {
  const payload: Record<string, string> = {
    name: settings.displayName.trim(),
    [PROFILE_AVATAR_METADATA_KEY]: avatarPath.trim()
  };

  const { error } = await supabase.auth.updateUser({ data: payload });
  if (error) {
    throw error;
  }
};
