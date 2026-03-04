import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  ConnectGitHubAppRequest,
  ConnectGitHubAppResult
} from "../services/github-auth";

export type AuthContextValue = {
  session: Session | null;
  sessionResolved: boolean;
  signInWithGitHub: () => Promise<void>;
  connectGitHubApp: (request?: ConnectGitHubAppRequest) => Promise<ConnectGitHubAppResult>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
