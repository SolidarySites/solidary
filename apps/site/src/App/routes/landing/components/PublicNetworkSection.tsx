import type { PublicSite } from "../../../services/public-sites";
import { PublicNetworkCard } from "./PublicNetworkCard";

type PublicNetworkSectionProps = {
  sites: PublicSite[];
  loading: boolean;
  error: string | null;
};

const formatSiteSummary = (sites: PublicSite[]) =>
  `${sites.length} published site${sites.length === 1 ? "" : "s"}`;

export function PublicNetworkSection({
  sites,
  loading,
  error,
}: PublicNetworkSectionProps) {
  const metaLabel = loading
    ? "Loading published sites"
    : error
      ? "Published sites unavailable"
      : formatSiteSummary(sites);

  return (
    <section
      id="public-network"
      className="landing-sites-section"
      aria-labelledby="public-network-title"
    >
      <div className="landing-section-header">
        <div className="landing-section-title-block">
          <h2 id="public-network-title">
            Sites published in this index.
          </h2>
        </div>
        <p className="landing-section-meta">{metaLabel}</p>
      </div>

      {loading && (
        <div className="landing-status-panel" aria-live="polite">
          <p>Loading published sites...</p>
        </div>
      )}

      {!loading && error && (
        <div className="landing-status-panel landing-status-panel-error" role="alert">
          <p>Could not load the published sites right now.</p>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && !sites.length && (
        <div className="landing-status-panel">
          <p>No published sites are visible in this index yet.</p>
        </div>
      )}

      {!loading && !error && sites.length > 0 && (
        <div className="landing-sites-grid">
          {sites.map((site) => (
            <PublicNetworkCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </section>
  );
}
