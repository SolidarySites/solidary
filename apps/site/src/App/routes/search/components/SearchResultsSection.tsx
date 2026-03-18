import { useMemo } from "react";
import type { ExplorerConnection, ExplorerSite } from "../../explorer/services/explorer-data";
import { buildConnectedSiteLookup } from "../../explorer/services/explorer-graph";
import { SearchSiteCard } from "./SearchSiteCard";

type SearchResultsSectionProps = {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
};

export function SearchResultsSection({
  sites,
  connections,
  loading,
  error,
  searchQuery
}: SearchResultsSectionProps) {
  const connectedBySiteId = useMemo(
    () => buildConnectedSiteLookup(connections),
    [connections]
  );

  const rankedSites = useMemo(
    () =>
      [...sites].sort((left, right) => {
        const leftCount = connectedBySiteId[left.id]?.size ?? 0;
        const rightCount = connectedBySiteId[right.id]?.size ?? 0;
        if (leftCount !== rightCount) return rightCount - leftCount;
        return left.title.localeCompare(right.title);
      }),
    [connectedBySiteId, sites]
  );

  const trimmedQuery = searchQuery.trim();

  return (
    <section className="search-results-section" aria-label="Search results">
      {loading && (
        <div className="search-status-panel" aria-live="polite">
          <p>Loading published sites and indexes...</p>
        </div>
      )}

      {!loading && error && (
        <div className="search-status-panel search-status-panel-error" role="alert">
          <p>Could not load the public search index right now.</p>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && !rankedSites.length && (
        <div className="search-status-panel">
          <p>
            {trimmedQuery
              ? `No sites or indexes match "${trimmedQuery}".`
              : "No published sites or indexes yet."}
          </p>
        </div>
      )}

      {!loading && !error && rankedSites.length > 0 && (
        <div className="search-results-grid">
          {rankedSites.map((site) => (
            <SearchSiteCard
              key={site.id}
              site={site}
              connectionCount={connectedBySiteId[site.id]?.size ?? 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}
