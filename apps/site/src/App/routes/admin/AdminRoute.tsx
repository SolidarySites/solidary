import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import SettingsTopbar from "../studio/routes/site-settings/components/SettingsTopbar";
import IndexAdminConnectionsSection from "./components/IndexAdminConnectionsSection";
import RootAdminOverviewSection from "./components/RootAdminOverviewSection";
import RootAdminUnlockPanel from "./components/RootAdminUnlockPanel";
import { useRootAdminRouteController } from "./hooks/useRootAdminRouteController";
import "../studio/routes/site-builder/SiteBuilderRoute.css";
import "../studio/routes/site-settings/StudioSettingsRoute.css";
import "./AdminRoute.css";

export default function AdminRoute() {
  const controller = useRootAdminRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell builder-shell studio-settings-route admin-route">
      <main className="main-content">
        <div className="admin-route-header">
          <div className="admin-route-header-copy">
            <p className="studio-masthead-label">Root Admin</p>
            <h1>Manage the Solidary root index.</h1>
          </div>

          <div className="admin-route-header-controls">
            <p className="builder-collaborator-hint">Archive ID: {controller.archiveId}</p>
          </div>
        </div>

        <div className="builder-body is-settings-full">
          <section className="builder-settings-full">
            {!controller.isUnlocked && (
              <RootAdminUnlockPanel
                password={controller.password}
                unlocking={controller.unlocking}
                onPasswordChange={controller.onPasswordChange}
                onUnlock={controller.onUnlock}
              />
            )}

            {controller.isUnlocked && controller.state && (
              <>
                <RootAdminOverviewSection state={controller.state} onLogout={controller.onLogout} />
                <SettingsTopbar {...controller.settingsTopbarProps} />
              </>
            )}

            {controller.loading && (
              <div className="studio-settings-loading" role="status" aria-live="polite">
                <p className="studio-settings-loading-label">Loading root admin...</p>
                <div className="studio-settings-loading-grid" aria-hidden="true">
                  <div className="studio-settings-loading-block" />
                  <div className="studio-settings-loading-block" />
                  <div className="studio-settings-loading-block" />
                </div>
              </div>
            )}

            {!controller.loading && controller.state && controller.activeSection === "connections" && (
              <IndexAdminConnectionsSection
                connections={controller.state.connections}
                canManage={controller.state.actor.canManageConnections}
                updatingSiteId={controller.updatingConnectionSiteId}
                onConnectionStatusChange={controller.onConnectionStatusChange}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
