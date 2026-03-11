import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseManagementStatusForCurrentUser } from "../../../features/supabase-management/services/supabase-management";

type UseStudioSupabaseConnectionStatusArgs = {
  session: Session | null;
};

export const useStudioSupabaseConnectionStatus = ({
  session
}: UseStudioSupabaseConnectionStatusArgs) => {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!session) {
      setConnected(false);
      return;
    }

    let cancelled = false;

    void getSupabaseManagementStatusForCurrentUser()
      .then((status) => {
        if (!cancelled) {
          setConnected(status.connected);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConnected(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return connected;
};
