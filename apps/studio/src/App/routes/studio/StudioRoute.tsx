import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import DeleteSiteDialog from "./components/DeleteSiteDialog";
import IndexesListSection from "./components/IndexesListSection";
import SitesListSection from "./components/SitesListSection";
import { useStudioRouteController } from "./hooks/useStudioRouteController";

export default function StudioRoute() {
  const controller = useStudioRouteController();

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="main-content">
        {controller.shouldShowSections && <SitesListSection {...controller.ownedSitesProps} />}
        {controller.shouldShowSections && <IndexesListSection {...controller.indexesProps} />}
      </main>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
      <DeleteSiteDialog {...controller.deleteDialogProps} />
    </div>
  );
}
