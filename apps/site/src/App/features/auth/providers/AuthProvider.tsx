import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { AuthContext } from "../context/AuthContext";

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setSessionResolved(true);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
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
        redirectTo: window.location.origin,
        scopes: "repo delete_repo workflow"
      }
    });

    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      sessionResolved,
      signInWithGitHub,
      signOut
    }),
    [session, sessionResolved, signInWithGitHub, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
