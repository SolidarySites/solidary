import type { SupabaseManagementConnectionStatus } from "../../../features/supabase-management/services/supabase-management";
import type { IndexAdminSetup } from "../../admin/services/types";
import type {
  IndexCreatePrerequisites
} from "../services/types";
import { hasRequiredSupabaseManagementScopes } from "../services/index-create-provisioning";

export const GITHUB_CONNECT_POPUP_NAME = "solidary_github_app_connect";
export const SUPABASE_CONNECT_POPUP_NAME = "solidary_supabase_management_connect";
export const INITIAL_PROVISION_STEP = "Preparing your index...";

export type RepoConflict = {
  repoName: string;
  repoUrl: string;
  repositoriesUrl: string;
};

export type RepoNameCheckPayload = {
  exists?: boolean;
  owner_login?: string;
  repo_name?: string;
  repo_url?: string;
  repositories_url?: string;
};

export const shouldAwaitFunctionsDeploymentRun = (
  status: IndexAdminSetup["functionsDeployment"]["status"] | null | undefined
) => status == null || status === "ready_to_run" || status === "unknown";

export const openCenteredPopup = ({
  name,
  width = 920,
  height = 860
}: {
  name: string;
  width?: number;
  height?: number;
}) => {
  if (typeof window === "undefined") {
    return null;
  }

  const popupWidth = Math.min(width, Math.max(720, Math.floor(window.outerWidth * 0.84)));
  const popupHeight = Math.min(height, Math.max(720, Math.floor(window.outerHeight * 0.9)));
  const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - popupWidth) / 2));
  const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - popupHeight) / 2));
  const features = [
    "popup=yes",
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes"
  ].join(",");

  const popupWindow = window.open("about:blank", name, features);
  if (popupWindow) {
    return popupWindow;
  }

  return window.open("about:blank", "_blank");
};

export const extractBridgeTokenFromStandaloneAdminUrl = (value: string | null | undefined) => {
  const rawValue = value?.trim() ?? "";
  if (!rawValue) {
    return "";
  }

  try {
    return new URL(rawValue).searchParams.get("bridge")?.trim() ?? "";
  } catch {
    return "";
  }
};

export const buildPrerequisites = ({
  githubConnected,
  supabaseStatus,
  selectedOrganizationId
}: {
  githubConnected: boolean;
  supabaseStatus: SupabaseManagementConnectionStatus | null;
  selectedOrganizationId: string;
}): IndexCreatePrerequisites => {
  const supabaseReady = Boolean(supabaseStatus?.connected);
  const supabaseScopesReady = hasRequiredSupabaseManagementScopes(
    supabaseStatus?.grantedScopes ?? []
  );

  let blockingMessage: string | null = null;
  if (!githubConnected) {
    blockingMessage = "Connect the GitHub App to let Solidary create and manage your index repo.";
  } else if (!supabaseReady) {
    blockingMessage =
      "Connect your Supabase account so Solidary can create and configure the child project.";
  } else if (!supabaseScopesReady) {
    blockingMessage =
      "Reconnect your Supabase account with the scopes needed to create projects and configure auth.";
  } else if (!selectedOrganizationId) {
    blockingMessage = "Choose which Supabase organization should own the new child project.";
  }

  return {
    githubReady: githubConnected,
    supabaseReady,
    supabaseScopesReady,
    ready: !blockingMessage,
    blockingMessage
  };
};

export const getFunctionsDeploymentDisplay = ({
  functionsDeploymentPending,
  setup
}: {
  functionsDeploymentPending: boolean;
  setup: IndexAdminSetup | null;
}) => {
  if (
    functionsDeploymentPending &&
    shouldAwaitFunctionsDeploymentRun(setup?.functionsDeployment.status)
  ) {
    return {
      status: "running",
      message: "Waiting for GitHub Actions to report the child deploy workflow run."
    } as const;
  }

  return {
    status: setup?.functionsDeployment.status ?? "not_ready",
    message: setup?.functionsDeployment.message ?? null
  } as const;
};
