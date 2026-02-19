import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import type { NoticeKind } from "../../../types/notice";

type UseSiteCreateAuthSessionParams = {
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
};

export const useSiteCreateAuthSession = ({
  setNotice,
  setNoticeKind
}: UseSiteCreateAuthSessionParams) => {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
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
    signInWithGitHub,
    signOut
  };
};
