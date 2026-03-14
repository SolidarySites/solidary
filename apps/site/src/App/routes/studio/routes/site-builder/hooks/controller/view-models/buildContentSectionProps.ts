import type { CollaboratorRole } from "../../../services/types";
import type { BuildSiteBuilderViewModelsOptions, BuilderContentSectionBaseProps } from "./types";

type BuildContentSectionPropsOptions = Pick<
  BuildSiteBuilderViewModelsOptions,
  | "documentState"
  | "collaborators"
  | "canDeleteSite"
  | "deleteSiteRepoFullName"
  | "liveSettings"
  | "hasUnsavedChanges"
>;

export const buildContentSectionProps = ({
  documentState,
  collaborators,
  canDeleteSite,
  deleteSiteRepoFullName,
  liveSettings,
  hasUnsavedChanges
}: BuildContentSectionPropsOptions): BuilderContentSectionBaseProps => ({
  siteTitle: documentState.siteTitle,
  siteDescription: documentState.siteDescription,
  siteUrl: documentState.siteUrl,
  siteImagePreview: documentState.siteImagePreview,
  dynamicImageLoadingEnabled: documentState.dynamicImageLoadingEnabled,
  collaboratorQuery: collaborators.collaboratorQuery,
  collaboratorRole: collaborators.collaboratorRole,
  collaboratorSuggestions: collaborators.collaboratorSuggestions,
  selectedCollaboratorSuggestion: collaborators.selectedCollaboratorSuggestion,
  collaboratorSearchLoading: collaborators.collaboratorSearchLoading,
  invitingCollaborator: collaborators.invitingCollaborator,
  collaborators: collaborators.managedCollaborators,
  collaboratorsLoading: collaborators.managedCollaboratorsLoading,
  updatingCollaboratorUserId: collaborators.updatingCollaboratorUserId,
  canDeleteSite,
  deleteMode: liveSettings.deleteMode,
  deleteConfirmText: liveSettings.deleteConfirmText,
  deleteBusy: liveSettings.deleteBusy,
  deleteRepoFullName: deleteSiteRepoFullName,
  domainActionBusy: liveSettings.domainActionBusy,
  domainDnsFeedback: liveSettings.domainDnsFeedback,
  showGithubPagesDomainConnect: liveSettings.showGithubPagesDomainConnect,
  canResetGitHubPagesDomain: liveSettings.canResetGitHubPagesDomain,
  resetGitHubPagesUrl: liveSettings.defaultGitHubPagesUrl,
  canSaveGeneralToLive: liveSettings.canSaveGeneralSettingsToLive,
  savingGeneralToLive: liveSettings.savingGeneralSettingsToLive,
  canSaveConnectionsToLive: liveSettings.canSaveConnectionsSettingsToLive,
  savingConnectionsToLive: liveSettings.savingConnectionsToLive,
  hasUnsavedSettingsChanges: hasUnsavedChanges,
  onSiteTitleChange: documentState.setSiteTitle,
  onSiteDescriptionChange: documentState.setSiteDescription,
  onDynamicImageLoadingChange: documentState.setDynamicImageLoadingEnabled,
  onSiteImageChange: documentState.setSiteImage,
  onSaveGeneralToLive: () => {
    void liveSettings.saveGeneralSettingsToLive();
  },
  onSaveConnectionsToLive: liveSettings.saveConnectionsToLive,
  onStudioOnlyDomainUpdate: liveSettings.handleStudioOnlyDomainUpdate,
  onConnectGithubDomain: (value: string) => {
    void liveSettings.handleConnectGithubDomain(value);
  },
  onRecheckGithubDomain: (value: string) => {
    void liveSettings.handleRecheckGithubDomain(value);
  },
  onResetGithubDomain: () => {
    void liveSettings.handleResetGithubDomain();
  },
  onCollaboratorQueryChange: collaborators.handleCollaboratorQueryChange,
  onCollaboratorRoleChange: collaborators.setCollaboratorRole,
  onCollaboratorSuggestionSelect: collaborators.handleCollaboratorSuggestionSelect,
  onInviteCollaborator: () => {
    void collaborators.handleInviteCollaborator();
  },
  onCollaboratorRoleUpdate: (collaboratorUserId: string, role: CollaboratorRole) => {
    void collaborators.handleCollaboratorRoleUpdate(collaboratorUserId, role);
  },
  onCollaboratorRemove: (collaboratorUserId: string) => {
    void collaborators.handleCollaboratorRemove(collaboratorUserId);
  },
  onDeleteModeChange: (nextMode: "builder" | "github") => {
    liveSettings.setDeleteMode(nextMode);
    if (nextMode !== "github") {
      liveSettings.setDeleteConfirmText("");
    }
  },
  onDeleteConfirmTextChange: liveSettings.setDeleteConfirmText,
  onDeleteReset: () => {
    if (liveSettings.deleteBusy) return;
    liveSettings.setDeleteMode(null);
    liveSettings.setDeleteConfirmText("");
  },
  onDeleteConfirm: () => {
    void liveSettings.handleDeleteSite();
  }
});
