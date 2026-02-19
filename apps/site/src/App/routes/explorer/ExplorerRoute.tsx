import SiteFooter from "../../components/SiteFooter";
import ExplorerGraph from "./components/ExplorerGraph";
import ExplorerSitesList from "./components/ExplorerSitesList";
import { useExplorerRouteController } from "./hooks/useExplorerRouteController";
import "./ExplorerRoute.css";

export default function ExplorerRoute() {
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
          <>
            <ExplorerGraph
              sites={controller.sites}
              connections={controller.connections}
            />
            <ExplorerSitesList
              sites={controller.listSites}
              connections={controller.connections}
              totalSiteCount={controller.totalSiteCount}
              totalConnectionCount={controller.totalConnectionCount}
              searchQuery={controller.searchQuery}
              onSearchQueryChange={controller.onSearchQueryChange}
            />
          </>
        )}
      </main>
      <SiteFooter notice={null} noticeKind={null} />
    </div>
  );
}
