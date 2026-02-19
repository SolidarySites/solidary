import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

type RequireAuthProps = {
  children: ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const { session, sessionResolved } = useAuth();

  if (!sessionResolved) {
    return null;
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
