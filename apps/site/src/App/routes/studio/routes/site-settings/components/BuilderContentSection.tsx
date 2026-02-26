import type {
  CollaboratorRole,
  CollaboratorSearchResult,
  ManagedCollaborator
} from "../../site-builder/services/types";
import type { StudioSettingsSection } from "../services/settings-sections";
import CollaboratorsSettingsSection from "./CollaboratorsSettingsSection";
import ConnectionsSettingsSection from "./ConnectionsSettingsSection";
import DangerSettingsSection from "./DangerSettingsSection";
import GeneralSettingsSection from "./GeneralSettingsSection";

type BuilderContentSectionProps = {
  activeSection: StudioSettingsSection;
  activeSectionLockedByOther: boolean;
  activeSectionLockHolderName: string;
  ownerAccess: boolean;
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
  draftId: string | null;
  collaborators: ManagedCollaborator[];
  collaboratorsLoading: boolean;
  updatingCollaboratorUserId: string | null;
  canDeleteSite?: boolean;
  deleteMode?: "builder" | "github" | null;
  deleteConfirmText?: string;
  deleteBusy?: boolean;
  deleteRepoFullName?: string;
  domainActionBusy?: "none" | "github";
  onSiteTitleChange: (value: string) => void;
  onSiteDescriptionChange: (value: string) => void;
  onSiteImageChange: (file: File | null) => void;
  onStudioOnlyDomainUpdate?: (value: string) => void;
  onConnectGithubDomain?: (value: string) => void;
  onCollaboratorQueryChange: (value: string) => void;
  onCollaboratorRoleChange: (value: CollaboratorRole) => void;
  onCollaboratorSuggestionSelect: (suggestion: CollaboratorSearchResult) => void;
  onInviteCollaborator: () => void;
  onCollaboratorRoleUpdate: (userId: string, role: CollaboratorRole) => void;
  onCollaboratorRemove: (userId: string) => void;
  onDeleteModeChange?: (mode: "builder" | "github") => void;
  onDeleteConfirmTextChange?: (value: string) => void;
  onDeleteReset?: () => void;
  onDeleteConfirm?: () => void;
};

const BuilderContentSection = ({
  activeSection,
  activeSectionLockedByOther,
  activeSectionLockHolderName,
  ownerAccess,
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
  draftId,
  collaborators,
  collaboratorsLoading,
  updatingCollaboratorUserId,
  canDeleteSite = false,
  deleteMode = null,
  deleteConfirmText = "",
  deleteBusy = false,
  deleteRepoFullName = "",
  domainActionBusy = "none",
  onSiteTitleChange,
  onSiteDescriptionChange,
  onSiteImageChange,
  onStudioOnlyDomainUpdate,
  onConnectGithubDomain,
  onCollaboratorQueryChange,
  onCollaboratorRoleChange,
  onCollaboratorSuggestionSelect,
  onInviteCollaborator,
  onCollaboratorRoleUpdate,
  onCollaboratorRemove,
  onDeleteModeChange,
  onDeleteConfirmTextChange,
  onDeleteReset,
  onDeleteConfirm
}: BuilderContentSectionProps) => (
  <div className={`builder-section-lock-shell ${activeSectionLockedByOther ? "is-locked" : ""}`.trim()}>
    {activeSectionLockedByOther && (
      <p className="builder-section-lock-note">
        {activeSectionLockHolderName} is editing this section.
      </p>
    )}

    <fieldset className="builder-locked-fieldset" disabled={activeSectionLockedByOther}>
      {activeSection === "general" && (
        <GeneralSettingsSection
          siteTitle={siteTitle}
          siteDescription={siteDescription}
          siteUrl={siteUrl}
          siteImagePreview={siteImagePreview}
          onSiteTitleChange={onSiteTitleChange}
          onSiteDescriptionChange={onSiteDescriptionChange}
          onSiteImageChange={onSiteImageChange}
        />
      )}

      {activeSection === "connections" && (
        <ConnectionsSettingsSection draftId={draftId} />
      )}

      {activeSection === "collaborators" && (
        <CollaboratorsSettingsSection
          collaboratorQuery={collaboratorQuery}
          collaboratorRole={collaboratorRole}
          collaboratorSuggestions={collaboratorSuggestions}
          selectedCollaboratorSuggestion={selectedCollaboratorSuggestion}
          collaboratorSearchLoading={collaboratorSearchLoading}
          invitingCollaborator={invitingCollaborator}
          collaborators={collaborators}
          collaboratorsLoading={collaboratorsLoading}
          updatingCollaboratorUserId={updatingCollaboratorUserId}
          onCollaboratorQueryChange={onCollaboratorQueryChange}
          onCollaboratorRoleChange={onCollaboratorRoleChange}
          onCollaboratorSuggestionSelect={onCollaboratorSuggestionSelect}
          onInviteCollaborator={onInviteCollaborator}
          onCollaboratorRoleUpdate={onCollaboratorRoleUpdate}
          onCollaboratorRemove={onCollaboratorRemove}
        />
      )}

      {activeSection === "danger" && (
        <DangerSettingsSection
          ownerAccess={ownerAccess}
          siteUrl={siteUrl}
          domainActionBusy={domainActionBusy}
          onStudioOnlyDomainUpdate={onStudioOnlyDomainUpdate}
          onConnectGithubDomain={onConnectGithubDomain}
          canDeleteSite={canDeleteSite}
          deleteMode={deleteMode}
          deleteConfirmText={deleteConfirmText}
          deleteBusy={deleteBusy}
          deleteRepoFullName={deleteRepoFullName}
          onDeleteModeChange={onDeleteModeChange}
          onDeleteConfirmTextChange={onDeleteConfirmTextChange}
          onDeleteReset={onDeleteReset}
          onDeleteConfirm={onDeleteConfirm}
        />
      )}
    </fieldset>
  </div>
);

export default BuilderContentSection;
