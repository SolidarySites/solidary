import { useEffect, useMemo, useState } from "react";
import type { NoticeKind } from "../../../types/notice";
import {
  STUDIO_SETTINGS_SECTION_LABELS,
  type StudioSettingsSection
} from "../../studio/routes/site-settings/services/settings-sections";
import {
  loginIndexAdminWithPassword,
  readIndexAdmin,
  updateIndexAdminConnectionRequest
} from "../services/index-admin";
import type { IndexAdminState } from "../services/types";

const ROOT_ADMIN_TOKEN_STORAGE_KEY = "solidary:root-admin-token";
const ROOT_ADMIN_SECTION_ORDER: StudioSettingsSection[] = ["general", "connections"];

const getFriendlyErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const getRootAdminErrorMessage = (error: unknown, fallback: string) => {
  const message = getFriendlyErrorMessage(error, fallback);
  if (/index not found/i.test(message)) {
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

export const useRootAdminRouteController = ({
  indexId,
  indexIdLoading
}: {
  indexId: string;
  indexIdLoading: boolean;
}) => {
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [password, setPassword] = useState("");
  const [bridgeToken, setBridgeToken] = useState(() => readStoredRootAdminToken());
  const [unlocking, setUnlocking] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [state, setState] = useState<IndexAdminState | null>(null);
  const [updatingConnectionRequestId, setUpdatingConnectionRequestId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<StudioSettingsSection>("general");

  useEffect(() => {
    if (indexIdLoading || !indexId.trim()) {
      setStateLoading(false);
      return;
    }

    if (!bridgeToken) {
      setState(null);
      setStateLoading(false);
      return;
    }

    let cancelled = false;
    setStateLoading(true);

    void (async () => {
      try {
        const response = await readIndexAdmin(indexId, {
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
          setStateLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bridgeToken, indexId, indexIdLoading]);

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
    if (indexIdLoading || !indexId.trim()) {
      return;
    }

    setNotice(null);
    setNoticeKind(null);
    setUnlocking(true);

    try {
      const token = await loginIndexAdminWithPassword({
        indexId,
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

  const handleConnectionRequestAction = async (
    requestId: string,
    action: "approve" | "reject" | "disconnect"
  ) => {
    if (!bridgeToken) return;

    setUpdatingConnectionRequestId(requestId);
    try {
      const response = await updateIndexAdminConnectionRequest(
        {
          indexId,
          requestId,
          action
        },
        {
          bridgeToken
        }
      );
      setState(response.state);
      setNotice(
        action === "approve"
          ? "Connection approved."
          : action === "reject"
            ? "Connection request rejected."
            : "Connection removed."
      );
      setNoticeKind("notice");
    } catch (error) {
      setNotice(getFriendlyErrorMessage(error, "Could not update the root connection."));
      setNoticeKind("error");
    } finally {
      setUpdatingConnectionRequestId(null);
    }
  };

  return {
    notice,
    noticeKind,
    indexId,
    password,
    unlocking,
    loading: indexIdLoading || stateLoading,
    state,
    activeSection,
    updatingConnectionRequestId,
    indexIdReady: !indexIdLoading && Boolean(indexId.trim()),
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
    onConnectionRequestAction: (
      requestId: string,
      action: "approve" | "reject" | "disconnect"
    ) => {
      void handleConnectionRequestAction(requestId, action);
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
