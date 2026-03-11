import IndexesListSection from "./components/IndexesListSection";
import SitesListSection from "./components/SitesListSection";
import StudioMasthead from "./components/StudioMasthead";
import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import { useStudioRouteController } from "./hooks/useStudioRouteController";
import "./StudioRoute.css";

export default function StudioRoute() {
  const controller = useStudioRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell studio-app-shell">
      <main className="main-content studio-main-content">
        <StudioMasthead {...controller.mastheadProps} />
        <div className="studio-sections">
          {controller.shouldShowSections && <SitesListSection {...controller.ownedSitesProps} />}
          {controller.shouldShowIndexesSection && <IndexesListSection {...controller.indexesProps} />}
        </div>
      </main>
    </div>
  );
}
