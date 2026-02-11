type BuilderStylesSectionProps = {
  tokensCss: string;
  onTokensCssChange: (value: string) => void;
};

const BuilderStylesSection = ({ tokensCss, onTokensCssChange }: BuilderStylesSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Styles</h2>
      <p>Edit design tokens to adjust colors, spacing, and typography.</p>
    </div>
    <textarea
      className="code-block"
      value={tokensCss}
      onChange={(event) => onTokensCssChange(event.target.value)}
      rows={20}
    />
  </div>
);

export default BuilderStylesSection;
