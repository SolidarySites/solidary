import SiteFooter from "../../components/SiteFooter";
import IndexesListSection from "./components/IndexesListSection";
import SitesListSection from "./components/SitesListSection";
import StudioMasthead from "./components/StudioMasthead";
import { useStudioRouteController } from "./hooks/useStudioRouteController";
import "./StudioRoute.css";

export default function StudioRoute() {
  const controller = useStudioRouteController();

  return (
    <div className="app-shell studio-app-shell">
      <main className="main-content studio-main-content">
        <StudioMasthead {...controller.mastheadProps} />
        <div className="studio-sections">
          {controller.shouldShowSections && <SitesListSection {...controller.ownedSitesProps} />}
          {controller.shouldShowSections && <IndexesListSection {...controller.indexesProps} />}
        </div>
      </main>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
    </div>
  );
}
