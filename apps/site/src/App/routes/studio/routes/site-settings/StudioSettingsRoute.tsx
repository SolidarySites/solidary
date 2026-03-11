import { useSyncRouteNotice } from "../../../../features/site-notice/hooks/useSyncRouteNotice";
import BuilderContentSection from "./components/BuilderContentSection";
import SettingsTopbar from "./components/SettingsTopbar";
import { useStudioSettingsRouteController } from "./hooks/useStudioSettingsRouteController";
import "./StudioSettingsRoute.css";

export default function StudioSettingsRoute() {
  const controller = useStudioSettingsRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell builder-shell studio-settings-route">
      <SettingsTopbar {...controller.settingsTopbarProps} />

      <div className={controller.bodyClassName}>
        <section className="builder-settings-full">
          {controller.showContentLoadingPlaceholder ? (
            <div className="studio-settings-loading" role="status" aria-live="polite">
              <p className="studio-settings-loading-label">Loading site settings...</p>
              <div className="studio-settings-loading-grid" aria-hidden="true">
                <div className="studio-settings-loading-block" />
                <div className="studio-settings-loading-block" />
                <div className="studio-settings-loading-block" />
              </div>
            </div>
          ) : (
            <BuilderContentSection {...controller.contentSectionProps} />
          )}
        </section>
      </div>
    </div>
  );
}
