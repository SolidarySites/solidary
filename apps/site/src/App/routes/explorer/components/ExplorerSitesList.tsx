import { useMemo } from "react";
import type { ExplorerConnection, ExplorerSite } from "../services/explorer-data";
import { buildConnectedSiteLookup } from "../services/explorer-graph";

type ExplorerSitesListProps = {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
  totalSiteCount: number;
  totalConnectionCount: number;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
};

const formatSiteAge = (value: string | null) => {
  if (!value) return "Unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Date(parsed).toLocaleDateString();
};

export default function ExplorerSitesList({
  sites,
  connections,
  totalSiteCount,
  totalConnectionCount,
  searchQuery,
  onSearchQueryChange
}: ExplorerSitesListProps) {
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

  return (
    <section className="explorer-panel">
      <div className="explorer-sites-top">
        <p className="explorer-eyebrow">Public explorer</p>
        <h2 className="explorer-title">Explore the connected sites graph</h2>
        <p className="explorer-description">
          This page is public and read-only. It visualizes sites in the database and approved
          site-to-site connections between them.
        </p>
        <div className="explorer-stats">
          <span>
            <strong>{totalSiteCount}</strong> sites
          </span>
          <span>
            <strong>{totalConnectionCount}</strong> connections
          </span>
          <span>
            <strong>{sites.length}</strong> list matches
          </span>
        </div>
        <label className="explorer-search-label">
          <span>Filter site list</span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Filter by title, description, or URL"
          />
        </label>
      </div>

      {!rankedSites.length && <p>No sites found.</p>}

      {rankedSites.length > 0 && (
        <div className="explorer-site-list">
          {rankedSites.map((site) => {
            const connectionCount = connectedBySiteId[site.id]?.size ?? 0;
            return (
              <article className="explorer-site-card" key={site.id}>
                <div className="explorer-site-card-head">
                  <h4>{site.title}</h4>
                  <span>{connectionCount} connection{connectionCount === 1 ? "" : "s"}</span>
                </div>
                {site.description && <p>{site.description}</p>}
                <div className="explorer-site-card-meta">
                  <span>Updated: {formatSiteAge(site.updatedAt)}</span>
                  {site.canonicalUrl && (
                    <a href={site.canonicalUrl} target="_blank" rel="noreferrer">
                      Visit site
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
