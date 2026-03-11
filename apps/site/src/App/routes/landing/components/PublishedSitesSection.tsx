import type { PublicSite } from "../../../services/public-sites";
import { PublicSiteCard } from "./PublicSiteCard";

type PublishedSitesSectionProps = {
  sites: PublicSite[];
  loading: boolean;
  error: string | null;
};

const formatSiteCount = (count: number) => `${count} site${count === 1 ? "" : "s"} live`;

export function PublishedSitesSection({
  sites,
  loading,
  error
}: PublishedSitesSectionProps) {
  const metaLabel = loading
    ? "Updating public index"
    : error
      ? "Public index unavailable"
      : `${formatSiteCount(sites.length)} / newest first`;

  return (
    <section
      id="published-sites"
      className="landing-sites-section"
      aria-labelledby="published-sites-title"
    >
      <div className="landing-section-header">
        <div className="landing-section-title-block">
          <h2 id="published-sites-title">
            Recently published with Solidary.
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
          <p>Could not load the public index right now.</p>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && !sites.length && (
        <div className="landing-status-panel">
          <p>No published sites yet.</p>
        </div>
      )}

      {!loading && !error && sites.length > 0 && (
        <div className="landing-sites-grid">
          {sites.map((site) => (
            <PublicSiteCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </section>
  );
}
