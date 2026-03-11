import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import ProfileConnectedGithubCard from "./components/ProfileConnectedGithubCard";
import ProfileSettingsFormSection from "./components/ProfileSettingsFormSection";
import ProfileSupabaseConnectionCard from "./components/ProfileSupabaseConnectionCard";
import { useProfileRouteController } from "./hooks/useProfileRouteController";
import "./ProfileRoute.css";

export default function ProfileRoute() {
  const controller = useProfileRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });
  const githubUsername = controller.connectedGithub.username || "Unknown";
  const solidaryAvatarFallback =
    controller.displayName.slice(0, 1).toUpperCase() ||
    githubUsername.slice(0, 1).toUpperCase() ||
    "S";

  return (
    <div className="app-shell">
      <main className="main-content">
        <section className="profile-settings-card">
          <div className="section-header">
            <p className="profile-settings-eyebrow">Account</p>
            <h2>Profile settings</h2>
          </div>

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

          <ProfileConnectedGithubCard
            githubAvatarUrl={controller.githubAvatarUrl}
            githubUsername={githubUsername}
            profileUrl={controller.connectedGithub.profileUrl}
            email={controller.connectedGithub.email}
            connectBusy={controller.connectBusy}
            hasGitHubCredentials={controller.hasGitHubCredentials}
            hasSolidaryCredentials={controller.hasSolidaryCredentials}
            githubAppConnected={controller.githubAppConnected}
            githubAppConnectionState={controller.githubAppConnectionState}
            githubAppConnectionMessage={controller.githubAppConnectionMessage}
            githubAppRepositorySelection={controller.githubAppRepositorySelection}
            githubAppSelectedRepositories={controller.githubAppSelectedRepositories}
            githubAppSelectedRepositoriesTruncated={
              controller.githubAppSelectedRepositoriesTruncated
            }
            githubAuthStatusLoading={controller.githubAuthStatusLoading}
            showGitHubAppExternalUninstallPrompt={
              controller.showGitHubAppExternalUninstallPrompt
            }
            onConnectGitHubApp={controller.onConnectGitHubApp}
            onUninstallGitHubApp={controller.onUninstallGitHubApp}
            onOpenGitHubAppUninstallPage={controller.onOpenGitHubAppUninstallPage}
          />

          <ProfileSupabaseConnectionCard
            connected={controller.supabaseManagementConnected}
            connectionState={controller.supabaseManagementConnectionState}
            message={controller.supabaseManagementMessage}
            grantedScopes={controller.supabaseManagementGrantedScopes}
            organizations={controller.supabaseManagementOrganizations}
            projects={controller.supabaseManagementProjects}
            projectsTruncated={controller.supabaseManagementProjectsTruncated}
            statusLoading={controller.supabaseManagementStatusLoading}
            connectBusy={controller.supabaseManagementConnectBusy}
            disconnectBusy={controller.supabaseManagementDisconnectBusy}
            onConnect={controller.onConnectSupabaseManagement}
            onDisconnect={controller.onDisconnectSupabaseManagement}
          />
        </section>
      </main>
    </div>
  );
}
