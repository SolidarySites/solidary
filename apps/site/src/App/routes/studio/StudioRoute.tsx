import SiteFooter from "../../components/SiteFooter";
import IndexesListSection from "./components/IndexesListSection";
import SitesListSection from "./components/SitesListSection";
import { useStudioRouteController } from "./hooks/useStudioRouteController";
import "./StudioRoute.css";

export default function StudioRoute() {
  const controller = useStudioRouteController();

  return (
    <div className="app-shell">
      <main className="main-content">
        {controller.shouldShowSections && <SitesListSection {...controller.ownedSitesProps} />}
        {controller.shouldShowSections && <IndexesListSection {...controller.indexesProps} />}
      </main>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
    </div>
  );
}
