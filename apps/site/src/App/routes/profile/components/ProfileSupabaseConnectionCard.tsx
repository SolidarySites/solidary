import type {
  SupabaseManagementConnectionState,
  SupabaseManagementOrganizationSummary,
  SupabaseManagementProjectSummary
} from "../../../features/supabase-management/services/supabase-management";

type ProfileSupabaseConnectionCardProps = {
  connected: boolean;
  connectionState: SupabaseManagementConnectionState;
  message: string | null;
  grantedScopes: string[];
  organizations: SupabaseManagementOrganizationSummary[];
  projects: SupabaseManagementProjectSummary[];
  projectsTruncated: boolean;
  statusLoading: boolean;
  connectBusy: boolean;
  disconnectBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

const getConnectionLabel = (
  connected: boolean,
  connectionState: SupabaseManagementConnectionState,
  statusLoading: boolean
) => {
  if (statusLoading) return "Loading...";
  if (connected) return "Connected";
  if (connectionState === "needs_reauth") return "Reconnect required";
  if (connectionState === "error") return "Error";
  return "Not connected";
};

export default function ProfileSupabaseConnectionCard({
  connected,
  connectionState,
  message,
  grantedScopes,
  organizations,
  projects,
  projectsTruncated,
  statusLoading,
  connectBusy,
  disconnectBusy,
  onConnect,
  onDisconnect
}: ProfileSupabaseConnectionCardProps) {
  const hasStoredConnection = connected || connectionState !== "not_connected";
  const connectLabel = connected ? "Reconnect Supabase" : "Connect Supabase";

  return (
    <section className="profile-supabase-card">
      <div className="profile-supabase-avatar" aria-hidden="true">
        SB
      </div>

      <div className="profile-supabase-details">
        <div className="profile-supabase-title-row">
          <p className="profile-supabase-title">Supabase account connection</p>
        </div>

        {message ? (
          <p
            className={
              connectionState === "needs_reauth" || connectionState === "error"
                ? "profile-supabase-warning"
                : "profile-supabase-info"
            }
          >
            {message}
          </p>
        ) : null}

        <p className="profile-supabase-field">
          <span>OAuth</span>
          <strong>{getConnectionLabel(connected, connectionState, statusLoading)}</strong>
        </p>

        <div className="profile-supabase-field">
          <span>Scopes</span>
          {grantedScopes.length ? (
            <ul className="profile-supabase-list">
              {grantedScopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          ) : (
            <strong>{statusLoading ? "Loading..." : "No scopes granted yet."}</strong>
          )}
        </div>

        <div className="profile-supabase-field">
          <span>Organizations</span>
          {organizations.length ? (
            <ul className="profile-supabase-list">
              {organizations.map((organization) => (
                <li key={organization.id}>
                  {organization.name}
                  {organization.slug ? ` (${organization.slug})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <strong>{statusLoading ? "Loading..." : "No organizations visible."}</strong>
          )}
        </div>

        <div className="profile-supabase-field">
          <span>Projects</span>
          {projects.length ? (
            <ul className="profile-supabase-list">
              {projects.map((project) => (
                <li key={project.id}>
                  {project.name}
                  {project.ref ? ` (${project.ref})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <strong>{statusLoading ? "Loading..." : "No projects visible."}</strong>
          )}
          {projectsTruncated ? (
            <p className="profile-supabase-note">
              Showing the first {projects.length} projects.
            </p>
          ) : null}
        </div>
        <div className="profile-auth-actions">
          <button
            type="button"
            className="ghost profile-connect-supabase profile-auth-button"
            onClick={onConnect}
            disabled={connectBusy || disconnectBusy}
          >
            {connectBusy ? "Connecting..." : connectLabel}
          </button>
          {hasStoredConnection ? (
            <button
              type="button"
              className="ghost profile-connect-supabase profile-auth-button"
              onClick={onDisconnect}
              disabled={connectBusy || disconnectBusy}
            >
              {disconnectBusy ? "Disconnecting..." : "Disconnect"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
