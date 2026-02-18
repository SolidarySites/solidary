type PullRequestItem = {
  id: string;
  siteId: string;
  siteTitle: string;
  repoFullName: string;
  prNumber: number;
  prUrl: string;
  updatedAt?: string;
  editorUserId: string;
  touchedSections: string[];
  touchedPageSlugs: string[];
};

type CollaborationPullRequestsSectionProps = {
  items: PullRequestItem[];
  loading: boolean;
  mergingId: string | null;
  onMerge: (item: PullRequestItem) => void;
};

export default function CollaborationPullRequestsSection({
  items,
  loading,
  mergingId,
  onMerge
}: CollaborationPullRequestsSectionProps) {
  if (loading) {
    return (
      <section className="site-list">
        <div className="section-heading">
          <h2>Collaboration PRs</h2>
        </div>
        <p>Loading pending pull requests…</p>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="site-list">
        <div className="section-heading">
          <h2>Collaboration PRs</h2>
        </div>
        <p>No open collaborator pull requests.</p>
      </section>
    );
  }

  return (
    <section className="site-list">
      <div className="section-heading">
        <h2>Collaboration PRs</h2>
      </div>
      <div className="site-list-grid">
        {items.map((item) => (
          <article key={item.id} className="site-card">
            <div>
              <h3>{item.siteTitle}</h3>
              <p className="site-card-role">PR #{item.prNumber}</p>
              <div className="site-card-meta">
                <a href={item.prUrl} target="_blank" rel="noreferrer">
                  View pull request
                </a>
                <a href={`https://github.com/${item.repoFullName}`} target="_blank" rel="noreferrer">
                  GitHub repo
                </a>
              </div>
              {item.touchedSections.length > 0 && (
                <p className="site-card-role">Touched: {item.touchedSections.join(", ")}</p>
              )}
            </div>
            <div className="site-card-actions">
              <button
                className="primary"
                disabled={mergingId === item.id}
                onClick={() => onMerge(item)}
              >
                {mergingId === item.id ? "Merging..." : "Merge"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
