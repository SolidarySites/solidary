import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";

type SessionWithProviderToken = Session & {
  provider_token?: string | null;
};

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

export const getFreshGithubAuthSnapshot = async (): Promise<FreshGithubAuthSnapshot> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  return {
    session: data.session,
    providerToken: getSessionProviderToken(data.session),
    supabaseAccessToken: getSessionSupabaseAccessToken(data.session)
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
