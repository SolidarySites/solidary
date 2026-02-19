import type { MouseEvent } from "react";

type SiteListItem = {
  id: string;
  title: string;
  description: string;
  repoFullName: string;
  repoHtmlUrl: string;
  siteUrl: string;
  accessRole?: "owner" | "admin" | "editor" | "viewer";
  updatedAt?: string;
};

type SitesListSectionProps = {
  title: string;
  emptyMessage: string;
  items: SiteListItem[];
  loading: boolean;
  onEdit: (id: string) => void;
  onDelete?: (item: SiteListItem) => void;
  onCreate?: () => void;
};

export default function SitesListSection({
  title,
  emptyMessage,
  items,
  loading,
  onEdit,
  onDelete,
  onCreate
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
            <div>
              <h3>{item.title || item.repoFullName}</h3>
              {item.accessRole && item.accessRole !== "owner" && (
                <p className="site-card-role">Role: {item.accessRole}</p>
              )}
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
            <div className="site-card-actions">
              <button className="ghost" onClick={() => onEdit(item.id)}>
                Edit
              </button>
              {onDelete && (
                <button
                  className="ghost"
                  onClick={(event: MouseEvent) => {
                    event.preventDefault();
                    onDelete(item);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
