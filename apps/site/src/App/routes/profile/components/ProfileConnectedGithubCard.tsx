import type {
  GitHubAppConnectionState,
  GitHubAppRepositorySelection
} from "../../../features/auth/services/github-auth";

type ProfileConnectedGithubCardProps = {
  githubAvatarUrl: string | null;
  githubUsername: string;
  profileUrl: string | null;
  email: string;
  connectBusy: boolean;
  hasGitHubCredentials: boolean;
  hasSolidaryCredentials: boolean;
  githubAppConnected: boolean;
  githubAppConnectionState: GitHubAppConnectionState;
  githubAppConnectionMessage: string | null;
  githubAppRepositorySelection: GitHubAppRepositorySelection;
  githubAppSelectedRepositories: string[];
  githubAppSelectedRepositoriesTruncated: boolean;
  githubAuthStatusLoading: boolean;
  showGitHubAppExternalUninstallPrompt: boolean;
  onConnectGitHubApp: () => void;
  onUninstallGitHubApp: () => void;
  onOpenGitHubAppUninstallPage: () => void;
};

export default function ProfileConnectedGithubCard({
  githubAvatarUrl,
  githubUsername,
  profileUrl,
  email,
  connectBusy,
  hasGitHubCredentials,
  hasSolidaryCredentials,
  githubAppConnected,
  githubAppConnectionState,
  githubAppConnectionMessage,
  githubAppRepositorySelection,
  githubAppSelectedRepositories,
  githubAppSelectedRepositoriesTruncated,
  githubAuthStatusLoading,
  showGitHubAppExternalUninstallPrompt,
  onConnectGitHubApp,
  onUninstallGitHubApp,
  onOpenGitHubAppUninstallPage
}: ProfileConnectedGithubCardProps) {
  const hasGitHubAppInstallation =
    hasGitHubCredentials ||
    githubAppConnected ||
    githubAppConnectionState === "installation_missing" ||
    githubAppConnectionState === "token_invalid";
  const connectLabel = hasGitHubAppInstallation
    ? githubAppConnected
      ? "Configure GitHub App"
      : "Reconnect GitHub App"
    : "Connect GitHub App";
  const showConnectionWarning =
    hasGitHubAppInstallation &&
    !githubAppConnected &&
    Boolean(githubAppConnectionMessage?.trim());
  const showScopedRepositoryList = hasGitHubAppInstallation && githubAppRepositorySelection === "selected";
  const githubAppScopeLabel =
    githubAppRepositorySelection === "all"
      ? "Full access"
      : githubAppRepositorySelection === "selected"
        ? "Repo-scoped"
        : "Scope unknown";

  return (
    <section className="profile-github-card">
      <div className="profile-avatar-shell">
        {githubAvatarUrl ? (
          <div
            className="profile-avatar-image"
            style={{ backgroundImage: `url(${githubAvatarUrl})` }}
            role="img"
            aria-label={`${githubUsername} GitHub avatar`}
          />
        ) : (
          <div className="profile-avatar-fallback" aria-hidden="true">
            {githubUsername.slice(0, 1).toUpperCase() || "?"}
          </div>
        )}
      </div>

      <div className="profile-github-details">
        <div className="profile-github-title-row">
          <p className="profile-github-title">Connected to GitHub account</p>
        </div>
        {showConnectionWarning ? (
          <p className="profile-github-warning">{githubAppConnectionMessage}</p>
        ) : null}
        {showGitHubAppExternalUninstallPrompt ? (
          <p className="profile-github-info">
            GitHub App was disconnected in Solidary. Now uninstall it on GitHub.
            {" "}
            <button
              type="button"
              className="profile-github-link-button"
              onClick={onOpenGitHubAppUninstallPage}
            >
              Open uninstall page
            </button>
          </p>
        ) : null}
        <p className="profile-github-field">
          <span>Username</span>
          {profileUrl ? (
            <a href={profileUrl} target="_blank" rel="noreferrer">
              @{githubUsername}
            </a>
          ) : (
            <strong>@{githubUsername}</strong>
          )}
        </p>
        <p className="profile-github-field">
          <span>Email</span>
          <strong>{email || "Unknown"}</strong>
        </p>
        <p className="profile-github-field">
          <span>OAuth</span>
          <strong>
            {githubAuthStatusLoading
              ? "Loading..."
              : hasSolidaryCredentials
                ? "Connected"
                : "Not connected"}
          </strong>
        </p>
        {hasGitHubAppInstallation ? (
          <div className="profile-github-field">
            <span>GitHub App</span>
            <strong>
              {githubAuthStatusLoading
                ? "Loading..."
                : `${githubAppConnected ? "Connected" : "Not connected"} (${githubAppScopeLabel})`}
            </strong>
          </div>
        ) : null}
        {showScopedRepositoryList ? (
          <div className="profile-github-field">
            <span>Repos</span>
            {githubAppSelectedRepositories.length ? (
              <ul className="profile-github-repo-list">
                {githubAppSelectedRepositories.map((repositoryName) => (
                  <li key={repositoryName}>{repositoryName}</li>
                ))}
              </ul>
            ) : (
              <strong>No repositories granted yet.</strong>
            )}
            {githubAppSelectedRepositoriesTruncated ? (
              <p className="profile-github-repo-note">
                Showing the first {githubAppSelectedRepositories.length} repositories.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="profile-auth-actions">
          <button
            type="button"
            className="ghost profile-connect-github-app profile-auth-button"
            onClick={onConnectGitHubApp}
            disabled={connectBusy}
          >
            {connectBusy ? "Connecting..." : connectLabel}
          </button>
          {hasGitHubAppInstallation ? (
            <button
              type="button"
              className="ghost profile-connect-github-app profile-auth-button"
              onClick={onUninstallGitHubApp}
              disabled={connectBusy}
            >
              {connectBusy ? "Working..." : "Uninstall GitHub App"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
