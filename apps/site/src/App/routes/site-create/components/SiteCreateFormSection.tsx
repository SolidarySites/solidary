type SiteCreateFormSectionProps = {
  siteTitle: string;
  siteDescription: string;
  siteImagePreview: string | null;
  siteTitleRepoConflict: {
    repoName: string;
    repoUrl: string;
    repositoriesUrl: string;
  } | null;
  siteTitleRepoCheckInFlight: boolean;
  onSiteTitleChange: (value: string) => void;
  onSiteTitleBlur: () => void;
  onSiteDescriptionChange: (value: string) => void;
  onSiteImageChange: (value: File | null) => void;
  onBackToStudio: () => void;
  onCreateSite: () => void;
};

export default function SiteCreateFormSection({
  siteTitle,
  siteDescription,
  siteImagePreview,
  siteTitleRepoConflict,
  siteTitleRepoCheckInFlight,
  onSiteTitleChange,
  onSiteTitleBlur,
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
          <input
            value={siteTitle}
            className={siteTitleRepoConflict ? "site-create-input-error" : undefined}
            aria-invalid={siteTitleRepoConflict ? "true" : undefined}
            onChange={(event) => onSiteTitleChange(event.target.value)}
            onBlur={onSiteTitleBlur}
          />
          {siteTitleRepoConflict && (
            <span className="site-create-field-error">
              Pick a different site title. You already have a GitHub repository named{" "}
              <a href={siteTitleRepoConflict.repoUrl} target="_blank" rel="noreferrer">
                {siteTitleRepoConflict.repoName}
              </a>
              .{" "}
              <a href={siteTitleRepoConflict.repositoriesUrl} target="_blank" rel="noreferrer">
                View your repositories
              </a>
              .
            </span>
          )}
          {!siteTitleRepoConflict && siteTitleRepoCheckInFlight && (
            <span className="site-create-field-hint">Checking GitHub repository availability...</span>
          )}
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
        <button
          className="primary"
          type="button"
          onClick={onCreateSite}
          disabled={Boolean(siteTitleRepoConflict)}
        >
          Create site
        </button>
      </div>
    </section>
  );
}
