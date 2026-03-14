import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import IndexCreateFormSection from "./components/IndexCreateFormSection";
import IndexCreateProvisioningSection from "./components/IndexCreateProvisioningSection";
import { useIndexCreateRouteController } from "./hooks/useIndexCreateRouteController";
import "./IndexCreateRoute.css";

export default function IndexCreateRoute() {
  const controller = useIndexCreateRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell">
      <main className="main-content">
        {controller.isProvisioning ? (
          <IndexCreateProvisioningSection provisionStep={controller.provisionStep} />
        ) : (
          <IndexCreateFormSection
            title={controller.title}
            description={controller.description}
            imagePreview={controller.imagePreview}
            repoConflict={controller.repoConflict}
            repoCheckInFlight={controller.repoCheckInFlight}
            prerequisites={controller.prerequisites}
            organizations={controller.organizations}
            selectedOrganizationId={controller.selectedOrganizationId}
            statusLoading={controller.statusLoading}
            onTitleChange={controller.onTitleChange}
            onTitleBlur={controller.onTitleBlur}
            onDescriptionChange={controller.onDescriptionChange}
            onImageChange={controller.onImageChange}
            onSelectedOrganizationChange={controller.onSelectedOrganizationChange}
            onBackToStudio={controller.onBackToStudio}
            onOpenProfile={controller.onOpenProfile}
            onCreateIndex={controller.onCreateIndex}
          />
        )}
      </main>
    </div>
  );
}
