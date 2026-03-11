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
  totalConnectionCount: number;
};

const formatResultCount = (count: number) => `${count} result${count === 1 ? "" : "s"}`;

export function SearchResultsSection({
  sites,
  connections,
  loading,
  error,
  searchQuery,
  totalConnectionCount
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
  const sectionTitle = trimmedQuery ? `Results for "${trimmedQuery}"` : "All published sites";
  const sectionDescription = trimmedQuery
    ? "Matches are filtered by title, description, and canonical URL."
    : "Browse the current public index, ranked by visible site-to-site connections.";
  const metaLabel = loading
    ? "Updating public index"
    : error
      ? "Search unavailable"
      : `${formatResultCount(rankedSites.length)} / ${totalConnectionCount} public connections`;

  return (
    <section className="search-results-section" aria-labelledby="search-results-title">
      <div className="search-section-header">
        <div className="search-section-title-block">
          <h2 id="search-results-title">{sectionTitle}</h2>
          <p className="search-section-description">{sectionDescription}</p>
        </div>
        <p className="search-section-meta">{metaLabel}</p>
      </div>

      {loading && (
        <div className="search-status-panel" aria-live="polite">
          <p>Loading published sites...</p>
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
          <p>{trimmedQuery ? `No sites match "${trimmedQuery}".` : "No published sites yet."}</p>
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
