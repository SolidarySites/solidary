import SiteFooter from "../../components/SiteFooter";
import ProfileConnectedGithubCard from "./components/ProfileConnectedGithubCard";
import ProfileSettingsFormSection from "./components/ProfileSettingsFormSection";
import { useProfileRouteController } from "./hooks/useProfileRouteController";
import "./ProfileRoute.css";

export default function ProfileRoute() {
  const controller = useProfileRouteController();
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

          <ProfileConnectedGithubCard
            githubAvatarUrl={controller.githubAvatarUrl}
            githubUsername={githubUsername}
            profileUrl={controller.connectedGithub.profileUrl}
            email={controller.connectedGithub.email}
            connectBusy={controller.connectBusy}
            switchAuthModeBusy={controller.switchAuthModeBusy}
            githubAuthMode={controller.githubAuthMode}
            githubAppConnected={controller.githubAppConnected}
            githubAppConnectionState={controller.githubAppConnectionState}
            githubAppConnectionMessage={controller.githubAppConnectionMessage}
            githubAuthStatusLoading={controller.githubAuthStatusLoading}
            onConnectGitHubApp={controller.onConnectGitHubApp}
            onSwitchToSolidaryOAuth={controller.onSwitchToSolidaryOAuth}
          />

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
        </section>
      </main>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
    </div>
  );
}
