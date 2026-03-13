import { SiteAssetImage } from "../../../components/SiteAssetImage";
import type { PublicSite } from "../../../services/public-sites";

type PublicSiteCardProps = {
  site: PublicSite;
};

const FALLBACK_DESCRIPTION = "No description provided.";

export function PublicSiteCard({ site }: PublicSiteCardProps) {
  const description = site.description || FALLBACK_DESCRIPTION;

  return (
    <article className="landing-site-card">
      <a
        className="landing-site-card-link"
        href={site.canonicalUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${site.title} in a new tab`}
      >
        <SiteAssetImage
          siteUrl={site.canonicalUrl}
          thumbnailUrl={site.imageUrl}
          alt={`${site.title} thumbnail`}
          containerClassName="landing-site-card-media"
          imageClassName="landing-site-card-thumbnail"
          placeholderClassName="landing-site-card-placeholder"
          placeholderContent="No image"
        />
        <div className="landing-site-card-body">
          <h3 className="landing-site-card-title">{site.title}</h3>
          <p className="landing-site-card-description">{description}</p>
        </div>
      </a>
    </article>
  );
}
