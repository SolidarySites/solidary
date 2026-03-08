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

export type BuilderContentSectionProps = {
  settingsAccessBlocked?: boolean;
  settingsAccessBlockedMessage?: string;
  activeSection: StudioSettingsSection;
  activeSectionLockedByOther: boolean;
  activeSectionLockHolderName: string;
  ownerAccess: boolean;
  hasUnsavedSettingsChanges?: boolean;
  canSaveGeneralToLive?: boolean;
  savingGeneralToLive?: boolean;
  canSaveConnectionsToLive?: boolean;
  savingConnectionsToLive?: boolean;
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
  domainDnsFeedback?: {
    domain: string;
    status: "valid" | "invalid" | "pending";
    message: string;
  } | null;
  onSiteTitleChange: (value: string) => void;
  onSiteDescriptionChange: (value: string) => void;
  onSiteImageChange: (file: File | null) => void;
  onSaveGeneralToLive?: () => void;
  onSaveConnectionsToLive?: () => void;
  onStudioOnlyDomainUpdate?: (value: string) => void;
  onConnectGithubDomain?: (value: string) => void;
  onRecheckGithubDomain?: (value: string) => void;
  onRemoveProposedGithubDomain?: (value: string) => void;
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
  settingsAccessBlocked = false,
  settingsAccessBlockedMessage = "Your current role can edit the site builder, but cannot access this settings page.",
  activeSection,
  activeSectionLockedByOther,
  activeSectionLockHolderName,
  ownerAccess,
  hasUnsavedSettingsChanges = false,
  canSaveGeneralToLive = false,
  savingGeneralToLive = false,
  canSaveConnectionsToLive = false,
  savingConnectionsToLive = false,
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
  domainDnsFeedback = null,
  onSiteTitleChange,
  onSiteDescriptionChange,
  onSiteImageChange,
  onSaveGeneralToLive,
  onSaveConnectionsToLive,
  onStudioOnlyDomainUpdate,
  onConnectGithubDomain,
  onRecheckGithubDomain,
  onRemoveProposedGithubDomain,
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
    {settingsAccessBlocked && (
      <p className="builder-collaborator-hint">
        {settingsAccessBlockedMessage}
      </p>
    )}

    {activeSectionLockedByOther && (
      <p className="builder-section-lock-note">
        {activeSectionLockHolderName} is editing this section.
      </p>
    )}

    <fieldset
      className="builder-locked-fieldset"
      disabled={activeSectionLockedByOther || settingsAccessBlocked}
    >
      {activeSection === "general" && (
        <GeneralSettingsSection
          siteTitle={siteTitle}
          siteDescription={siteDescription}
          siteUrl={siteUrl}
          siteImagePreview={siteImagePreview}
          canSaveToLive={canSaveGeneralToLive}
          savingToLive={savingGeneralToLive}
          hasUnsavedChanges={hasUnsavedSettingsChanges}
          onSiteTitleChange={onSiteTitleChange}
          onSiteDescriptionChange={onSiteDescriptionChange}
          onSiteImageChange={onSiteImageChange}
          onSaveToLive={() => onSaveGeneralToLive?.()}
        />
      )}

      {activeSection === "connections" && (
        <ConnectionsSettingsSection
          draftId={draftId}
          canSaveToLive={canSaveConnectionsToLive}
          savingToLive={savingConnectionsToLive}
          onSaveToLive={() => onSaveConnectionsToLive?.()}
        />
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
          domainDnsFeedback={domainDnsFeedback}
          onStudioOnlyDomainUpdate={onStudioOnlyDomainUpdate}
          onConnectGithubDomain={onConnectGithubDomain}
          onRecheckGithubDomain={onRecheckGithubDomain}
          onRemoveProposedGithubDomain={onRemoveProposedGithubDomain}
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
