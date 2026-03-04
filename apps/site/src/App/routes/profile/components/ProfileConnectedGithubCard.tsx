import type {
  GitHubAuthRoutingStrategy,
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
  authRoutingStrategy: GitHubAuthRoutingStrategy;
  githubAppConnected: boolean;
  githubAppConnectionState: GitHubAppConnectionState;
  githubAppConnectionMessage: string | null;
  githubAppRepositorySelection: GitHubAppRepositorySelection;
  githubAppSelectedRepositories: string[];
  githubAppSelectedRepositoriesTruncated: boolean;
  githubAuthStatusLoading: boolean;
  onConnectGitHubApp: () => void;
};

export default function ProfileConnectedGithubCard({
  githubAvatarUrl,
  githubUsername,
  profileUrl,
  email,
  connectBusy,
  hasGitHubCredentials,
  hasSolidaryCredentials,
  authRoutingStrategy,
  githubAppConnected,
  githubAppConnectionState,
  githubAppConnectionMessage,
  githubAppRepositorySelection,
  githubAppSelectedRepositories,
  githubAppSelectedRepositoriesTruncated,
  githubAuthStatusLoading,
  onConnectGitHubApp
}: ProfileConnectedGithubCardProps) {
  const connectLabel = githubAppConnected
    ? "Configure GitHub App permissions"
    : "Connect GitHub App";
  const showConnectionWarning =
    !githubAppConnected &&
    githubAppConnectionState !== "connected" &&
    Boolean(githubAppConnectionMessage?.trim());
  const showScopedRepositoryList =
    githubAppConnected && githubAppRepositorySelection === "selected";
  const routingLabel =
    authRoutingStrategy === "role_based" ? "Role-based (owner/collaborator)" : "Unknown";

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
                Connect to the GitHub App to enable full or repo-scoped access for your solidary repositories.
              </span>
            </button>
            <button
              type="button"
              className="ghost profile-connect-github-app"
              onClick={onConnectGitHubApp}
              disabled={connectBusy}
            >
              {connectBusy ? "Connecting..." : connectLabel}
            </button>
          </div>
        </div>
        {showConnectionWarning ? (
          <p className="profile-github-warning">{githubAppConnectionMessage}</p>
        ) : null}
        <p className="profile-github-field">
          <span>Auth routing</span>
          <strong>{githubAuthStatusLoading ? "Loading..." : routingLabel}</strong>
        </p>
        <p className="profile-github-field">
          <span>Owner repos</span>
          <strong>
            {githubAuthStatusLoading
              ? "Loading..."
              : hasGitHubCredentials
                ? "GitHub App credentials ready"
                : "GitHub App credentials missing"}
          </strong>
        </p>
        <p className="profile-github-field">
          <span>Collaboration repos</span>
          <strong>
            {githubAuthStatusLoading
              ? "Loading..."
              : hasSolidaryCredentials
                ? "Solidary OAuth credentials ready"
                : "Solidary OAuth credentials missing"}
          </strong>
        </p>
        <p className="profile-github-field">
          <span>GitHub App</span>
          <strong>{githubAppConnected ? "Connected" : "Not connected"}</strong>
        </p>
        <p className="profile-github-field">
          <span>Routing rules</span>
          <strong>Owner repos use GitHub App. Collaboration repos use Solidary OAuth.</strong>
        </p>
        {showScopedRepositoryList ? (
          <div className="profile-github-field">
            <span>Accessible repos</span>
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
