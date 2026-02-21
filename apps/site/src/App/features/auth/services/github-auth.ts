import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";

type SessionWithProviderToken = Session & {
  provider_token?: string | null;
};

const GITHUB_PROVIDER_TOKEN_STORAGE_PREFIX = "solidary:github-provider-token:";

export type FreshGithubAuthSnapshot = {
  session: Session | null;
  providerToken: string;
  supabaseAccessToken: string;
};

export type FreshGithubAuth = {
  session: Session;
  providerToken: string;
  supabaseAccessToken: string;
};

const getSessionProviderToken = (session: Session | null): string => {
  if (!session) {
    return "";
  }

  return ((session as SessionWithProviderToken).provider_token ?? "").trim();
};

const getSessionSupabaseAccessToken = (session: Session | null): string => {
  return session?.access_token?.trim() ?? "";
};

const getGithubProviderTokenStorageKey = (userId: string) =>
  `${GITHUB_PROVIDER_TOKEN_STORAGE_PREFIX}${userId}`;

const getLocalStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const writeStoredProviderToken = (userId: string, providerToken: string) => {
  const storage = getLocalStorage();
  if (!storage) return;
  const key = getGithubProviderTokenStorageKey(userId);

  try {
    if (providerToken) {
      storage.setItem(key, providerToken);
      return;
    }
    storage.removeItem(key);
  } catch {
    // Ignore storage write failures (private mode/quota/permissions).
  }
};

const readStoredProviderToken = (userId: string): string => {
  const storage = getLocalStorage();
  if (!storage) return "";

  try {
    return storage.getItem(getGithubProviderTokenStorageKey(userId))?.trim() ?? "";
  } catch {
    return "";
  }
};

const resolveFreshSessionWithProviderToken = async (session: Session | null) => {
  let resolvedSession = session;
  let providerToken = getSessionProviderToken(resolvedSession);

  if (!providerToken && resolvedSession) {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error) {
        resolvedSession = data.session;
        providerToken = getSessionProviderToken(data.session);
      }
    } catch {
      // Keep the existing session when refresh fails.
    }
  }

  const userId = resolvedSession?.user?.id?.trim() ?? "";
  if (userId) {
    if (providerToken) {
      writeStoredProviderToken(userId, providerToken);
    } else {
      providerToken = readStoredProviderToken(userId);
    }
  }

  return {
    session: resolvedSession,
    providerToken
  };
};

export const getFreshGithubAuthSnapshot = async (): Promise<FreshGithubAuthSnapshot> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  const resolved = await resolveFreshSessionWithProviderToken(data.session);

  return {
    session: resolved.session,
    providerToken: resolved.providerToken,
    supabaseAccessToken: getSessionSupabaseAccessToken(resolved.session)
  };
};

export const requireFreshGithubAuth = async (): Promise<FreshGithubAuth> => {
  const { session, providerToken, supabaseAccessToken } = await getFreshGithubAuthSnapshot();

  if (!session) {
    throw new Error("Sign in with GitHub to continue.");
  }

  if (!providerToken) {
    throw new Error("GitHub token missing. Please sign in again.");
  }

  if (!supabaseAccessToken) {
    throw new Error("Supabase session missing. Please sign in again.");
  }

  return {
    session,
    providerToken,
    supabaseAccessToken
  };
};
