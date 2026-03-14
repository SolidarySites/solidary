import {
  MAX_SITE_DESCRIPTION_LENGTH,
  MAX_SITE_TITLE_LENGTH
} from "../../../services/site-metadata";
import type { IndexCreatePrerequisites, IndexCreateOrganizationOption } from "../services/types";

type IndexCreateFormSectionProps = {
  title: string;
  description: string;
  imagePreview: string | null;
  repoConflict: {
    repoName: string;
    repoUrl: string;
    repositoriesUrl: string;
  } | null;
  repoCheckInFlight: boolean;
  prerequisites: IndexCreatePrerequisites;
  organizations: IndexCreateOrganizationOption[];
  selectedOrganizationId: string;
  statusLoading: boolean;
  onTitleChange: (value: string) => void;
  onTitleBlur: () => void;
  onDescriptionChange: (value: string) => void;
  onImageChange: (value: File | null) => void;
  onSelectedOrganizationChange: (value: string) => void;
  onBackToStudio: () => void;
  onOpenProfile: () => void;
  onCreateIndex: () => void;
};

const statusLabel = (ready: boolean, loading: boolean) => {
  if (loading) return "Checking...";
  return ready ? "Connected" : "Needs action";
};

const organizationsLabel = (organizations: IndexCreateOrganizationOption[], loading: boolean) => {
  if (loading) return "Checking...";
  if (!organizations.length) return "No organizations available";
  return `${organizations.length} organization${organizations.length === 1 ? "" : "s"} available`;
};

export default function IndexCreateFormSection({
  title,
  description,
  imagePreview,
  repoConflict,
  repoCheckInFlight,
  prerequisites,
  organizations,
  selectedOrganizationId,
  statusLoading,
  onTitleChange,
  onTitleBlur,
  onDescriptionChange,
  onImageChange,
  onSelectedOrganizationChange,
  onBackToStudio,
  onOpenProfile,
  onCreateIndex
}: IndexCreateFormSectionProps) {
  return (
    <section className="site-form">
      <div className="section-header">
        <h2>Create an index</h2>
        <p>Create a standalone Solidary index repo and Supabase project in your own accounts.</p>
      </div>

      <section className="index-create-checklist" aria-labelledby="index-create-checklist-title">
        <div className="index-create-checklist-heading">
          <div>
            <h3 id="index-create-checklist-title">Before you create</h3>
            <p>Connect the required accounts in Profile, then return here to continue.</p>
          </div>
          <button type="button" className="ghost" onClick={onOpenProfile}>
            Open Profile
          </button>
        </div>
        <ul className="index-create-checklist-items">
          <li className={prerequisites.githubReady ? "is-ready" : "is-blocked"}>
            <span>GitHub App</span>
            <strong>{statusLabel(prerequisites.githubReady, statusLoading)}</strong>
          </li>
          <li className={prerequisites.supabaseReady ? "is-ready" : "is-blocked"}>
            <span>Supabase Management</span>
            <strong>{statusLabel(prerequisites.supabaseReady, statusLoading)}</strong>
          </li>
          <li className={prerequisites.supabaseScopesReady ? "is-ready" : "is-blocked"}>
            <span>Supabase scopes</span>
            <strong>{statusLabel(prerequisites.supabaseScopesReady, statusLoading)}</strong>
          </li>
          <li className={organizations.length ? "is-ready" : "is-blocked"}>
            <span>Supabase organizations</span>
            <strong>{organizationsLabel(organizations, statusLoading)}</strong>
          </li>
        </ul>
        {!prerequisites.ready && prerequisites.blockingMessage ? (
          <p className="site-create-field-error">{prerequisites.blockingMessage}</p>
        ) : null}
      </section>

      <div className="form-grid">
        <label>
          Index title
          <input
            value={title}
            maxLength={MAX_SITE_TITLE_LENGTH}
            className={repoConflict ? "site-create-input-error" : undefined}
            aria-invalid={repoConflict ? "true" : undefined}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={onTitleBlur}
          />
          {repoConflict ? (
            <span className="site-create-field-error">
              Pick a different title. You already have a GitHub repository named{" "}
              <a href={repoConflict.repoUrl} target="_blank" rel="noreferrer">
                {repoConflict.repoName}
              </a>
              .{" "}
              <a href={repoConflict.repositoriesUrl} target="_blank" rel="noreferrer">
                View your repositories
              </a>
              .
            </span>
          ) : null}
          {!repoConflict && repoCheckInFlight ? (
            <span className="site-create-field-hint">Checking GitHub repository availability...</span>
          ) : null}
        </label>

        <label>
          Description
          <textarea
            value={description}
            maxLength={MAX_SITE_DESCRIPTION_LENGTH}
            rows={4}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </label>

        <label>
          Supabase organization
          <select
            value={selectedOrganizationId}
            onChange={(event) => onSelectedOrganizationChange(event.target.value)}
            disabled={!organizations.length}
          >
            <option value="">Select an organization</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
                {organization.slug ? ` (${organization.slug})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Index image
          <input
            type="file"
            accept="image/*"
            onChange={(event) => onImageChange(event.target.files?.[0] ?? null)}
          />
        </label>

        {imagePreview ? (
          <img className="preview-image" src={imagePreview} alt="Index image preview" />
        ) : null}
      </div>

      <div className="form-actions">
        <button className="ghost" type="button" onClick={onBackToStudio}>
          Back to Studio
        </button>
        <button
          className="primary"
          type="button"
          onClick={onCreateIndex}
          disabled={Boolean(repoConflict) || !prerequisites.ready || !selectedOrganizationId}
        >
          Create index
        </button>
      </div>
    </section>
  );
}
