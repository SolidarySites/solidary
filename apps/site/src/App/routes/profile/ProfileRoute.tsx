import { useCallback, useState } from "react";
import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import ProfileAuthenticationSection from "./components/ProfileAuthenticationSection";
import ProfileSettingsFormSection from "./components/ProfileSettingsFormSection";
import { useProfileRouteController } from "./hooks/useProfileRouteController";
import "./ProfileRoute.css";

export default function ProfileRoute() {
  const [authenticationExpanded, setAuthenticationExpanded] = useState(false);
  const [authenticationStatusEnabled, setAuthenticationStatusEnabled] = useState(false);
  const controller = useProfileRouteController({ authenticationStatusEnabled });
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });
  const githubUsername = controller.connectedGithub.username || "Unknown";
  const solidaryAvatarFallback =
    controller.displayName.slice(0, 1).toUpperCase() ||
    githubUsername.slice(0, 1).toUpperCase() ||
    "S";
  const onToggleAuthentication = useCallback(() => {
    setAuthenticationExpanded((current) => {
      const next = !current;
      if (next) {
        setAuthenticationStatusEnabled(true);
      }
      return next;
    });
  }, []);
  const githubCardProps = {
    githubAvatarUrl: controller.githubAvatarUrl,
    githubUsername,
    profileUrl: controller.connectedGithub.profileUrl,
    email: controller.connectedGithub.email,
    connectBusy: controller.connectBusy,
    hasGitHubCredentials: controller.hasGitHubCredentials,
    hasSolidaryCredentials: controller.hasSolidaryCredentials,
    githubAppConnected: controller.githubAppConnected,
    githubAppConnectionState: controller.githubAppConnectionState,
    githubAppConnectionMessage: controller.githubAppConnectionMessage,
    githubAppRepositorySelection: controller.githubAppRepositorySelection,
    githubAppSelectedRepositories: controller.githubAppSelectedRepositories,
    githubAppSelectedRepositoriesTruncated:
      controller.githubAppSelectedRepositoriesTruncated,
    githubAuthStatusLoading: controller.githubAuthStatusLoading,
    showGitHubAppExternalUninstallPrompt:
      controller.showGitHubAppExternalUninstallPrompt,
    onConnectGitHubApp: controller.onConnectGitHubApp,
    onUninstallGitHubApp: controller.onUninstallGitHubApp,
    onOpenGitHubAppUninstallPage: controller.onOpenGitHubAppUninstallPage
  };
  const supabaseCardProps = {
    connected: controller.supabaseManagementConnected,
    connectionState: controller.supabaseManagementConnectionState,
    message: controller.supabaseManagementMessage,
    grantedScopes: controller.supabaseManagementGrantedScopes,
    organizations: controller.supabaseManagementOrganizations,
    projects: controller.supabaseManagementProjects,
    projectsTruncated: controller.supabaseManagementProjectsTruncated,
    statusLoading: controller.supabaseManagementStatusLoading,
    connectBusy: controller.supabaseManagementConnectBusy,
    disconnectBusy: controller.supabaseManagementDisconnectBusy,
    onConnect: controller.onConnectSupabaseManagement,
    onDisconnect: controller.onDisconnectSupabaseManagement
  };

  return (
    <div className="app-shell profile-app-shell">
      <main className="main-content profile-main-content">
        <section className="profile-route-grid" aria-labelledby="profile-settings-title">
          <div className="profile-route-header">
            <h1 id="profile-settings-title">Profile settings</h1>
          </div>

          <section className="profile-settings-panel">
            <ProfileSettingsFormSection
              displayName={controller.displayName}
              displayNameTooLong={controller.displayNameTooLong}
              solidaryAvatarUrl={controller.solidaryAvatarUrl}
              solidaryAvatarFallback={solidaryAvatarFallback}
              avatarPills={controller.avatarPills}
              canAddAvatar={controller.canAddAvatar}
              canRemoveAvatar={controller.canRemoveAvatar}
              hasChanges={controller.hasChanges}
              saveBusy={controller.saveBusy}
              avatarAddBusy={controller.avatarAddBusy}
              avatarRemoveBusy={controller.avatarRemoveBusy}
              onSubmit={controller.onSubmit}
              onReset={controller.onReset}
              onDisplayNameChange={controller.onDisplayNameChange}
              onAvatarFileChange={controller.onAvatarFileChange}
              onSelectAvatar={controller.onSelectAvatar}
              onRemoveAvatar={controller.onRemoveAvatar}
            />
            <ProfileAuthenticationSection
              expanded={authenticationExpanded}
              onToggle={onToggleAuthentication}
              githubCardProps={githubCardProps}
              supabaseCardProps={supabaseCardProps}
            />
          </section>
        </section>
      </main>
    </div>
  );
}
