import type {
  CollaboratorRole,
  CollaboratorSearchResult,
  ManagedCollaborator
} from "../services/types";

type BuilderContentSectionProps = {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  siteImagePreview: string | null;
  collaboratorQuery: string;
  collaboratorRole: CollaboratorRole;
  collaboratorSuggestions: CollaboratorSearchResult[];
  selectedCollaboratorSuggestion: CollaboratorSearchResult | null;
  collaboratorSearchLoading: boolean;
  invitingCollaborator: boolean;
  collaborators: ManagedCollaborator[];
  collaboratorsLoading: boolean;
  updatingCollaboratorUserId: string | null;
  onSiteTitleChange: (value: string) => void;
  onSiteDescriptionChange: (value: string) => void;
  onSiteUrlChange: (value: string) => void;
  onSiteImageChange: (file: File | null) => void;
  onCollaboratorQueryChange: (value: string) => void;
  onCollaboratorRoleChange: (value: CollaboratorRole) => void;
  onCollaboratorSuggestionSelect: (suggestion: CollaboratorSearchResult) => void;
  onInviteCollaborator: () => void;
  onCollaboratorRoleUpdate: (userId: string, role: CollaboratorRole) => void;
  onCollaboratorRemove: (userId: string) => void;
};

const BuilderContentSection = ({
  siteTitle,
  siteDescription,
  siteUrl,
  siteImagePreview,
  collaboratorQuery,
  collaboratorRole,
  collaboratorSuggestions,
  selectedCollaboratorSuggestion,
  collaboratorSearchLoading,
  invitingCollaborator,
  collaborators,
  collaboratorsLoading,
  updatingCollaboratorUserId,
  onSiteTitleChange,
  onSiteDescriptionChange,
  onSiteUrlChange,
  onSiteImageChange,
  onCollaboratorQueryChange,
  onCollaboratorRoleChange,
  onCollaboratorSuggestionSelect,
  onInviteCollaborator,
  onCollaboratorRoleUpdate,
  onCollaboratorRemove
}: BuilderContentSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Solidary Metadata</h2>
      <p>Update the main site metadata and hero text.</p>
    </div>
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
      Site URL
      <input value={siteUrl} onChange={(event) => onSiteUrlChange(event.target.value)} />
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

    <div className="builder-section builder-collaborator-section">
      <div className="section-header">
        <h3>Invite collaborator</h3>
        <p>Search Solidary users first, or invite by GitHub username/email.</p>
      </div>

      <label>
        GitHub username or email
        <input
          value={collaboratorQuery}
          onChange={(event) => onCollaboratorQueryChange(event.target.value)}
          placeholder="Start typing a name, username, or email"
        />
      </label>

      {collaboratorSearchLoading && (
        <p className="builder-collaborator-hint">Searching Solidary users...</p>
      )}

      {!collaboratorSearchLoading && collaboratorSuggestions.length > 0 && (
        <div className="builder-collaborator-suggestions">
          {collaboratorSuggestions.map((suggestion) => (
            <button
              key={suggestion.userId}
              type="button"
              className="ghost builder-collaborator-suggestion"
              onClick={() => onCollaboratorSuggestionSelect(suggestion)}
            >
              <strong>{suggestion.displayName}</strong>
              <span>
                {suggestion.githubLogin ? `@${suggestion.githubLogin}` : suggestion.email}
              </span>
            </button>
          ))}
        </div>
      )}

      {!collaboratorSearchLoading &&
        collaboratorQuery.trim().length >= 2 &&
        !collaboratorSuggestions.length &&
        !selectedCollaboratorSuggestion && (
        <p className="builder-collaborator-hint">
          No Solidary users found. You can still invite this GitHub username/email.
        </p>
      )}

      <label>
        Access role
        <select
          value={collaboratorRole}
          onChange={(event) => onCollaboratorRoleChange(event.target.value as CollaboratorRole)}
        >
          <option value="viewer">Viewer (read-only)</option>
          <option value="editor">Editor (edit + save)</option>
          <option value="admin">Admin (edit + publish)</option>
        </select>
      </label>

      <button
        className="primary"
        type="button"
        onClick={onInviteCollaborator}
        disabled={invitingCollaborator || !collaboratorQuery.trim()}
      >
        {invitingCollaborator ? "Sending invite..." : "Send invite"}
      </button>
    </div>

    <div className="builder-section builder-collaborator-list-section">
      <div className="section-header">
        <h3>Current collaborators</h3>
        <p>Update collaborator roles or remove access.</p>
      </div>

      {collaboratorsLoading && (
        <p className="builder-collaborator-hint">Loading collaborators...</p>
      )}

      {!collaboratorsLoading && !collaborators.length && (
        <p className="builder-collaborator-hint">No collaborators yet.</p>
      )}

      {!collaboratorsLoading && collaborators.length > 0 && (
        <div className="builder-collaborator-list">
          {collaborators.map((collaborator) => {
            const isUpdating = updatingCollaboratorUserId === collaborator.userId;

            return (
              <div className="builder-collaborator-list-item" key={collaborator.userId}>
                <div className="builder-collaborator-list-meta">
                  <strong>{collaborator.displayName}</strong>
                  <span>
                    {collaborator.githubLogin
                      ? `@${collaborator.githubLogin}`
                      : collaborator.email || collaborator.userId}
                  </span>
                  {collaborator.syncState === "pending_invite" && (
                    <span className="builder-collaborator-status">Invite pending acceptance</span>
                  )}
                </div>
                <div className="builder-collaborator-list-actions">
                  <select
                    value={collaborator.role}
                    onChange={(event) =>
                      onCollaboratorRoleUpdate(
                        collaborator.userId,
                        event.target.value as CollaboratorRole
                      )
                    }
                    disabled={isUpdating}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => onCollaboratorRemove(collaborator.userId)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Working..." : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

export default BuilderContentSection;
