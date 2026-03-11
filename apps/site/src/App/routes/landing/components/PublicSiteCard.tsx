import { useState } from "react";
import type { PublicSite } from "../../../services/public-sites";

type PublicSiteCardProps = {
  site: PublicSite;
};

const FALLBACK_DESCRIPTION = "No description provided.";

export function PublicSiteCard({ site }: PublicSiteCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const canShowImage = Boolean(site.imageUrl) && !imageFailed;
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
        <div
          className="landing-site-card-media"
          data-external-image-container="true"
          aria-hidden={!canShowImage}
        >
          {canShowImage ? (
            <img
              className="landing-site-card-thumbnail"
              src={site.imageUrl}
              alt={`${site.title} thumbnail`}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="landing-site-card-placeholder">No image</div>
          )}
        </div>
        <div className="landing-site-card-body">
          <h3 className="landing-site-card-title">{site.title}</h3>
          <p className="landing-site-card-description">{description}</p>
        </div>
      </a>
    </article>
  );
}
