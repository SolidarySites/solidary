import { useMemo } from "react";
import type { ExplorerConnection, ExplorerSite } from "../services/explorer-data";
import { buildConnectedSiteLookup } from "../services/explorer-graph";

type ExplorerSitesListProps = {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
};

const formatSiteAge = (value: string | null) => {
  if (!value) return "Unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Date(parsed).toLocaleDateString();
};

export default function ExplorerSitesList({ sites, connections }: ExplorerSitesListProps) {
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
      <div className="section-header">
        <h3>Sites</h3>
        <p>All indexed sites with their direct connection counts.</p>
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
