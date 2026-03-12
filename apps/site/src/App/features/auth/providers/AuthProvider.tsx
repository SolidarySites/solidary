import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import {
  clearCachedGithubProviderCredentialsForUser,
  connectGitHubAppForCurrentUser,
  GITHUB_OAUTH_SCOPES,
  syncGithubProviderTokenToServer,
  syncGithubAuthSnapshotFromSession,
  type ConnectGitHubAppRequest,
  type ConnectGitHubAppResult
} from "../services/github-auth";
import { AuthContext } from "../context/AuthContext";

type AuthProviderProps = {
  children: ReactNode;
};

const OAUTH_ERROR_KEYS = ["error", "error_code", "error_description"] as const;
const OAUTH_QUERY_KEYS_TO_CLEAR = [...OAUTH_ERROR_KEYS, "code", "state"] as const;
const OAUTH_HASH_KEYS_TO_CLEAR = [
  ...OAUTH_ERROR_KEYS,
  "access_token",
  "expires_at",
  "expires_in",
  "provider_token",
  "provider_refresh_token",
  "refresh_token",
  "state",
  "token_type",
  "type"
] as const;

const parseOAuthHashParams = (hash: string): URLSearchParams | null => {
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!rawHash || (!rawHash.includes("=") && !rawHash.includes("&"))) {
    return null;
  }
  return new URLSearchParams(rawHash);
};

const getOAuthErrorFromParams = ({
  query,
  hash
}: {
  query: URLSearchParams;
  hash: URLSearchParams | null;
}): string => {
  const queryDescription = query.get("error_description")?.trim();
  if (queryDescription) return queryDescription;

  const queryError = query.get("error")?.trim();
  if (queryError) return queryError;

  const hashDescription = hash?.get("error_description")?.trim();
  if (hashDescription) return hashDescription;

  return hash?.get("error")?.trim() ?? "";
};

const scrubOAuthParamsFromCurrentUrl = ({
  session,
  sessionError
}: {
  session: Session | null;
  sessionError?: string | null;
}) => {
  if (typeof window === "undefined") return;

  const currentUrl = new URL(window.location.href);
  const queryParams = currentUrl.searchParams;
  const hashParams = parseOAuthHashParams(currentUrl.hash);
  const oauthError = getOAuthErrorFromParams({
    query: queryParams,
    hash: hashParams
  });

  if (sessionError?.trim() || oauthError) {
    console.error("[auth]", "OAuth callback session recovery failed", {
      sessionError: sessionError?.trim() || null,
      oauthError: oauthError || null,
      pathname: currentUrl.pathname
    });
  }

  let mutated = false;
  for (const key of OAUTH_QUERY_KEYS_TO_CLEAR) {
    if (queryParams.has(key)) {
      queryParams.delete(key);
      mutated = true;
    }
  }

  if (hashParams) {
    for (const key of OAUTH_HASH_KEYS_TO_CLEAR) {
      if (hashParams.has(key)) {
        hashParams.delete(key);
        mutated = true;
      }
    }
  }

  if (!mutated) return;

  const nextHash = hashParams ? hashParams.toString() : "";
  const nextPath =
    `${currentUrl.pathname}${currentUrl.search}${nextHash ? `#${nextHash}` : ""}` || "/";
  window.history.replaceState({}, "", nextPath);

  if (sessionError?.trim() || oauthError) {
    window.alert(sessionError?.trim() || oauthError);
  } else if (!session) {
    console.warn("[auth]", "OAuth callback parameters cleared without an active session.", {
      pathname: currentUrl.pathname
    });
  }
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const sessionUserIdRef = useRef<string>("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (mounted) {
        scrubOAuthParamsFromCurrentUrl({
          session: data.session,
          sessionError: error?.message
        });
        syncGithubAuthSnapshotFromSession(data.session);
        void syncGithubProviderTokenToServer(data.session, {
          trigger: "initial_get_session"
        });
        sessionUserIdRef.current = data.session?.user?.id?.trim() ?? "";
        setSession(data.session);
        setSessionResolved(true);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        scrubOAuthParamsFromCurrentUrl({
          session: nextSession
        });
        const previousUserId = sessionUserIdRef.current;
        if (event === "SIGNED_OUT" && previousUserId) {
          clearCachedGithubProviderCredentialsForUser(previousUserId);
        }

        syncGithubAuthSnapshotFromSession(nextSession);
        void syncGithubProviderTokenToServer(nextSession, {
          trigger: `auth_event:${event}`
        });
        const nextUserId = nextSession?.user?.id?.trim() ?? "";
        sessionUserIdRef.current = nextUserId;
        setSession(nextSession);
        setSessionResolved(true);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signInWithGitHub = useCallback(async (returnToPath?: string) => {
    const defaultReturnToPath =
      typeof window === "undefined"
        ? "/"
        : window.location.pathname === "/*"
          ? "/"
          : window.location.pathname;
    const normalizedReturnToPath =
      typeof returnToPath === "string" && returnToPath.trim().startsWith("/")
        ? returnToPath.trim()
        : defaultReturnToPath;
    const redirectTo =
      typeof window === "undefined"
        ? undefined
        : `${window.location.origin}${normalizedReturnToPath}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo,
        scopes: GITHUB_OAUTH_SCOPES
      }
    });

    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const userId = sessionUserIdRef.current;
    if (userId) {
      clearCachedGithubProviderCredentialsForUser(userId);
    }
    syncGithubAuthSnapshotFromSession(null);
    await supabase.auth.signOut();
  }, []);

  const connectGitHubApp = useCallback(
    async (request: ConnectGitHubAppRequest = {}): Promise<ConnectGitHubAppResult> => {
      return connectGitHubAppForCurrentUser({
        returnTo: request.returnTo,
        force: true,
        openMode: request.openMode,
        navigationWindow: request.navigationWindow
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      session,
      sessionResolved,
      signInWithGitHub,
      connectGitHubApp,
      signOut
    }),
    [connectGitHubApp, session, sessionResolved, signInWithGitHub, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
