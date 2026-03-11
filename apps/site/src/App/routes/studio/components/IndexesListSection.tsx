type IndexesListSectionProps = {
  title: string;
  description?: string;
  emptyMessage: string;
  actionLabel?: string;
  onCreate: () => void;
};

export default function IndexesListSection({
  title,
  description,
  emptyMessage,
  actionLabel,
  onCreate
}: IndexesListSectionProps) {
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
