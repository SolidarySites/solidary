import { useSyncRouteNotice } from "../../../../features/site-notice/hooks/useSyncRouteNotice";
import BuilderSidebar from "./chrome/BuilderSidebar";
import BuilderTopbar from "./chrome/BuilderTopbar";
import { useSiteBuilderRouteController } from "./hooks/useSiteBuilderRouteController";
import BuilderPreviewPanel from "./preview/BuilderPreviewPanel";
import "./SiteBuilderRoute.css";

export default function SiteBuilderRoute() {
  const controller = useSiteBuilderRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell builder-shell">
      {controller.showTopbar && <BuilderTopbar {...controller.topbarProps} />}

      <div className={controller.bodyClassName}>
        <BuilderSidebar {...controller.sidebarProps} />
        {controller.showPreviewPanel && <BuilderPreviewPanel {...controller.previewPanelProps} />}
      </div>
    </div>
  );
}
