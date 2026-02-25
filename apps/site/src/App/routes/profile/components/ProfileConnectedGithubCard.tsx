type ProfileConnectedGithubCardProps = {
  githubAvatarUrl: string | null;
  githubUsername: string;
  profileUrl: string | null;
  email: string;
  connectBusy: boolean;
  onConnectGitHubApp: () => void;
};

export default function ProfileConnectedGithubCard({
  githubAvatarUrl,
  githubUsername,
  profileUrl,
  email,
  connectBusy,
  onConnectGitHubApp
}: ProfileConnectedGithubCardProps) {
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
              disabled={connectBusy}
            >
              {connectBusy ? "Connecting..." : "Connect GitHub App"}
            </button>
          </div>
        </div>
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
