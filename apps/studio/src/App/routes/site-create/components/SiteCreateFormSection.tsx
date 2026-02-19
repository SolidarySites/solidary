type SiteCreateFormSectionProps = {
  siteTitle: string;
  siteDescription: string;
  siteImagePreview: string | null;
  onSiteTitleChange: (value: string) => void;
  onSiteDescriptionChange: (value: string) => void;
  onSiteImageChange: (value: File | null) => void;
  onBackToStudio: () => void;
  onCreateSite: () => void;
};

export default function SiteCreateFormSection({
  siteTitle,
  siteDescription,
  siteImagePreview,
  onSiteTitleChange,
  onSiteDescriptionChange,
  onSiteImageChange,
  onBackToStudio,
  onCreateSite
}: SiteCreateFormSectionProps) {
  return (
    <section className="site-form">
      <div className="section-header">
        <h2>Create a site</h2>
        <p>Enter the main site metadata.</p>
      </div>

      <div className="form-grid">
        <label>
          Site title
          <input value={siteTitle} onChange={(event) => onSiteTitleChange(event.target.value)} />
        </label>

        <label>
          Description
          <textarea
            value={siteDescription}
            onChange={(event) => onSiteDescriptionChange(event.target.value)}
            rows={4}
          />
        </label>

        <label>
          Site image (JPEG)
          <input
            type="file"
            accept="image/jpeg"
            onChange={(event) => onSiteImageChange(event.target.files?.[0] ?? null)}
          />
        </label>

        {siteImagePreview && <img className="preview-image" src={siteImagePreview} alt="Preview" />}
      </div>

      <div className="form-actions">
        <button className="ghost" type="button" onClick={onBackToStudio}>
          Back to Studio
        </button>
        <button className="primary" type="button" onClick={onCreateSite}>
          Create site
        </button>
      </div>
    </section>
  );
}
