import { useEffect, useMemo, useState } from "react";
import type { NoticeKind } from "../../../types/notice";
import {
  STUDIO_SETTINGS_SECTION_LABELS,
  type StudioSettingsSection
} from "../../studio/routes/site-settings/services/settings-sections";
import {
  getRootIndexAdminArchiveId,
  loginIndexAdminWithPassword,
  readIndexAdmin,
  saveIndexAdminConnectionStatus
} from "../services/index-admin";
import type { IndexAdminState } from "../services/types";

const ROOT_ADMIN_TOKEN_STORAGE_KEY = "solidary:root-admin-token";
const ROOT_ADMIN_SECTION_ORDER: StudioSettingsSection[] = ["general", "connections"];

const getFriendlyErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const getRootAdminErrorMessage = (error: unknown, fallback: string) => {
  const message = getFriendlyErrorMessage(error, fallback);
  if (/archive not found/i.test(message)) {
    return "This /admin route is only available on the Solidary root index.";
  }
  return message;
};

const readStoredRootAdminToken = () => {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(ROOT_ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
};

const writeStoredRootAdminToken = (value: string) => {
  if (typeof window === "undefined") return;
  try {
    if (value.trim()) {
      window.sessionStorage.setItem(ROOT_ADMIN_TOKEN_STORAGE_KEY, value.trim());
      return;
    }
    window.sessionStorage.removeItem(ROOT_ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the in-memory token.
  }
};

export const useRootAdminRouteController = () => {
  const archiveId = getRootIndexAdminArchiveId();
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [password, setPassword] = useState("");
  const [bridgeToken, setBridgeToken] = useState(() => readStoredRootAdminToken());
  const [unlocking, setUnlocking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<IndexAdminState | null>(null);
  const [updatingConnectionSiteId, setUpdatingConnectionSiteId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<StudioSettingsSection>("general");

  useEffect(() => {
    if (!bridgeToken) {
      setState(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const response = await readIndexAdmin(archiveId, {
          bridgeToken
        });
        if (cancelled) return;
        setState(response.state);
      } catch (error) {
        if (cancelled) return;
        writeStoredRootAdminToken("");
        setBridgeToken("");
        setState(null);
        setNotice(getRootAdminErrorMessage(error, "Could not load root admin."));
        setNoticeKind("error");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [archiveId, bridgeToken]);

  const sectionButtons = useMemo(
    () =>
      ROOT_ADMIN_SECTION_ORDER.map((section) => ({
        section,
        label: STUDIO_SETTINGS_SECTION_LABELS[section],
        disabled: false,
        lockedByOther: false,
        lockHolderName: null,
        lockHolderAvatarUrl: null
      })),
    []
  );

  const handleUnlock = async () => {
    setNotice(null);
    setNoticeKind(null);
    setUnlocking(true);

    try {
      const token = await loginIndexAdminWithPassword({
        archiveId,
        password
      });
      writeStoredRootAdminToken(token);
      setBridgeToken(token);
      setPassword("");
    } catch (error) {
      setNotice(getRootAdminErrorMessage(error, "Could not unlock root admin."));
      setNoticeKind("error");
    } finally {
      setUnlocking(false);
    }
  };

  const handleConnectionStatusChange = async (siteId: string, status: "tracked" | "delisted") => {
    if (!bridgeToken) return;

    setUpdatingConnectionSiteId(siteId);
    try {
      const response = await saveIndexAdminConnectionStatus(
        {
          archiveId,
          siteId,
          status
        },
        {
          bridgeToken
        }
      );
      setState(response.state);
      setNotice(status === "tracked" ? "Site reconnected to the root index." : "Site disconnected from the root index.");
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not update root connection status."));
      setNoticeKind("error");
    } finally {
      setUpdatingConnectionSiteId(null);
    }
  };

  return {
    notice,
    noticeKind,
    archiveId,
    password,
    unlocking,
    loading,
    state,
    activeSection,
    updatingConnectionSiteId,
    isUnlocked: Boolean(bridgeToken),
    settingsTopbarProps: {
      activeSection,
      sectionButtons,
      onSectionChange: setActiveSection
    },
    onPasswordChange: setPassword,
    onUnlock: () => {
      void handleUnlock();
    },
    onConnectionStatusChange: (siteId: string, status: "tracked" | "delisted") => {
      void handleConnectionStatusChange(siteId, status);
    },
    onLogout: () => {
      writeStoredRootAdminToken("");
      setBridgeToken("");
      setPassword("");
      setState(null);
      setNotice(null);
      setNoticeKind(null);
      setActiveSection("general");
    }
  };
};
