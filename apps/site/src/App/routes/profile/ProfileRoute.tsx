import SiteFooter from "../../components/SiteFooter";
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

          <section className="profile-github-card">
            <div className="profile-avatar-shell">
              {controller.githubAvatarUrl ? (
                <img
                  className="profile-avatar-image"
                  src={controller.githubAvatarUrl}
                  alt={`${githubUsername} GitHub avatar`}
                />
              ) : (
                <div className="profile-avatar-fallback" aria-hidden="true">
                  {githubUsername.slice(0, 1).toUpperCase() || "?"}
                </div>
              )}
            </div>

            <div className="profile-github-details">
              <p className="profile-github-title">Connected to GitHub account</p>
              <p className="profile-github-field">
                <span>Username</span>
                {controller.connectedGithub.profileUrl ? (
                  <a
                    href={controller.connectedGithub.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{githubUsername}
                  </a>
                ) : (
                  <strong>@{githubUsername}</strong>
                )}
              </p>
              <p className="profile-github-field">
                <span>Email</span>
                <strong>{controller.connectedGithub.email || "Unknown"}</strong>
              </p>
            </div>
          </section>

          <form
            className="form-grid profile-settings-form"
            onSubmit={controller.onSubmit}
          >
            <label htmlFor="profile-display-name">
              Display name
              <input
                id="profile-display-name"
                type="text"
                autoComplete="name"
                className={controller.displayNameTooLong ? "profile-input-error" : undefined}
                value={controller.displayName}
                onChange={(event) =>
                  controller.onDisplayNameChange(event.target.value)
                }
                placeholder="How your name should appear"
              />
              {controller.displayNameTooLong && (
                <span className="profile-field-error">max 20 characters</span>
              )}
            </label>

            <div className="profile-solidary-avatar-row">
              <div className="profile-avatar-shell profile-solidary-avatar-shell">
                {controller.solidaryAvatarUrl ? (
                  <img
                    className="profile-avatar-image"
                    src={controller.solidaryAvatarUrl}
                    alt="Solidary avatar preview"
                  />
                ) : (
                  <div className="profile-avatar-fallback" aria-hidden="true">
                    {solidaryAvatarFallback}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="ghost profile-avatar-remove"
                onClick={controller.onRemoveAvatar}
                disabled={!controller.canRemoveAvatar || controller.saveBusy}
              >
                Remove
              </button>
            </div>

            <label htmlFor="profile-avatar-upload">
              Upload Solidary avatar
              <input
                id="profile-avatar-upload"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  controller.onAvatarFileChange(event.target.files?.[0] ?? null)
                }
              />
              <span className="profile-avatar-help">
                Max file size 1MB.
              </span>
            </label>

            <div className="form-actions profile-settings-actions">
              <button
                type="submit"
                className="primary"
                disabled={!controller.hasChanges || controller.saveBusy || controller.displayNameTooLong}
              >
                {controller.saveBusy ? "Saving..." : "Save settings"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={!controller.hasChanges || controller.saveBusy}
                onClick={controller.onReset}
              >
                Reset
              </button>
            </div>
          </form>
        </section>
      </main>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
    </div>
  );
}
