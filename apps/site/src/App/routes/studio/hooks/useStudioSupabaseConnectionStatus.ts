import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseManagementStatusForCurrentUser } from "../../../features/supabase-management/services/supabase-management";

type UseStudioSupabaseConnectionStatusArgs = {
  session: Session | null;
};

export const useStudioSupabaseConnectionStatus = ({
  session
}: UseStudioSupabaseConnectionStatusArgs) => {
  const [connectedForSession, setConnectedForSession] = useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    void getSupabaseManagementStatusForCurrentUser()
      .then((status) => {
        if (!cancelled) {
          setConnectedForSession(status.connected);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConnectedForSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return Boolean(session) && connectedForSession;
};
