import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router-dom";
import {
  connectSupabaseManagementForCurrentUser,
  disconnectSupabaseManagementForCurrentUser,
  getSupabaseManagementStatusForCurrentUser,
  parseSupabaseManagementConnectResultFromSearch,
  parseSupabaseManagementConnectResultMessagePayload,
  SUPABASE_MANAGEMENT_CONNECT_RESULT_MESSAGE_TYPE,
  type SupabaseManagementConnectionState,
  type SupabaseManagementOrganizationSummary,
  type SupabaseManagementProjectSummary,
  type SupabaseManagementConnectResultStatus
} from "../../../features/supabase-management/services/supabase-management";
import type { NoticeKind } from "../../../types/notice";

type UseProfileSupabaseManagementControllerArgs = {
  enabled: boolean;
  session: Session | null;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
};

const getSupabaseManagementErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Could not connect Supabase account.";
};

const openSupabaseManagementConnectPopup = () => {
  if (typeof window === "undefined") return null;

  const width = Math.min(960, Math.max(760, Math.floor(window.outerWidth * 0.84)));
  const height = Math.min(920, Math.max(740, Math.floor(window.outerHeight * 0.92)));
  const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));
  const features = [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes"
  ].join(",");

  const popupWindow = window.open(
    "about:blank",
    "solidary_supabase_management_connect",
    features
  );
  if (popupWindow) {
    return popupWindow;
  }

  return window.open("about:blank", "_blank");
};

export const useProfileSupabaseManagementController = ({
  enabled,
  session,
  setNotice,
  setNoticeKind
}: UseProfileSupabaseManagementControllerArgs) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [statusLoading, setStatusLoading] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] =
    useState<SupabaseManagementConnectionState>("not_connected");
  const [message, setMessage] = useState<string | null>(null);
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<SupabaseManagementOrganizationSummary[]>([]);
  const [projects, setProjects] = useState<SupabaseManagementProjectSummary[]>([]);
  const [projectsTruncated, setProjectsTruncated] = useState(false);

  const refreshSupabaseManagementStatus = useCallback(async () => {
    if (!session) {
      setStatusLoading(false);
      setConnected(false);
      setConnectionState("not_connected");
      setMessage(null);
      setGrantedScopes([]);
      setOrganizations([]);
      setProjects([]);
      setProjectsTruncated(false);
      return;
    }

    setStatusLoading(true);
    try {
      const status = await getSupabaseManagementStatusForCurrentUser();
      setConnected(status.connected);
      setConnectionState(status.state);
      setMessage(status.message);
      setGrantedScopes(status.grantedScopes);
      setOrganizations(status.organizations);
      setProjects(status.projects);
      setProjectsTruncated(status.projectsTruncated);
    } catch (error) {
      setConnected(false);
      setConnectionState("error");
      setMessage(getSupabaseManagementErrorMessage(error));
      setGrantedScopes([]);
      setOrganizations([]);
      setProjects([]);
      setProjectsTruncated(false);
    } finally {
      setStatusLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refreshSupabaseManagementStatus();
  }, [enabled, refreshSupabaseManagementStatus]);

  const applyConnectResult = useCallback(
    (status: SupabaseManagementConnectResultStatus, resultMessage: string) => {
      if (status === "connected") {
        if (enabled) {
          void refreshSupabaseManagementStatus();
        }
        setNotice("Supabase account connected.");
        setNoticeKind("notice");
        return;
      }

      setNotice(resultMessage || "Could not connect Supabase account.");
      setNoticeKind("error");
    },
    [enabled, refreshSupabaseManagementStatus, setNotice, setNoticeKind]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const payload = parseSupabaseManagementConnectResultMessagePayload(event.data);
      if (!payload) return;

      applyConnectResult(payload.status, payload.message);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyConnectResult]);

  useEffect(() => {
    const result = parseSupabaseManagementConnectResultFromSearch(location.search);
    if (!result) {
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
            status: result.status,
            message: result.message || null
          },
          window.location.origin
        );
      } catch {
        // Ignore postMessage failures and fall back to local notice handling.
      }

      try {
        window.close();
        return;
      } catch {
        // Browser may block closing; continue with local handling.
      }
    }

    applyConnectResult(result.status, result.message);
  }, [applyConnectResult, location.hash, location.pathname, location.search, navigate]);

  const onConnectSupabaseManagement = () => {
    if (!session) {
      setNotice("Sign in with GitHub to connect your Supabase account.");
      setNoticeKind("error");
      return;
    }

    setConnectBusy(true);
    setNotice(null);
    setNoticeKind(null);

    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const popupWindow = openSupabaseManagementConnectPopup();
    const openMode = popupWindow ? "popup" : "same_tab";

    void connectSupabaseManagementForCurrentUser({
      returnTo,
      force: true,
      openMode,
      navigationWindow: popupWindow
    })
      .then((result) => {
        if (result.connected && !result.redirected) {
          if (enabled) {
            void refreshSupabaseManagementStatus();
          }
          setNotice("Supabase account already connected.");
          setNoticeKind("notice");
        }
      })
      .catch((error) => {
        if (popupWindow && !popupWindow.closed) {
          popupWindow.close();
        }
        setNotice(getSupabaseManagementErrorMessage(error));
        setNoticeKind("error");
      })
      .finally(() => {
        setConnectBusy(false);
      });
  };

  const onDisconnectSupabaseManagement = () => {
    if (!session) {
      setNotice("Sign in with GitHub to manage Supabase access.");
      setNoticeKind("error");
      return;
    }

    setDisconnectBusy(true);
    setNotice(null);
    setNoticeKind(null);

    void disconnectSupabaseManagementForCurrentUser()
      .then(async () => {
        await refreshSupabaseManagementStatus();
        setNotice("Supabase account disconnected.");
        setNoticeKind("notice");
      })
      .catch((error) => {
        setNotice(getSupabaseManagementErrorMessage(error));
        setNoticeKind("error");
      })
      .finally(() => {
        setDisconnectBusy(false);
      });
  };

  return {
    supabaseManagementConnected: connected,
    supabaseManagementConnectionState: connectionState,
    supabaseManagementMessage: message,
    supabaseManagementGrantedScopes: grantedScopes,
    supabaseManagementOrganizations: organizations,
    supabaseManagementProjects: projects,
    supabaseManagementProjectsTruncated: projectsTruncated,
    supabaseManagementStatusLoading: statusLoading,
    supabaseManagementConnectBusy: connectBusy,
    supabaseManagementDisconnectBusy: disconnectBusy,
    onConnectSupabaseManagement,
    onDisconnectSupabaseManagement
  };
};
