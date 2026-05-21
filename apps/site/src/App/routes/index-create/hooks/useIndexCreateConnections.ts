import { useCallback, useEffect, useState } from "react";
import type { NavigateFunction, Location } from "react-router-dom";
import {
  connectGitHubAppForCurrentUser,
  getGitHubAuthStatusForCurrentUser,
  GITHUB_APP_CONNECT_RESULT_MESSAGE_TYPE,
  parseGitHubAppConnectResultFromSearch,
  parseGitHubAppConnectResultMessagePayload
} from "../../../features/auth/services/github-auth";
import {
  connectSupabaseManagementForCurrentUser,
  getSupabaseManagementStatusForCurrentUser,
  parseSupabaseManagementConnectResultFromSearch,
  parseSupabaseManagementConnectResultMessagePayload,
  SUPABASE_MANAGEMENT_CONNECT_RESULT_MESSAGE_TYPE,
  type SupabaseManagementConnectionStatus
} from "../../../features/supabase-management/services/supabase-management";
import type { NoticeKind } from "../../../types/notice";
import {
  GITHUB_CONNECT_POPUP_NAME,
  openCenteredPopup,
  SUPABASE_CONNECT_POPUP_NAME
} from "./indexCreateShared";

type SetRouteNotice = (message: string | null, kind: NoticeKind) => void;

export const useIndexCreateConnections = ({
  location,
  navigate,
  setRouteNotice
}: {
  location: Location;
  navigate: NavigateFunction;
  setRouteNotice: SetRouteNotice;
}) => {
  const [statusLoading, setStatusLoading] = useState(true);
  const [githubConnectBusy, setGitHubConnectBusy] = useState(false);
  const [supabaseConnectBusy, setSupabaseConnectBusy] = useState(false);
  const [githubConnected, setGitHubConnected] = useState(false);
  const [githubConnectionMessage, setGitHubConnectionMessage] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseManagementConnectionStatus | null>(
    null
  );

  const refreshStatuses = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [githubStatus, nextSupabaseStatus] = await Promise.all([
        getGitHubAuthStatusForCurrentUser(),
        getSupabaseManagementStatusForCurrentUser()
      ]);
      setGitHubConnected(Boolean(githubStatus.githubAppConnected));
      setGitHubConnectionMessage(githubStatus.githubAppConnectionMessage);
      setSupabaseStatus(nextSupabaseStatus);
    } catch (error) {
      setGitHubConnected(false);
      setGitHubConnectionMessage(null);
      setSupabaseStatus(null);
      setRouteNotice(
        error instanceof Error ? error.message : "Could not load account connections.",
        "error"
      );
    } finally {
      setStatusLoading(false);
    }
  }, [setRouteNotice]);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const githubPayload = parseGitHubAppConnectResultMessagePayload(event.data);
      if (githubPayload) {
        if (githubPayload.status === "connected") {
          void refreshStatuses();
          setRouteNotice("GitHub App connected.", "notice");
        } else {
          setRouteNotice(githubPayload.message || "Could not connect the GitHub App.", "error");
        }
        return;
      }

      const supabasePayload = parseSupabaseManagementConnectResultMessagePayload(event.data);
      if (!supabasePayload) {
        return;
      }

      if (supabasePayload.status === "connected") {
        void refreshStatuses();
        setRouteNotice("Supabase account connected.", "notice");
      } else {
        setRouteNotice(
          supabasePayload.message || "Could not connect your Supabase account.",
          "error"
        );
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refreshStatuses, setRouteNotice]);

  useEffect(() => {
    const githubResult = parseGitHubAppConnectResultFromSearch(location.search);
    if (!githubResult) {
      return;
    }

    const params = new URLSearchParams(location.search);
    params.delete("github_app");
    params.delete("github_app_message");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, {
      replace: true
    });

    if (typeof window !== "undefined" && window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(
          {
            type: GITHUB_APP_CONNECT_RESULT_MESSAGE_TYPE,
            status: githubResult.status,
            message: githubResult.message || null
          },
          window.location.origin
        );
      } catch {
        // Ignore popup relay failures and fall back to local handling.
      }

      try {
        window.close();
        return;
      } catch {
        // Browser may block closing; continue with local handling.
      }
    }

    if (githubResult.status === "connected") {
      void refreshStatuses();
      setRouteNotice("GitHub App connected.", "notice");
      return;
    }

    setRouteNotice(githubResult.message || "Could not connect the GitHub App.", "error");
  }, [location.hash, location.pathname, location.search, navigate, refreshStatuses, setRouteNotice]);

  useEffect(() => {
    const supabaseResult = parseSupabaseManagementConnectResultFromSearch(location.search);
    if (!supabaseResult) {
      return;
    }

    const params = new URLSearchParams(location.search);
    params.delete("supabase_management");
    params.delete("supabase_management_message");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, {
      replace: true
    });

    if (typeof window !== "undefined" && window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(
          {
            type: SUPABASE_MANAGEMENT_CONNECT_RESULT_MESSAGE_TYPE,
            status: supabaseResult.status,
            message: supabaseResult.message || null
          },
          window.location.origin
        );
      } catch {
        // Ignore popup relay failures and fall back to local handling.
      }

      try {
        window.close();
        return;
      } catch {
        // Browser may block closing; continue with local handling.
      }
    }

    if (supabaseResult.status === "connected") {
      void refreshStatuses();
      setRouteNotice("Supabase account connected.", "notice");
      return;
    }

    setRouteNotice(supabaseResult.message || "Could not connect your Supabase account.", "error");
  }, [location.hash, location.pathname, location.search, navigate, refreshStatuses, setRouteNotice]);

  const handleConnectGitHubApp = useCallback(async () => {
    setGitHubConnectBusy(true);
    setRouteNotice(null, null);

    const popupWindow = openCenteredPopup({ name: GITHUB_CONNECT_POPUP_NAME });
    const openMode = popupWindow ? "popup" : "same_tab";
    try {
      await connectGitHubAppForCurrentUser({
        returnTo: `${location.pathname}${location.search}${location.hash}`,
        force: true,
        openMode,
        navigationWindow: popupWindow
      });
    } catch (error) {
      if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
      }
      setRouteNotice(
        error instanceof Error
          ? error.message
          : "Could not start the GitHub App connect flow.",
        "error"
      );
    } finally {
      setGitHubConnectBusy(false);
    }
  }, [location.hash, location.pathname, location.search, setRouteNotice]);

  const handleConnectSupabase = useCallback(async () => {
    setSupabaseConnectBusy(true);
    setRouteNotice(null, null);

    const popupWindow = openCenteredPopup({ name: SUPABASE_CONNECT_POPUP_NAME });
    const openMode = popupWindow ? "popup" : "same_tab";
    try {
      await connectSupabaseManagementForCurrentUser({
        returnTo: `${location.pathname}${location.search}${location.hash}`,
        force: true,
        openMode,
        navigationWindow: popupWindow
      });
    } catch (error) {
      if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
      }
      setRouteNotice(
        error instanceof Error
          ? error.message
          : "Could not start the Supabase connect flow.",
        "error"
      );
    } finally {
      setSupabaseConnectBusy(false);
    }
  }, [location.hash, location.pathname, location.search, setRouteNotice]);

  return {
    statusLoading,
    githubConnectBusy,
    supabaseConnectBusy,
    githubConnected,
    githubConnectionMessage,
    supabaseStatus,
    refreshStatuses,
    handleConnectGitHubApp,
    handleConnectSupabase
  };
};
