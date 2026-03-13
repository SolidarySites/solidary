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
  onEdit: (id: string) => void;
  onSettings?: (id: string) => void;
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
  onEdit,
  onSettings,
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
                  <div className="site-card-heading">
                    <p className="site-card-role">{formatRole(item.accessRole)}</p>
                    <h3>{item.title || item.repoFullName}</h3>
                  </div>
                  <div className="site-card-meta">
                    <span>{item.repoFullName}</span>
                    {updatedAtLabel && <span>Updated {updatedAtLabel}</span>}
                    {item.siteUrl && (
                      <a href={item.siteUrl} target="_blank" rel="noreferrer">
                        Visit site
                      </a>
                    )}
                    <a href={item.repoHtmlUrl} target="_blank" rel="noreferrer">
                      GitHub repo
                    </a>
                  </div>
                </div>
              </div>
              <div className="site-card-actions">
                <button
                  type="button"
                  className="studio-secondary-button"
                  onClick={() => onEdit(item.id)}
                >
                  Edit
                </button>
                {onSettings && item.canManageSettings !== false && (
                  <button
                    type="button"
                    className="studio-secondary-button"
                    onClick={() => onSettings(item.id)}
                  >
                    Settings
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
