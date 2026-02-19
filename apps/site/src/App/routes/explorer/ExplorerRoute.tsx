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
        <section className="explorer-hero">
          <div className="section-header">
            <p className="explorer-eyebrow">Public explorer</p>
            <h2>Explore the connected sites graph</h2>
            <p>
              This page is public and read-only. It visualizes sites in the database and approved
              site-to-site connections between them.
            </p>
          </div>

          <div className="explorer-stats">
            <article className="explorer-stat-card">
              <span>Sites</span>
              <strong>{controller.totalSiteCount}</strong>
            </article>
            <article className="explorer-stat-card">
              <span>Connections</span>
              <strong>{controller.totalConnectionCount}</strong>
            </article>
            <article className="explorer-stat-card">
              <span>Visible</span>
              <strong>{controller.filteredSites.length}</strong>
            </article>
          </div>

          <label className="explorer-search-label">
            Search sites
            <input
              value={controller.searchQuery}
              onChange={(event) => controller.onSearchQueryChange(event.target.value)}
              placeholder="Filter by title, description, or URL"
            />
          </label>
        </section>

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
              sites={controller.filteredSites}
              connections={controller.filteredConnections}
            />
            <ExplorerSitesList
              sites={controller.filteredSites}
              connections={controller.filteredConnections}
            />
          </>
        )}
      </main>
      <SiteFooter notice={null} noticeKind={null} />
    </div>
  );
}
