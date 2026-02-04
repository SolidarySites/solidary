type IndexPlaceholderSectionProps = {
  onBack: () => void;
};

export default function IndexPlaceholderSection({ onBack }: IndexPlaceholderSectionProps) {
  return (
    <section className="placeholder">
      <h2>Index creation</h2>
      <p>Index creation is next. For now, start with a site.</p>
      <button className="ghost" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
