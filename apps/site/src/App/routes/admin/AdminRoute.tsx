import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import SettingsTopbar from "../studio/routes/site-settings/components/SettingsTopbar";
import IndexAdminAdvancedSection from "./components/IndexAdminAdvancedSection";
import IndexAdminCollaboratorsSection from "./components/IndexAdminCollaboratorsSection";
import IndexAdminConnectionsSection from "./components/IndexAdminConnectionsSection";
import IndexAdminGeneralSection from "./components/IndexAdminGeneralSection";
import IndexAdminSetupPanel from "./components/IndexAdminSetupPanel";
import { useAdminRouteController } from "./hooks/useAdminRouteController";
import "../studio/routes/site-builder/SiteBuilderRoute.css";
import "../studio/routes/site-settings/StudioSettingsRoute.css";
import "./AdminRoute.css";

export default function AdminRoute() {
  const controller = useAdminRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell builder-shell studio-settings-route admin-route">
      <main className="main-content">
        <div className="admin-route-header">
          <div className="admin-route-header-copy">
            <p className="studio-masthead-label">Index Admin</p>
            <h1>Manage the standalone index.</h1>
          </div>

          <div className="admin-route-header-controls">
            <label>
              Index
              <select
                value={controller.selectedArchiveId}
                onChange={(event) => controller.onSelectedArchiveChange(event.target.value)}
                disabled={controller.indexesLoading || !controller.indexes.length}
              >
                {controller.indexes.length ? (
                  controller.indexes.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.title}
                    </option>
                  ))
                ) : (
                  <option value="">No indexes</option>
                )}
              </select>
            </label>
          </div>
        </div>

        {controller.state && (
          <IndexAdminSetupPanel
            archive={controller.state.archive}
            setup={controller.setup}
            highlight={controller.createdMode}
          />
        )}

        <SettingsTopbar {...controller.settingsTopbarProps} />

        <div className="builder-body is-settings-full">
          <section className="builder-settings-full">
            {(controller.indexesLoading || controller.stateLoading) && (
              <div className="studio-settings-loading" role="status" aria-live="polite">
                <p className="studio-settings-loading-label">Loading index admin...</p>
                <div className="studio-settings-loading-grid" aria-hidden="true">
                  <div className="studio-settings-loading-block" />
                  <div className="studio-settings-loading-block" />
                  <div className="studio-settings-loading-block" />
                </div>
              </div>
            )}

            {!controller.indexesLoading && !controller.indexes.length && (
              <div className="builder-section">
                <div className="section-header">
                  <h2>No indexes yet</h2>
                  <p>Create an index from Studio to manage it here.</p>
                </div>
              </div>
            )}

            {!controller.stateLoading && controller.state && controller.activeSection === "general" && (
              <IndexAdminGeneralSection
                title={controller.title}
                description={controller.description}
                siteUrl={controller.state.archive.canonicalUrl}
                imagePreview={controller.imagePreview}
                indexLevel={controller.state.archive.indexLevel}
                parentIndexUrl={controller.state.archive.parentIndexUrl}
                canEdit={controller.state.actor.canEditGeneral}
                saving={controller.savingGeneral}
                onTitleChange={controller.onTitleChange}
                onDescriptionChange={controller.onDescriptionChange}
                onImageChange={controller.onImageChange}
                onSave={controller.onSaveGeneral}
              />
            )}

            {!controller.stateLoading && controller.state && controller.activeSection === "connections" && (
              <IndexAdminConnectionsSection
                connections={controller.state.connections}
                canManage={controller.state.actor.canManageConnections}
                updatingSiteId={controller.updatingConnectionSiteId}
                onConnectionStatusChange={controller.onConnectionStatusChange}
              />
            )}

            {!controller.stateLoading && controller.state && controller.activeSection === "collaborators" && (
              <IndexAdminCollaboratorsSection
                owner={controller.state.owner}
                collaboratorQuery={controller.collaboratorQuery}
                collaboratorRole={controller.collaboratorRole}
                collaboratorSuggestions={controller.collaboratorSuggestions}
                selectedCollaboratorSuggestion={controller.selectedCollaboratorSuggestion}
                collaboratorSearchLoading={controller.collaboratorSearchLoading}
                collaborators={controller.state.collaborators}
                collaboratorsLoading={controller.collaboratorsLoading}
                updatingCollaboratorUserId={controller.updatingCollaboratorUserId}
                canManage={controller.state.actor.canManageCollaborators}
                onCollaboratorQueryChange={controller.onCollaboratorQueryChange}
                onCollaboratorRoleChange={controller.onCollaboratorRoleChange}
                onCollaboratorSuggestionSelect={controller.onCollaboratorSuggestionSelect}
                onInviteCollaborator={controller.onInviteCollaborator}
                onCollaboratorRoleUpdate={controller.onCollaboratorRoleUpdate}
                onCollaboratorRemove={controller.onCollaboratorRemove}
              />
            )}

            {!controller.stateLoading && controller.state && controller.activeSection === "danger" && (
              <IndexAdminAdvancedSection
                archive={controller.state.archive}
                setup={controller.setup}
                domainValue={controller.domainInput}
                saving={controller.savingAdvanced}
                canManage={controller.state.actor.canManageAdvanced}
                onDomainValueChange={controller.onDomainInputChange}
                onSaveDomain={controller.onSaveDomain}
                onResetDomain={controller.onResetDomain}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
