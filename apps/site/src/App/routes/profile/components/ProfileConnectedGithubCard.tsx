import type {
  GitHubAppConnectionState,
  GitHubAuthMode
} from "../../../features/auth/services/github-auth";

type ProfileConnectedGithubCardProps = {
  githubAvatarUrl: string | null;
  githubUsername: string;
  profileUrl: string | null;
  email: string;
  connectBusy: boolean;
  switchAuthModeBusy: boolean;
  githubAuthMode: GitHubAuthMode;
  githubAppConnected: boolean;
  githubAppConnectionState: GitHubAppConnectionState;
  githubAppConnectionMessage: string | null;
  githubAuthStatusLoading: boolean;
  onConnectGitHubApp: () => void;
  onSwitchToSolidaryOAuth: () => void;
};

export default function ProfileConnectedGithubCard({
  githubAvatarUrl,
  githubUsername,
  profileUrl,
  email,
  connectBusy,
  switchAuthModeBusy,
  githubAuthMode,
  githubAppConnected,
  githubAppConnectionState,
  githubAppConnectionMessage,
  githubAuthStatusLoading,
  onConnectGitHubApp,
  onSwitchToSolidaryOAuth
}: ProfileConnectedGithubCardProps) {
  const authModeLabel =
    githubAuthMode === "github" ? "GitHub App (repo scoped)" : "Solidary OAuth";
  const connectLabel = githubAuthMode === "github" ? "Reconnect GitHub App" : "Connect GitHub App";
  const showSwitchToSolidary = githubAuthMode === "github" && !githubAppConnected;
  const showConnectionWarning =
    showSwitchToSolidary &&
    githubAppConnectionState !== "connected" &&
    Boolean(githubAppConnectionMessage?.trim());

  return (
    <section className="profile-github-card">
      <div className="profile-avatar-shell">
        {githubAvatarUrl ? (
          <img
            className="profile-avatar-image"
            src={githubAvatarUrl}
            alt={`${githubUsername} GitHub avatar`}
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
          <div className="profile-github-inline-actions">
            <button
              type="button"
              className="profile-github-help-trigger"
              aria-label="What this enables"
            >
              ?
              <span className="profile-github-help-tooltip" role="tooltip">
                Connect to the GitHub App to enable repo-scoped access for your solidary repositories.
              </span>
            </button>
            <button
              type="button"
              className="ghost profile-connect-github-app"
              onClick={onConnectGitHubApp}
              disabled={connectBusy || switchAuthModeBusy}
            >
              {connectBusy ? "Connecting..." : connectLabel}
            </button>
            {showSwitchToSolidary ? (
              <button
                type="button"
                className="ghost profile-switch-auth-mode"
                onClick={onSwitchToSolidaryOAuth}
                disabled={switchAuthModeBusy || connectBusy}
              >
                {switchAuthModeBusy ? "Switching..." : "Switch to Solidary OAuth"}
              </button>
            ) : null}
          </div>
        </div>
        {showConnectionWarning ? (
          <p className="profile-github-warning">{githubAppConnectionMessage}</p>
        ) : null}
        <p className="profile-github-field">
          <span>Auth mode</span>
          <strong>{githubAuthStatusLoading ? "Loading..." : authModeLabel}</strong>
        </p>
        <p className="profile-github-field">
          <span>GitHub App</span>
          <strong>{githubAppConnected ? "Connected" : "Not connected"}</strong>
        </p>
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
      </div>
    </section>
  );
}
