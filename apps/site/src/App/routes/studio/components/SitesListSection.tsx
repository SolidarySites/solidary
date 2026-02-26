import { useState } from "react";

type SiteListItem = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  repoFullName: string;
  repoHtmlUrl: string;
  siteUrl: string;
  accessRole?: "owner" | "admin" | "editor" | "viewer";
  canDelete?: boolean;
  updatedAt?: string;
};

type SitesListSectionProps = {
  title: string;
  emptyMessage: string;
  items: SiteListItem[];
  loading: boolean;
  onEdit: (id: string) => void;
  onSettings?: (id: string) => void;
  onCreate?: () => void;
  showThumbnails?: boolean;
};

type SiteCardThumbnailProps = {
  imageUrl: string;
  title: string;
};

function SiteCardThumbnail({ imageUrl, title }: SiteCardThumbnailProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const canShowImage = Boolean(imageUrl) && !imageFailed;

  return (
    <div className="site-card-thumbnail-shell" data-external-image-container="true" aria-hidden={!canShowImage}>
      {canShowImage ? (
        <img
          className="site-card-thumbnail"
          src={imageUrl}
          alt={`${title} thumbnail`}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="site-card-thumbnail-placeholder">No image</div>
      )}
    </div>
  );
}

const formatRole = (role: SiteListItem["accessRole"]) => {
  if (!role) return "Unknown";
  return role.slice(0, 1).toUpperCase() + role.slice(1);
};

export default function SitesListSection({
  title,
  emptyMessage,
  items,
  loading,
  onEdit,
  onSettings,
  onCreate,
  showThumbnails = false
}: SitesListSectionProps) {
  if (loading) {
    return (
      <section className="site-list">
        <div className="section-heading">
          <h2>{title}</h2>
          {onCreate && (
            <button className="primary" onClick={onCreate}>
              Create new site
            </button>
          )}
        </div>
        <p>Loading your saved sites…</p>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="site-list">
        <div className="section-heading">
          <h2>{title}</h2>
          {onCreate && (
            <button className="primary" onClick={onCreate}>
              Create new site
            </button>
          )}
        </div>
        <p>{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="site-list">
      <div className="section-heading">
        <h2>{title}</h2>
        {onCreate && (
          <button className="primary" onClick={onCreate}>
            Create new site
          </button>
        )}
      </div>
      <div className="site-list-grid">
        {items.map((item) => (
          <article key={item.id} className="site-card">
            <div className="site-card-main">
              {showThumbnails && (
                <SiteCardThumbnail imageUrl={item.imageUrl} title={item.title || item.repoFullName} />
              )}
              <div className="site-card-body">
                <h3>{item.title || item.repoFullName}</h3>
                <p className="site-card-role">Role: {formatRole(item.accessRole)}</p>
                {item.description && <p>{item.description}</p>}
                <div className="site-card-meta">
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
              <button className="ghost" onClick={() => onEdit(item.id)}>
                Edit
              </button>
              {onSettings && item.canDelete !== false && (
                <button className="ghost" onClick={() => onSettings(item.id)}>
                  Settings
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
