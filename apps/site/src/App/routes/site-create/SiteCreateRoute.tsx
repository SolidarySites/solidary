import SiteFooter from "../../components/SiteFooter";
import SiteCreateFormSection from "./components/SiteCreateFormSection";
import SiteCreateProvisioningSection from "./components/SiteCreateProvisioningSection";
import { useSiteCreateRouteController } from "./hooks/useSiteCreateRouteController";
import "./SiteCreateRoute.css";

export default function SiteCreateRoute() {
  const controller = useSiteCreateRouteController();

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
            onSiteTitleChange={controller.onSiteTitleChange}
            onSiteDescriptionChange={controller.onSiteDescriptionChange}
            onSiteImageChange={controller.onSiteImageChange}
            onBackToStudio={controller.onBackToStudio}
            onCreateSite={controller.onCreateSite}
          />
        )}
      </main>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
    </div>
  );
}
