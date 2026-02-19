import type { FormEvent } from "react";

type SiteFormSectionProps = {
  siteTitle: string;
  siteImagePreview: string | null;
  siteDescription: string;
  siteLoading: boolean;
  onTitleChange: (value: string) => void;
  onImageChange: (file: File | null) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
};

export default function SiteFormSection({
  siteTitle,
  siteImagePreview,
  siteDescription,
  siteLoading,
  onTitleChange,
  onImageChange,
  onDescriptionChange,
  onSubmit,
  onBack
}: SiteFormSectionProps) {
  return (
    <section className="site-form">
      <div className="section-header">
        <h2>Create a site</h2>
        <p>Provide the three required Solidary Link fields.</p>
      </div>
      <form onSubmit={onSubmit} className="form-grid">
        <label>
          Title
          <input
            value={siteTitle}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Site title"
          />
        </label>
        <label>
          Header image (JPEG)
          <input
            type="file"
            accept="image/jpeg"
            onChange={(event) => onImageChange(event.target.files?.[0] ?? null)}
          />
        </label>
        {siteImagePreview && (
          <img className="preview-image" src={siteImagePreview} alt="Preview" />
        )}
        <label>
          Description
          <textarea
            value={siteDescription}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={5}
            placeholder="Short description"
          />
        </label>
        <div className="form-actions">
          <button className="ghost" type="button" onClick={onBack}>
            Back
          </button>
          <button className="primary" type="submit" disabled={siteLoading}>
            {siteLoading ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </section>
  );
}
