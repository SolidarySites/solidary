import SiteFooter from "../../../../components/SiteFooter";
import BuilderPreviewPanel from "./components/BuilderPreviewPanel";
import BuilderSidebar from "./components/BuilderSidebar";
import BuilderTopbar from "./components/BuilderTopbar";
import { useSiteBuilderRouteController } from "./hooks/useSiteBuilderRouteController";
import "./SiteBuilderRoute.css";

export default function SiteBuilderRoute() {
  const controller = useSiteBuilderRouteController();

  return (
    <div className="app-shell builder-shell">
      {controller.showTopbar && <BuilderTopbar {...controller.topbarProps} />}

      <div className={controller.bodyClassName}>
        <BuilderSidebar {...controller.sidebarProps} />
        {controller.showPreviewPanel && <BuilderPreviewPanel {...controller.previewPanelProps} />}
      </div>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
    </div>
  );
}
