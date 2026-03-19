import { useMemo } from "react";
import { useExplorerRouteController } from "../explorer/hooks/useExplorerRouteController";
import { isExplorerRootIndexNode } from "../explorer/services/explorer-data";
import { SearchMasthead } from "./components/SearchMasthead";
import { SearchResultsSection } from "./components/SearchResultsSection";
import "./SearchRoute.css";

export default function SearchRoute() {
  const controller = useExplorerRouteController();
  const searchableSites = useMemo(
    () => controller.listSites.filter((site) => !isExplorerRootIndexNode(site)),
    [controller.listSites]
  );
  const searchableNodeIds = useMemo(
    () =>
      new Set(controller.sites.filter((site) => !isExplorerRootIndexNode(site)).map((site) => site.id)),
    [controller.sites]
  );
  const searchableConnections = useMemo(
    () =>
      controller.connections.filter(
        (connection) =>
          searchableNodeIds.has(connection.sourceId) && searchableNodeIds.has(connection.targetId)
      ),
    [controller.connections, searchableNodeIds]
  );

  return (
    <div className="app-shell search-app-shell">
      <main className="main-content search-main-content">
        <SearchMasthead
          totalNodeCount={searchableNodeIds.size}
          totalConnectionCount={searchableConnections.length}
          resultCount={searchableSites.length}
          searchQuery={controller.searchQuery}
          onSearchQueryChange={controller.onSearchQueryChange}
        />
        <SearchResultsSection
          sites={searchableSites}
          connections={searchableConnections}
          loading={controller.loading}
          error={controller.error}
          searchQuery={controller.searchQuery}
        />
      </main>
    </div>
  );
}
