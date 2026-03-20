import { SiteAssetImage } from "../../../components/SiteAssetImage";

type IndexListItem = {
  id: string;
  title: string;
  description: string;
  slug: string;
  imageUrl: string;
  canonicalUrl: string;
  repoFullName: string | null;
  repoUrl: string | null;
  supabaseProjectRef: string | null;
  supabaseDashboardUrl: string | null;
  updatedAt?: string;
};

type IndexesListSectionProps = {
  title: string;
  description?: string;
  emptyMessage: string;
  items: IndexListItem[];
  loading: boolean;
  actionLabel?: string;
  onCreate: () => void;
};

type IndexCardThumbnailProps = {
  indexUrl: string;
  imageUrl: string;
  title: string;
};

function IndexCardThumbnail({ indexUrl, imageUrl, title }: IndexCardThumbnailProps) {
  return (
    <SiteAssetImage
      siteUrl={indexUrl}
      thumbnailUrl={imageUrl}
      alt={`${title} thumbnail`}
      containerClassName="site-card-thumbnail-shell"
      imageClassName="site-card-thumbnail"
      placeholderClassName="site-card-thumbnail-placeholder"
      placeholderContent="No image"
    />
  );
}

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

const buildIndexAdminUrl = (canonicalUrl: string) => {
  const trimmed = canonicalUrl.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    url.pathname = normalizedPath ? `${normalizedPath}/admin` : "/admin";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

export default function IndexesListSection({
  title,
  description,
  emptyMessage,
  items,
  loading,
  actionLabel,
  onCreate
}: IndexesListSectionProps) {
  if (loading) {
    return (
      <section className="site-list">
        <div className="section-heading">
          <div className="section-heading-copy">
            <h2>{title}</h2>
            {description && <p className="section-heading-description">{description}</p>}
          </div>
          <div className="section-heading-actions">
            <button type="button" className="studio-primary-button" onClick={onCreate}>
              {actionLabel ?? "Create new index"}
            </button>
          </div>
        </div>
        <div className="site-list-status">
          <p>Loading your indexes...</p>
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
            <button type="button" className="studio-primary-button" onClick={onCreate}>
              {actionLabel ?? "Create new index"}
            </button>
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
          <button type="button" className="studio-primary-button" onClick={onCreate}>
            {actionLabel ?? "Create new index"}
          </button>
        </div>
      </div>
      <div className="site-list-grid">
        {items.map((item) => {
          const updatedAtLabel = formatUpdatedAt(item.updatedAt);
          const settingsUrl = buildIndexAdminUrl(item.canonicalUrl);

          return (
            <article key={item.id} className="site-card">
              <div className="site-card-main">
                <IndexCardThumbnail
                  indexUrl={item.canonicalUrl}
                  imageUrl={item.imageUrl}
                  title={item.title}
                />
                <div className="site-card-body">
                  <p className="site-card-role">Owner</p>
                  <h3 className="site-card-title" title={item.title}>
                    {item.title}
                  </h3>
                  <div className="site-card-meta">
                    <span className="site-card-repo" title={item.slug}>
                      {item.slug}
                    </span>
                    {updatedAtLabel ? (
                      <span className="site-card-updated">Updated {updatedAtLabel}</span>
                    ) : null}
                  </div>
                  {item.description ? <p className="site-card-description">{item.description}</p> : null}
                  <div className="site-card-actions">
                    {settingsUrl ? (
                      <a href={settingsUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
                        Settings
                      </a>
                    ) : null}
                    {item.canonicalUrl ? (
                      <a
                        href={item.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="site-card-action-link"
                      >
                        Visit site
                      </a>
                    ) : null}
                    {item.repoUrl ? (
                      <a
                        href={item.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="site-card-action-link"
                      >
                        GitHub repo
                      </a>
                    ) : null}
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
