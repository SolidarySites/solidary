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
  syncGithubAuthSnapshotFromSession
} from "../services/github-auth";
import { AuthContext } from "../context/AuthContext";

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const sessionUserIdRef = useRef<string>("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
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

  const signInWithGitHub = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.href,
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

  const connectGitHubApp = useCallback(async (returnTo?: string) => {
    await connectGitHubAppForCurrentUser({ returnTo, force: true });
  }, []);

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
