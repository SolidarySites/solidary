import { SiteAssetImage } from "../../../components/SiteAssetImage";
import type { PublicNetworkNode } from "../../../services/public-network";

type PublicNetworkCardProps = {
  node: PublicNetworkNode;
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

export function PublicNetworkCard({ node }: PublicNetworkCardProps) {
  const description = node.description || FALLBACK_DESCRIPTION;
  const domain = formatSiteDomain(node.canonicalUrl);
  const isIndex = node.nodeType === "index";

  return (
    <article className="landing-network-card">
      <a
        className="landing-network-card-link"
        href={node.canonicalUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${node.title} in a new tab`}
      >
        <SiteAssetImage
          siteUrl={node.canonicalUrl}
          thumbnailUrl={node.imageUrl}
          alt={`${node.title} thumbnail`}
          containerClassName="landing-network-card-media"
          imageClassName="landing-network-card-thumbnail"
          placeholderClassName="landing-network-card-placeholder"
          placeholderContent="No image"
        />
        <div className="landing-network-card-body">
          <div className="landing-network-card-heading">
            <span className={`landing-network-card-badge landing-network-card-badge-${node.nodeType}`}>
              {isIndex ? "Index" : "Site"}
            </span>
            <h3 className="landing-network-card-title">{node.title}</h3>
            <p className="landing-network-card-domain">{domain}</p>
          </div>
          <p className="landing-network-card-description">{description}</p>
          <div className="landing-network-card-meta">
            <span>{formatConnectionLabel(node.connectionCount)}</span>
            <span>{formatUpdatedAt(node.updatedAt)}</span>
          </div>
        </div>
      </a>
    </article>
  );
}
