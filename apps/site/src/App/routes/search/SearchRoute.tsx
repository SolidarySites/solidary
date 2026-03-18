import { useExplorerRouteController } from "../explorer/hooks/useExplorerRouteController";
import { SearchMasthead } from "./components/SearchMasthead";
import { SearchResultsSection } from "./components/SearchResultsSection";
import "./SearchRoute.css";

export default function SearchRoute() {
  const controller = useExplorerRouteController();

  return (
    <div className="app-shell search-app-shell">
      <main className="main-content search-main-content">
        <SearchMasthead
          totalNodeCount={controller.totalNodeCount}
          totalConnectionCount={controller.totalConnectionCount}
          resultCount={controller.listSites.length}
          searchQuery={controller.searchQuery}
          onSearchQueryChange={controller.onSearchQueryChange}
        />
        <SearchResultsSection
          sites={controller.listSites}
          connections={controller.connections}
          loading={controller.loading}
          error={controller.error}
          searchQuery={controller.searchQuery}
        />
      </main>
    </div>
  );
}
