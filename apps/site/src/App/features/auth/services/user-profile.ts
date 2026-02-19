import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";

export const PROFILE_AVATAR_BUCKET = "profile";
export const PROFILE_AVATAR_METADATA_KEY = "avatar_path";

type UserMetadata = Record<string, unknown>;

const getUserMetadata = (session: Session | null): UserMetadata => {
  return (session?.user.user_metadata ?? {}) as UserMetadata;
};

const getTrimmedString = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const coalesceTrimmedString = (...candidates: Array<unknown>): string => {
  for (const candidate of candidates) {
    const trimmed = getTrimmedString(candidate);
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
};

export const getSessionDisplayName = (session: Session | null): string => {
  const metadata = getUserMetadata(session);
  const value = coalesceTrimmedString(
    metadata.name,
    metadata.user_name,
    metadata.preferred_username,
    session?.user.email
  );

  return value || "Guest";
};

export const getSessionGithubUsername = (session: Session | null): string => {
  const metadata = getUserMetadata(session);
  return coalesceTrimmedString(metadata.user_name, metadata.preferred_username);
};

export const getSessionGithubEmail = (session: Session | null): string => {
  const metadata = getUserMetadata(session);
  return coalesceTrimmedString(metadata.email, session?.user.email);
};

export const getSessionGithubProfileUrl = (
  session: Session | null
): string | null => {
  const username = getSessionGithubUsername(session);
  if (!username) {
    return null;
  }

  return `https://github.com/${username}`;
};

export const getSessionGithubAvatarUrl = (session: Session | null): string => {
  const metadata = getUserMetadata(session);
  return getTrimmedString(metadata.avatar_url);
};

export const getSessionProfileAvatarPath = (session: Session | null): string => {
  const metadata = getUserMetadata(session);
  return getTrimmedString(metadata[PROFILE_AVATAR_METADATA_KEY]);
};

export const getPublicProfileAvatarUrl = (
  avatarPath: string
): string | null => {
  const normalizedPath = avatarPath.trim();
  if (!normalizedPath) {
    return null;
  }

  const { data } = supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .getPublicUrl(normalizedPath);

  const publicUrl = data.publicUrl?.trim();
  return publicUrl || null;
};

export const getSessionAvatarUrl = (session: Session | null): string | null => {
  const avatarPath = getSessionProfileAvatarPath(session);
  if (avatarPath) {
    const publicUrl = getPublicProfileAvatarUrl(avatarPath);
    if (publicUrl) {
      return publicUrl;
    }
  }

  const githubAvatarUrl = getSessionGithubAvatarUrl(session);
  return githubAvatarUrl || null;
};
