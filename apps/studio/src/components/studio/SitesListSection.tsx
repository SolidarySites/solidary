import type { MouseEvent } from "react";

type SiteListItem = {
  id: string;
  title: string;
  description: string;
  repoFullName: string;
  repoHtmlUrl: string;
  siteUrl: string;
  updatedAt?: string;
};

type SitesListSectionProps = {
  items: SiteListItem[];
  loading: boolean;
  onEdit: (id: string) => void;
  onDelete: (item: SiteListItem) => void;
};

export default function SitesListSection({ items, loading, onEdit, onDelete }: SitesListSectionProps) {
  if (loading) {
    return (
      <section className="site-list">
        <h2>Your sites</h2>
        <p>Loading your saved sites…</p>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="site-list">
        <h2>Your sites</h2>
        <p>No saved sites yet. Create one to see it here.</p>
      </section>
    );
  }

  return (
    <section className="site-list">
      <h2>Your sites</h2>
      <div className="site-list-grid">
        {items.map((item) => (
          <article key={item.id} className="site-card">
            <div>
              <h3>{item.title || item.repoFullName}</h3>
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
              <button
                className="ghost"
                onClick={(event: MouseEvent) => {
                  event.preventDefault();
                  onDelete(item);
                }}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
