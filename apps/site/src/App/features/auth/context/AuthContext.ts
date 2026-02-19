import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";

export type AuthContextValue = {
  session: Session | null;
  sessionResolved: boolean;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
