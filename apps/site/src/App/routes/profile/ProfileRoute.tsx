import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import { useProfileRouteController } from "./hooks/useProfileRouteController";
import "./ProfileRoute.css";

export default function ProfileRoute() {
  const controller = useProfileRouteController();
  const githubUsername = controller.connectedGithub.username || "Unknown";

  return (
    <div className="app-shell">
      <SiteHeader />

      <main className="main-content">
        <section className="profile-settings-card">
          <div className="section-header">
            <p className="profile-settings-eyebrow">Account</p>
            <h2>Profile settings</h2>
          </div>

          <section className="profile-github-card">
            <div className="profile-avatar-shell">
              {controller.avatarUrl ? (
                <img
                  className="profile-avatar-image"
                  src={controller.avatarUrl}
                  alt={`${githubUsername} avatar`}
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
                value={controller.displayName}
                onChange={(event) =>
                  controller.onDisplayNameChange(event.target.value)
                }
                placeholder="How your name should appear"
              />
            </label>

            <label htmlFor="profile-avatar-upload">
              Solidary avatar
              <input
                id="profile-avatar-upload"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  controller.onAvatarFileChange(event.target.files?.[0] ?? null)
                }
              />
              <span className="profile-avatar-help">
                Any image type up to 1 MB. It is heavily compressed before upload.
              </span>
            </label>

            {controller.selectedAvatarFilename && (
              <p className="profile-avatar-selected">
                Selected file: <strong>{controller.selectedAvatarFilename}</strong>
              </p>
            )}

            <div className="form-actions profile-settings-actions">
              <button
                type="submit"
                className="primary"
                disabled={!controller.hasChanges || controller.saveBusy}
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
