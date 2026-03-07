import SiteFooter from "../../../../components/SiteFooter";
import BuilderSidebar from "./chrome/BuilderSidebar";
import BuilderTopbar from "./chrome/BuilderTopbar";
import { useSiteBuilderRouteController } from "./hooks/useSiteBuilderRouteController";
import BuilderPreviewPanel from "./preview/BuilderPreviewPanel";
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
