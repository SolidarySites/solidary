import { requireFreshSupabaseAuth } from "../../auth/services/github-auth";
import { supabaseFunctionUrl } from "../../../lib/supabase";

export type SupabaseManagementConnectionState =
  | "connected"
  | "not_connected"
  | "needs_reauth"
  | "error";

export type SupabaseManagementOrganizationSummary = {
  id: string;
  slug: string | null;
  name: string;
};

export type SupabaseManagementProjectSummary = {
  id: string;
  ref: string | null;
  organizationId: string | null;
  organizationSlug: string | null;
  name: string;
  region: string | null;
  status: string | null;
};

export type SupabaseManagementConnectionStatus = {
  connected: boolean;
  state: SupabaseManagementConnectionState;
  message: string | null;
  grantedScopes: string[];
  organizations: SupabaseManagementOrganizationSummary[];
  projects: SupabaseManagementProjectSummary[];
  projectsTruncated: boolean;
};

export type SupabaseManagementConnectResultStatus = "connected" | "error";

export type ConnectSupabaseManagementOpenMode = "same_tab" | "new_tab" | "popup";

export type ConnectSupabaseManagementRequest = {
  returnTo?: string;
  force?: boolean;
  openMode?: ConnectSupabaseManagementOpenMode;
  navigationWindow?: Window | null;
};

export type ConnectSupabaseManagementResult = {
  connected: boolean;
  redirected: boolean;
};

type SupabaseManagementConnectStartPayload = {
  connected?: boolean;
  url?: string;
  error?: string;
};

type SupabaseManagementStatusPayload = {
  connected?: boolean;
  state?: string;
  message?: string | null;
  granted_scopes?: unknown;
  organizations?: unknown;
  projects?: unknown;
  projects_truncated?: boolean;
  error?: string;
};

export const SUPABASE_MANAGEMENT_CONNECT_RESULT_MESSAGE_TYPE =
  "solidary:supabase-management-connect-result";

const normalizeTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

export const parseSupabaseManagementConnectResultStatus = (
  value: string
): SupabaseManagementConnectResultStatus => {
  return value === "connected" ? "connected" : "error";
};

export const parseSupabaseManagementConnectionState = (
  value: unknown
): SupabaseManagementConnectionState => {
  const normalized = normalizeTrimmedString(value).toLowerCase();
  if (
    normalized === "connected" ||
    normalized === "not_connected" ||
    normalized === "needs_reauth" ||
    normalized === "error"
  ) {
    return normalized;
  }

  return "error";
};

const normalizeStringList = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map((entry) => normalizeTrimmedString(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }
      seen.add(entry);
      return true;
    });
};

const normalizeOrganizations = (value: unknown): SupabaseManagementOrganizationSummary[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const id = normalizeTrimmedString(row.id);
      const name = normalizeTrimmedString(row.name);
      if (!id || !name) {
        return null;
      }

      return {
        id,
        slug: normalizeTrimmedString(row.slug) || null,
        name
      } satisfies SupabaseManagementOrganizationSummary;
    })
    .filter((entry): entry is SupabaseManagementOrganizationSummary => Boolean(entry));
};

const normalizeProjects = (value: unknown): SupabaseManagementProjectSummary[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const id = normalizeTrimmedString(row.id);
      const name = normalizeTrimmedString(row.name);
      if (!id || !name) {
        return null;
      }

      return {
        id,
        ref: normalizeTrimmedString(row.ref) || null,
        organizationId: normalizeTrimmedString(row.organizationId) || null,
        organizationSlug: normalizeTrimmedString(row.organizationSlug) || null,
        name,
        region: normalizeTrimmedString(row.region) || null,
        status: normalizeTrimmedString(row.status) || null
      } satisfies SupabaseManagementProjectSummary;
    })
    .filter((entry): entry is SupabaseManagementProjectSummary => Boolean(entry));
};

export const normalizeSupabaseManagementStatusPayload = (
  payload: SupabaseManagementStatusPayload
): SupabaseManagementConnectionStatus => {
  return {
    connected: Boolean(payload.connected),
    state: parseSupabaseManagementConnectionState(payload.state),
    message: normalizeTrimmedString(payload.message) || null,
    grantedScopes: normalizeStringList(payload.granted_scopes),
    organizations: normalizeOrganizations(payload.organizations),
    projects: normalizeProjects(payload.projects),
    projectsTruncated: Boolean(payload.projects_truncated)
  };
};

export const parseSupabaseManagementConnectResultMessagePayload = (
  value: unknown
): { status: SupabaseManagementConnectResultStatus; message: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const type = (value as { type?: unknown }).type;
  if (type !== SUPABASE_MANAGEMENT_CONNECT_RESULT_MESSAGE_TYPE) {
    return null;
  }

  const rawStatus = (value as { status?: unknown }).status;
  if (typeof rawStatus !== "string") {
    return null;
  }

  return {
    status: parseSupabaseManagementConnectResultStatus(rawStatus.trim()),
    message: normalizeTrimmedString((value as { message?: unknown }).message)
  };
};

export const parseSupabaseManagementConnectResultFromSearch = (
  search: string
): { status: SupabaseManagementConnectResultStatus; message: string } | null => {
  const params = new URLSearchParams(search);
  const rawStatus = params.get("supabase_management")?.trim() ?? "";
  if (!rawStatus) {
    return null;
  }

  return {
    status: parseSupabaseManagementConnectResultStatus(rawStatus),
    message: params.get("supabase_management_message")?.trim() ?? ""
  };
};

const navigateToSupabaseManagementConnectUrl = ({
  url,
  openMode,
  navigationWindow
}: {
  url: string;
  openMode: ConnectSupabaseManagementOpenMode;
  navigationWindow?: Window | null;
}) => {
  if (typeof window === "undefined") {
    return;
  }

  if (openMode === "popup") {
    const popupWindow = navigationWindow;
    if (popupWindow && !popupWindow.closed) {
      try {
        popupWindow.location.assign(url);
        popupWindow.focus();
        return;
      } catch {
        // Fall through to current-tab navigation when popup cannot be controlled.
      }
    }
  }

  if (openMode === "new_tab") {
    const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (openedWindow) {
      return;
    }
  }

  window.location.assign(url);
};

export const connectSupabaseManagementForCurrentUser = async ({
  returnTo,
  force = false,
  openMode = "same_tab",
  navigationWindow
}: ConnectSupabaseManagementRequest = {}): Promise<ConnectSupabaseManagementResult> => {
  const { supabaseAccessToken } = await requireFreshSupabaseAuth();
  const defaultReturnTo =
    typeof window === "undefined"
      ? "/profile"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const response = await fetch(supabaseFunctionUrl("supabase-management-connect-start"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      return_to: returnTo || defaultReturnTo,
      force
    })
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as SupabaseManagementConnectStartPayload;
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not start Supabase connection.");
  }

  if (payload.connected) {
    return {
      connected: true,
      redirected: false
    };
  }

  const url = normalizeTrimmedString(payload.url);
  if (!url) {
    throw new Error("Supabase connection URL is missing.");
  }

  navigateToSupabaseManagementConnectUrl({
    url,
    openMode,
    navigationWindow
  });

  return {
    connected: false,
    redirected: true
  };
};

export const disconnectSupabaseManagementForCurrentUser = async () => {
  const { supabaseAccessToken } = await requireFreshSupabaseAuth();

  const response = await fetch(supabaseFunctionUrl("supabase-management-disconnect"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`
    }
  });
  const payload = (await response
    .json()
    .catch(() => ({}))) as { disconnected?: boolean; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not disconnect Supabase account.");
  }

  if (!payload.disconnected) {
    throw new Error("Supabase disconnect did not complete.");
  }
};

export const getSupabaseManagementStatusForCurrentUser = async () => {
  const { supabaseAccessToken } = await requireFreshSupabaseAuth();

  const response = await fetch(supabaseFunctionUrl("supabase-management-status"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`
    }
  });

  const payload = (await response.json().catch(() => ({}))) as SupabaseManagementStatusPayload;
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not read Supabase connection status.");
  }

  return normalizeSupabaseManagementStatusPayload(payload);
};
