import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";

type SessionWithProviderToken = Session & {
  provider_token?: string | null;
};

const GITHUB_PROVIDER_TOKEN_STORAGE_PREFIX = "solidary:github-provider-token:";
const GITHUB_REAUTH_LAST_ATTEMPT_STORAGE_KEY = "solidary:github-reauth-last-at";
const GITHUB_REAUTH_COOLDOWN_MS = 2 * 60 * 1000;
export const GITHUB_OAUTH_SCOPES = "repo delete_repo workflow";

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

const getSessionUserId = (session: Session | null): string => {
  return session?.user?.id?.trim() ?? "";
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

const removeStoredProviderToken = (userId: string) => {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(getGithubProviderTokenStorageKey(userId));
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

const readLastGithubReauthAttemptAt = (): number => {
  const storage = getLocalStorage();
  if (!storage) return 0;

  try {
    const rawValue = storage.getItem(GITHUB_REAUTH_LAST_ATTEMPT_STORAGE_KEY);
    if (!rawValue) return 0;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

const writeLastGithubReauthAttemptAt = (timestampMs: number) => {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(GITHUB_REAUTH_LAST_ATTEMPT_STORAGE_KEY, String(timestampMs));
  } catch {
    // Ignore storage write failures (private mode/quota/permissions).
  }
};

const clearLastGithubReauthAttemptAt = () => {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(GITHUB_REAUTH_LAST_ATTEMPT_STORAGE_KEY);
  } catch {
    // Ignore storage write failures (private mode/quota/permissions).
  }
};

const shouldThrottleGithubReauth = (nowMs: number): boolean => {
  const lastAttemptAt = readLastGithubReauthAttemptAt();
  return nowMs - lastAttemptAt < GITHUB_REAUTH_COOLDOWN_MS;
};

export const cacheGithubProviderTokenFromSession = (session: Session | null) => {
  const userId = getSessionUserId(session);
  if (!userId) return;

  const providerToken = getSessionProviderToken(session);
  if (providerToken) {
    writeStoredProviderToken(userId, providerToken);
  }
};

export const clearCachedGithubProviderTokenForUser = (userId: string) => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  removeStoredProviderToken(normalizedUserId);
};

export const reconnectGitHubOAuth = async ({
  redirectTo
}: {
  redirectTo?: string;
} = {}): Promise<boolean> => {
  if (typeof window === "undefined") return false;

  const nowMs = Date.now();
  if (shouldThrottleGithubReauth(nowMs)) return false;
  writeLastGithubReauthAttemptAt(nowMs);

  const targetRedirectTo = redirectTo?.trim() || window.location.href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: targetRedirectTo,
      scopes: GITHUB_OAUTH_SCOPES
    }
  });

  if (error) {
    clearLastGithubReauthAttemptAt();
    throw new Error(error.message);
  }

  return true;
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

  const userId = getSessionUserId(resolvedSession);
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
    await reconnectGitHubOAuth().catch(() => false);
    throw new Error("GitHub token missing. Reconnect with GitHub to continue.");
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
