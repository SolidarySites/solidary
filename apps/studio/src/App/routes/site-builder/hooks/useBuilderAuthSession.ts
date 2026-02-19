import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import type { NoticeKind } from "../../../types/notice";

type UseBuilderAuthSessionParams = {
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
};

export const useBuilderAuthSession = ({
  setNotice,
  setNoticeKind
}: UseBuilderAuthSessionParams) => {
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

  const signInWithGitHub = async () => {
    setNotice(null);
    setNoticeKind(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
        scopes: "repo delete_repo workflow"
      }
    });

    if (error) {
      setNotice(error.message);
      setNoticeKind("error");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    session,
    sessionResolved,
    signInWithGitHub,
    signOut
  };
};
