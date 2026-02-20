import SiteFooter from "../../components/SiteFooter";
import ExplorerSitesList from "../explorer/components/ExplorerSitesList";
import { useExplorerRouteController } from "../explorer/hooks/useExplorerRouteController";
import "../explorer/ExplorerRoute.css";

export default function SearchRoute() {
  const controller = useExplorerRouteController();

  return (
    <div className="app-shell">
      <main className="main-content">
        {controller.loading && (
          <section className="explorer-panel">
            <p>Loading explorer data...</p>
          </section>
        )}

        {!controller.loading && controller.error && (
          <section className="explorer-panel">
            <p className="explorer-error">{controller.error}</p>
          </section>
        )}

        {!controller.loading && !controller.error && (
          <ExplorerSitesList
            sites={controller.listSites}
            connections={controller.connections}
            totalSiteCount={controller.totalSiteCount}
            totalConnectionCount={controller.totalConnectionCount}
            searchQuery={controller.searchQuery}
            onSearchQueryChange={controller.onSearchQueryChange}
          />
        )}
      </main>
      <SiteFooter notice={null} noticeKind={null} />
    </div>
  );
}
