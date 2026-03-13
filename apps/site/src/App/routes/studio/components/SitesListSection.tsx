import { Link } from "react-router-dom";
import { SiteAssetImage } from "../../../components/SiteAssetImage";

type SiteListItem = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  repoFullName: string;
  repoHtmlUrl: string;
  siteUrl: string;
  accessRole?: "owner" | "admin" | "editor" | "contributor";
  canDelete?: boolean;
  canManageSettings?: boolean;
  updatedAt?: string;
};

type SitesListSectionProps = {
  title: string;
  description?: string;
  emptyMessage: string;
  items: SiteListItem[];
  loading: boolean;
  getEditHref: (id: string) => string;
  getSettingsHref?: (id: string) => string;
  onCreate?: () => void;
  actionLabel?: string;
  showThumbnails?: boolean;
};

type SiteCardThumbnailProps = {
  siteUrl: string;
  imageUrl: string;
  title: string;
};

function SiteCardThumbnail({ siteUrl, imageUrl, title }: SiteCardThumbnailProps) {
  return (
    <SiteAssetImage
      siteUrl={siteUrl}
      thumbnailUrl={imageUrl}
      alt={`${title} thumbnail`}
      containerClassName="site-card-thumbnail-shell"
      imageClassName="site-card-thumbnail"
      placeholderClassName="site-card-thumbnail-placeholder"
      placeholderContent="No image"
    />
  );
}

const formatRole = (role: SiteListItem["accessRole"]) => {
  if (!role) return "Unknown";
  return role.slice(0, 1).toUpperCase() + role.slice(1);
};

const formatUpdatedAt = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
};

export default function SitesListSection({
  title,
  description,
  emptyMessage,
  items,
  loading,
  getEditHref,
  getSettingsHref,
  onCreate,
  actionLabel,
  showThumbnails = false
}: SitesListSectionProps) {
  if (loading) {
    return (
      <section className="site-list">
        <div className="section-heading">
          <div className="section-heading-copy">
            <h2>{title}</h2>
            {description && <p className="section-heading-description">{description}</p>}
          </div>
          <div className="section-heading-actions">
            {onCreate && (
              <button type="button" className="studio-primary-button" onClick={onCreate}>
                {actionLabel ?? "Create new site"}
              </button>
            )}
          </div>
        </div>
        <div className="site-list-status">
          <p>Loading your saved sites...</p>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="site-list">
        <div className="section-heading">
          <div className="section-heading-copy">
            <h2>{title}</h2>
            {description && <p className="section-heading-description">{description}</p>}
          </div>
          <div className="section-heading-actions">
            {onCreate && (
              <button type="button" className="studio-primary-button" onClick={onCreate}>
                {actionLabel ?? "Create new site"}
              </button>
            )}
          </div>
        </div>
        <div className="site-list-status">
          <p>{emptyMessage}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="site-list">
      <div className="section-heading">
        <div className="section-heading-copy">
          <h2>{title}</h2>
          {description && <p className="section-heading-description">{description}</p>}
        </div>
        <div className="section-heading-actions">
          {onCreate && (
            <button type="button" className="studio-primary-button" onClick={onCreate}>
              {actionLabel ?? "Create new site"}
            </button>
          )}
        </div>
      </div>
      <div className="site-list-grid">
        {items.map((item) => {
          const updatedAtLabel = formatUpdatedAt(item.updatedAt);

          return (
            <article key={item.id} className="site-card">
              <div className="site-card-main">
                {showThumbnails && (
                  <SiteCardThumbnail
                    siteUrl={item.siteUrl}
                    imageUrl={item.imageUrl}
                    title={item.title || item.repoFullName}
                  />
                )}
                <div className="site-card-body">
                  <p className="site-card-role">{formatRole(item.accessRole)}</p>
                  <h3 className="site-card-title" title={item.title || item.repoFullName}>
                    {item.title || item.repoFullName}
                  </h3>
                  <div className="site-card-meta">
                    <span className="site-card-repo" title={item.repoFullName}>
                      {item.repoFullName}
                    </span>
                    {updatedAtLabel && <span className="site-card-updated">Updated {updatedAtLabel}</span>}
                  </div>
                  <div className="site-card-actions">
                    <Link to={getEditHref(item.id)} className="site-card-action-link">
                      Edit
                    </Link>
                    {getSettingsHref && item.canManageSettings !== false && (
                      <Link to={getSettingsHref(item.id)} className="site-card-action-link">
                        Settings
                      </Link>
                    )}
                    {item.siteUrl && (
                      <a
                        href={item.siteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="site-card-action-link"
                      >
                        Visit site
                      </a>
                    )}
                    <a
                      href={item.repoHtmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="site-card-action-link"
                    >
                      GitHub repo
                    </a>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
