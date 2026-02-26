import SiteFooter from "../../../../components/SiteFooter";
import BuilderContentSection from "./components/BuilderContentSection";
import SettingsTopbar from "./components/SettingsTopbar";
import { useStudioSettingsRouteController } from "./hooks/useStudioSettingsRouteController";
import "./StudioSettingsRoute.css";

export default function StudioSettingsRoute() {
  const controller = useStudioSettingsRouteController();

  return (
    <div className="app-shell builder-shell studio-settings-route">
      <SettingsTopbar {...controller.settingsTopbarProps} />

      <div className={controller.bodyClassName}>
        <section className="builder-settings-full">
          <BuilderContentSection {...controller.contentSectionProps} />
        </section>
      </div>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
    </div>
  );
}
