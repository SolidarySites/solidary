import { useSyncRouteNotice } from "../../features/site-notice/hooks/useSyncRouteNotice";
import SiteCreateFormSection from "./components/SiteCreateFormSection";
import SiteCreateProvisioningSection from "./components/SiteCreateProvisioningSection";
import { useSiteCreateRouteController } from "./hooks/useSiteCreateRouteController";
import "./SiteCreateRoute.css";

export default function SiteCreateRoute() {
  const controller = useSiteCreateRouteController();
  useSyncRouteNotice({
    notice: controller.notice,
    noticeKind: controller.noticeKind
  });

  return (
    <div className="app-shell">
      <main className="main-content">
        {controller.isProvisioning ? (
          <SiteCreateProvisioningSection provisionStep={controller.provisionStep} />
        ) : (
          <SiteCreateFormSection
            siteTitle={controller.siteTitle}
            siteDescription={controller.siteDescription}
            siteImagePreview={controller.siteImagePreview}
            siteTitleRepoConflict={controller.siteTitleRepoConflict}
            siteTitleRepoCheckInFlight={controller.siteTitleRepoCheckInFlight}
            onSiteTitleChange={controller.onSiteTitleChange}
            onSiteTitleBlur={controller.onSiteTitleBlur}
            onSiteDescriptionChange={controller.onSiteDescriptionChange}
            onSiteImageChange={controller.onSiteImageChange}
            onBackToStudio={controller.onBackToStudio}
            onCreateSite={controller.onCreateSite}
          />
        )}
      </main>
    </div>
  );
}
