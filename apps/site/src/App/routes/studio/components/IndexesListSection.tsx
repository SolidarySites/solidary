type IndexesListSectionProps = {
  onCreate: () => void;
};

export default function IndexesListSection({ onCreate }: IndexesListSectionProps) {
  return (
    <section className="site-list">
      <div className="section-heading">
        <h2>Your indexes</h2>
        <button className="primary" onClick={onCreate}>
          Create new index
        </button>
      </div>
      <p>No saved indexes yet. Create one to see it here.</p>
    </section>
  );
}
