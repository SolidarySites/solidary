import { useCallback, useMemo, useState, type ReactNode } from "react";
import { isSupabaseConfigured } from "../../../lib/supabase";
import SiteNoticePopout from "../components/SiteNoticePopout";
import { SiteNoticeContext } from "../context/SiteNoticeContext";
import type { SiteNoticePayload } from "../types";

type SiteNoticeProviderProps = {
  children: ReactNode;
};

type RouteNoticeRegistration = {
  sourceId: string;
  notice: SiteNoticePayload;
};

const SUPABASE_CONFIG_NOTICE: SiteNoticePayload = {
  signature: "system:supabase-config",
  message:
    "Add SUPABASE_URL or SOLIDARY_PROJECT_ID, plus SOLIDARY_PUBLISHABLE_KEY, to .env before signing in.",
  kind: "warning"
};

export function SiteNoticeProvider({ children }: SiteNoticeProviderProps) {
  const [routeNoticeRegistration, setRouteNoticeRegistration] =
    useState<RouteNoticeRegistration | null>(null);
  const [dismissedSignatures, setDismissedSignatures] = useState<Record<string, true>>({});

  const setRouteNotice = useCallback((sourceId: string, notice: SiteNoticePayload | null) => {
    setRouteNoticeRegistration((current) => {
      if (!notice) {
        return current?.sourceId === sourceId ? null : current;
      }

      return {
        sourceId,
        notice
      };
    });
  }, []);

  const dismissNotice = useCallback((signature: string) => {
    setDismissedSignatures((current) =>
      current[signature]
        ? current
        : {
            ...current,
            [signature]: true
          }
    );
  }, []);

  const contextValue = useMemo(
    () => ({
      setRouteNotice
    }),
    [setRouteNotice]
  );

  const activeRouteNotice = routeNoticeRegistration?.notice ?? null;
  const visibleRouteNotice =
    activeRouteNotice && !dismissedSignatures[activeRouteNotice.signature]
      ? activeRouteNotice
      : null;
  const visibleFallbackNotice =
    !isSupabaseConfigured() && !dismissedSignatures[SUPABASE_CONFIG_NOTICE.signature]
      ? SUPABASE_CONFIG_NOTICE
      : null;
  const activeNotice = visibleRouteNotice ?? visibleFallbackNotice;

  return (
    <SiteNoticeContext.Provider value={contextValue}>
      {children}
      <SiteNoticePopout notice={activeNotice} onDismiss={dismissNotice} />
    </SiteNoticeContext.Provider>
  );
}
