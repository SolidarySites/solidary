import { SiteAssetImage } from "../../../components/SiteAssetImage";
import type { PublicSite } from "../../../services/public-sites";

type PublicNetworkCardProps = {
  site: PublicSite;
};

const FALLBACK_DESCRIPTION = "No description provided.";

const formatUpdatedAt = (value: string | null) => {
  if (!value) return "Update unknown";

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Update unknown";

  return `Updated ${new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
};

const formatSiteDomain = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
};

export function PublicNetworkCard({ site }: PublicNetworkCardProps) {
  const description = site.description || FALLBACK_DESCRIPTION;
  const domain = formatSiteDomain(site.canonicalUrl);

  return (
    <article className="landing-network-card">
      <a
        className="landing-network-card-link"
        href={site.canonicalUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${site.title} in a new tab`}
      >
        <SiteAssetImage
          siteUrl={site.canonicalUrl}
          thumbnailUrl={site.imageUrl}
          alt={`${site.title} thumbnail`}
          containerClassName="landing-network-card-media"
          imageClassName="landing-network-card-thumbnail"
          placeholderClassName="landing-network-card-placeholder"
          placeholderContent="No image"
        />
        <div className="landing-network-card-body">
          <div className="landing-network-card-heading">
            <h3 className="landing-network-card-title">{site.title}</h3>
            <p className="landing-network-card-domain">{domain}</p>
          </div>
          <p className="landing-network-card-description">{description}</p>
          <div className="landing-network-card-meta">
            <span>{formatUpdatedAt(site.updatedAt)}</span>
          </div>
        </div>
      </a>
    </article>
  );
}
