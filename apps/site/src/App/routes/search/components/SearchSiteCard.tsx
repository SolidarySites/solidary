import { SiteAssetImage } from "../../../components/SiteAssetImage";
import type { ExplorerSite } from "../../explorer/services/explorer-data";

type SearchSiteCardProps = {
  site: ExplorerSite;
  connectionCount: number;
};

const FALLBACK_DESCRIPTION = "No description provided.";

const formatConnectionLabel = (count: number) =>
  `${count} connection${count === 1 ? "" : "s"}`;

const formatUpdatedAt = (value: string | null) => {
  if (!value) return "Update unknown";

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Update unknown";

  return `Updated ${new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  })}`;
};

const formatSiteDomain = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
};

export function SearchSiteCard({ site, connectionCount }: SearchSiteCardProps) {
  const description = site.description || FALLBACK_DESCRIPTION;
  const domain = formatSiteDomain(site.canonicalUrl);

  return (
    <article className="search-site-card">
      <a
        className="search-site-card-link"
        href={site.canonicalUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${site.title} in a new tab`}
      >
        <SiteAssetImage
          siteUrl={site.canonicalUrl}
          thumbnailUrl={site.imageUrl}
          alt={`${site.title} thumbnail`}
          containerClassName="search-site-card-media"
          imageClassName="search-site-card-thumbnail"
          placeholderClassName="search-site-card-placeholder"
          placeholderContent="No image"
        />

        <div className="search-site-card-body">
          <div className="search-site-card-heading">
            <h3 className="search-site-card-title">{site.title}</h3>
            <p className="search-site-card-domain">{domain}</p>
          </div>
          <p className="search-site-card-description">{description}</p>
          <div className="search-site-card-meta">
            <span>{formatConnectionLabel(connectionCount)}</span>
            <span>{formatUpdatedAt(site.updatedAt)}</span>
          </div>
        </div>
      </a>
    </article>
  );
}
