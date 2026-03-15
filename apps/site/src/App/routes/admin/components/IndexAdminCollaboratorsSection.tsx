import type {
  CollaboratorRole,
  CollaboratorSearchResult,
  ManagedCollaborator
} from "../../studio/routes/site-builder/services/types";

type IndexAdminCollaboratorsSectionProps = {
  owner: CollaboratorSearchResult | null;
  collaboratorQuery: string;
  collaboratorRole: CollaboratorRole;
  collaboratorSuggestions: CollaboratorSearchResult[];
  selectedCollaboratorSuggestion: CollaboratorSearchResult | null;
  collaboratorSearchLoading: boolean;
  collaborators: ManagedCollaborator[];
  collaboratorsLoading: boolean;
  updatingCollaboratorUserId: string | null;
  canManage: boolean;
  onCollaboratorQueryChange: (value: string) => void;
  onCollaboratorRoleChange: (value: CollaboratorRole) => void;
  onCollaboratorSuggestionSelect: (suggestion: CollaboratorSearchResult) => void;
  onInviteCollaborator: () => void;
  onCollaboratorRoleUpdate: (userId: string, role: CollaboratorRole) => void;
  onCollaboratorRemove: (userId: string) => void;
};

export default function IndexAdminCollaboratorsSection({
  owner,
  collaboratorQuery,
  collaboratorRole,
  collaboratorSuggestions,
  selectedCollaboratorSuggestion,
  collaboratorSearchLoading,
  collaborators,
  collaboratorsLoading,
  updatingCollaboratorUserId,
  canManage,
  onCollaboratorQueryChange,
  onCollaboratorRoleChange,
  onCollaboratorSuggestionSelect,
  onInviteCollaborator,
  onCollaboratorRoleUpdate,
  onCollaboratorRemove
}: IndexAdminCollaboratorsSectionProps) {
  return (
    <div className="builder-section">
      <div className="section-header">
        <h2>Collaborators</h2>
        <p>
          These collaborators can access the bridge-backed index admin through Solidary before the
          standalone index has its own local auth.
        </p>
      </div>

      {owner && (
        <div className="builder-collaborator-list-item admin-owner-card">
          <div className="builder-collaborator-list-meta">
            <strong>{owner.displayName}</strong>
            <span>{owner.githubLogin ? `@${owner.githubLogin}` : owner.email}</span>
            <span className="builder-collaborator-status">Owner</span>
          </div>
        </div>
      )}

      <div className="builder-section builder-collaborator-section">
        <label>
          Solidary user
          <input
            value={collaboratorQuery}
            onChange={(event) => onCollaboratorQueryChange(event.target.value)}
            placeholder="Search by name, username, or email"
            disabled={!canManage}
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
                disabled={!canManage}
              >
                <strong>{suggestion.displayName}</strong>
                <span>{suggestion.githubLogin ? `@${suggestion.githubLogin}` : suggestion.email}</span>
              </button>
            ))}
          </div>
        )}

        <label>
          Access role
          <select
            value={collaboratorRole}
            onChange={(event) => onCollaboratorRoleChange(event.target.value as CollaboratorRole)}
            disabled={!canManage}
          >
            <option value="contributor">Contributor</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <button
          className="primary"
          type="button"
          onClick={onInviteCollaborator}
          disabled={!canManage || !selectedCollaboratorSuggestion}
        >
          Add collaborator
        </button>

        {!canManage && (
          <p className="builder-collaborator-hint">
            Only owner/admin roles can change bridge collaborators.
          </p>
        )}
      </div>

      <div className="builder-section builder-collaborator-list-section">
        <div className="section-header">
          <h3>Current collaborators</h3>
          <p>Update bridge roles or remove access.</p>
        </div>

        {collaboratorsLoading && (
          <p className="builder-collaborator-hint">Loading collaborators...</p>
        )}

        {!collaboratorsLoading && !collaborators.length && (
          <p className="builder-collaborator-hint">No additional collaborators yet.</p>
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
                      disabled={!canManage || isUpdating}
                    >
                      <option value="contributor">Contributor</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => onCollaboratorRemove(collaborator.userId)}
                      disabled={!canManage || isUpdating}
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
}
