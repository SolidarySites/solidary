import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import SettingsTopbar from "../studio/routes/site-settings/components/SettingsTopbar";
import IndexAdminAdvancedSection from "./components/IndexAdminAdvancedSection";
import IndexAdminCollaboratorsSection from "./components/IndexAdminCollaboratorsSection";
import IndexAdminConnectionsSection from "./components/IndexAdminConnectionsSection";
import IndexAdminGeneralSection from "./components/IndexAdminGeneralSection";
import IndexAdminSetupPanel from "./components/IndexAdminSetupPanel";
import RootAdminOverviewSection from "./components/RootAdminOverviewSection";
import RootAdminUnlockPanel from "./components/RootAdminUnlockPanel";
import { useAdminRouteController } from "./hooks/useAdminRouteController";
import { useRootAdminRouteController } from "./hooks/useRootAdminRouteController";
import { getRootIndexAdminIndexId, resolveRootIndexAdminIndexId } from "./services/index-admin";
import "../studio/routes/site-builder/SiteBuilderRoute.css";
import "../studio/routes/site-settings/StudioSettingsRoute.css";
import "./AdminRoute.css";

const LoadingState = ({ label }: { label: string }) => (
  <div className="studio-settings-loading" role="status" aria-live="polite">
    <p className="studio-settings-loading-label">{label}</p>
    <div className="studio-settings-loading-grid" aria-hidden="true">
      <div className="studio-settings-loading-block" />
      <div className="studio-settings-loading-block" />
      <div className="studio-settings-loading-block" />
    </div>
  </div>
);

function RootAdminRoutePage({
  rootIndexId,
  rootIndexLoading
}: {
  rootIndexId: string;
  rootIndexLoading: boolean;
}) {
  const controller = useRootAdminRouteController({
    indexId: rootIndexId,
    indexIdLoading: rootIndexLoading
  });
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell builder-shell studio-settings-route admin-route">
      <main className="main-content">
        <div className="admin-route-header">
          <div className="admin-route-header-copy">
            <p className="studio-masthead-label">Root Admin</p>
            <h1>Manage the Solidary root index.</h1>
          </div>

          <div className="admin-route-header-controls">
            {controller.indexIdReady && (
              <p className="builder-collaborator-hint">Index ID: {controller.indexId}</p>
            )}
          </div>
        </div>

        <div className="builder-body is-settings-full">
          <section className="builder-settings-full">
            {!controller.isUnlocked && (
              <RootAdminUnlockPanel
                password={controller.password}
                unlocking={controller.unlocking}
                disabled={!controller.indexIdReady}
                onPasswordChange={controller.onPasswordChange}
                onUnlock={controller.onUnlock}
              />
            )}

            {controller.isUnlocked && controller.state && (
              <>
                <RootAdminOverviewSection state={controller.state} onLogout={controller.onLogout} />
                <SettingsTopbar {...controller.settingsTopbarProps} />
              </>
            )}

            {controller.loading && <LoadingState label="Loading root admin..." />}

            {!controller.loading && controller.state && controller.activeSection === "connections" && (
              <IndexAdminConnectionsSection
                connections={controller.state.connections}
                canManage={controller.state.actor.canManageConnections}
                updatingRequestId={controller.updatingConnectionRequestId}
                onConnectionRequestAction={controller.onConnectionRequestAction}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function ManagedIndexAdminRoutePage() {
  const controller = useAdminRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  const headerTitle =
    controller.state?.index.title || controller.selectedIndex?.title || "Manage your index.";
  const indexIdLabel = controller.selectedArchiveId || controller.state?.index.id || "";

  return (
    <div className="app-shell builder-shell studio-settings-route admin-route">
      <main className="main-content">
        <div className="admin-route-header">
          <div className="admin-route-header-copy">
            <p className="studio-masthead-label">Index Admin</p>
            <h1>{headerTitle}</h1>
          </div>

          <div className="admin-route-header-controls">
            {!controller.bridgeMode && controller.indexes.length > 1 && (
              <label className="builder-delete-site-label">
                Index
                <select
                  value={controller.selectedArchiveId}
                  onChange={(event) => controller.onSelectedArchiveChange(event.target.value)}
                >
                  {controller.indexes.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {indexIdLabel && <p className="builder-collaborator-hint">Index ID: {indexIdLabel}</p>}
          </div>
        </div>

        <div className="builder-body is-settings-full">
          <section className="builder-settings-full">
            {controller.state && (
              <div className="builder-section">
                <div className="section-header">
                  <h2>{controller.state.index.title || "Untitled index"}</h2>
                  <p>
                    {controller.state.index.canonicalUrl || "This index has not published a live URL yet."}
                  </p>
                </div>
              </div>
            )}

            {controller.state && controller.setup && (
              <IndexAdminSetupPanel
                index={controller.state.index}
                setup={controller.setup}
                highlight={controller.createdMode}
                startingFinalization={controller.startingFinalization}
                configuringStandaloneAuth={controller.configuringStandaloneAuth}
                deployingFunctions={controller.deployingFunctions}
                setupLoading={controller.setupLoading}
                githubClientId={controller.githubClientId}
                githubClientSecret={controller.githubClientSecret}
                adminPassword={controller.adminPassword}
                supabasePersonalAccessToken={controller.supabasePersonalAccessToken}
                onGithubClientIdChange={controller.onGithubClientIdChange}
                onGithubClientSecretChange={controller.onGithubClientSecretChange}
                onAdminPasswordChange={controller.onAdminPasswordChange}
                onSupabasePersonalAccessTokenChange={controller.onSupabasePersonalAccessTokenChange}
                onConfigureStandaloneAuth={controller.onConfigureStandaloneAuth}
                onFinalizeIndex={controller.onFinalizeIndex}
                onDeployFunctions={controller.onDeployFunctions}
                onRefreshSetup={controller.onRefreshSetup}
                onCopyValue={controller.onCopyValue}
              />
            )}

            {controller.state && <SettingsTopbar {...controller.settingsTopbarProps} />}

            {(controller.indexesLoading || controller.stateLoading) && (
              <LoadingState label="Loading index admin..." />
            )}

            {!controller.indexesLoading && !controller.stateLoading && !controller.state && (
              <div className="builder-section">
                <p className="builder-collaborator-hint">
                  This index admin could not be loaded. Open an index from Studio and try again.
                </p>
              </div>
            )}

            {!controller.stateLoading && controller.state && controller.activeSection === "general" && (
              <IndexAdminGeneralSection
                title={controller.title}
                description={controller.description}
                siteUrl={controller.state.index.canonicalUrl}
                imagePreview={controller.imagePreview}
                indexLevel={controller.state.index.indexLevel}
                parentIndexUrl={controller.state.index.parentIndexUrl}
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
                updatingRequestId={controller.updatingConnectionRequestId}
                onConnectionRequestAction={controller.onConnectionRequestAction}
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
                index={controller.state.index}
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

export default function AdminRoute() {
  const location = useLocation();
  const requestedIndexId = new URLSearchParams(location.search).get("indexId")?.trim() ?? "";
  const [rootIndexId, setRootIndexId] = useState(() => getRootIndexAdminIndexId());
  const [rootIndexLoading, setRootIndexLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const resolvedRootIndexId = await resolveRootIndexAdminIndexId();
      if (cancelled) return;
      setRootIndexId(resolvedRootIndexId);
      setRootIndexLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (requestedIndexId && rootIndexLoading) {
    return (
      <div className="app-shell builder-shell studio-settings-route admin-route">
        <main className="main-content">
          <div className="builder-body is-settings-full">
            <section className="builder-settings-full">
              <LoadingState label="Loading admin..." />
            </section>
          </div>
        </main>
      </div>
    );
  }

  const isManagedIndexRoute = Boolean(requestedIndexId) && requestedIndexId !== rootIndexId;

  return isManagedIndexRoute
    ? <ManagedIndexAdminRoutePage />
    : <RootAdminRoutePage rootIndexId={rootIndexId} rootIndexLoading={rootIndexLoading} />;
}
