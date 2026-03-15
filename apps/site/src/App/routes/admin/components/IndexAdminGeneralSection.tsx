import { SiteSettingsImagePreview } from "../../studio/routes/site-settings/components/SiteSettingsImagePreview";

type IndexAdminGeneralSectionProps = {
  title: string;
  description: string;
  siteUrl: string;
  imagePreview: string | null;
  indexLevel: number | null;
  parentIndexUrl: string | null;
  canEdit: boolean;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onImageChange: (file: File | null) => void;
  onSave: () => void;
};

export default function IndexAdminGeneralSection({
  title,
  description,
  siteUrl,
  imagePreview,
  indexLevel,
  parentIndexUrl,
  canEdit,
  saving,
  onTitleChange,
  onDescriptionChange,
  onImageChange,
  onSave
}: IndexAdminGeneralSectionProps) {
  return (
    <div className="builder-section">
      <div className="section-header">
        <h2>General</h2>
        <p>Update the standalone index title, description, and public metadata.</p>
      </div>

      <label>
        Index title
        <input value={title} onChange={(event) => onTitleChange(event.target.value)} disabled={!canEdit} />
      </label>

      <label>
        Description
        <textarea
          value={description}
          rows={4}
          onChange={(event) => onDescriptionChange(event.target.value)}
          disabled={!canEdit}
        />
      </label>

      <label>
        Live URL
        <input value={siteUrl} readOnly />
      </label>

      <div className="admin-general-readonly-grid">
        <div>
          <span className="builder-collaborator-hint">Index level</span>
          <strong>{typeof indexLevel === "number" ? indexLevel : "-"}</strong>
        </div>
        <div>
          <span className="builder-collaborator-hint">Parent index</span>
          {parentIndexUrl ? (
            <a href={parentIndexUrl} target="_blank" rel="noreferrer">
              {parentIndexUrl}
            </a>
          ) : (
            <strong>-</strong>
          )}
        </div>
      </div>

      <label>
        Index image (JPEG)
        <input
          type="file"
          accept="image/jpeg"
          onChange={(event) => onImageChange(event.target.files?.[0] ?? null)}
          disabled={!canEdit}
        />
      </label>

      {imagePreview && (
        <SiteSettingsImagePreview
          siteUrl={siteUrl}
          src={imagePreview}
          alt="Standalone index image preview"
        />
      )}

      {!canEdit && (
        <p className="builder-collaborator-hint">Your current role can view this section but cannot edit it.</p>
      )}

      <div className="studio-settings-save-row admin-save-row-inline">
        <button className="primary" type="button" onClick={onSave} disabled={!canEdit || saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
