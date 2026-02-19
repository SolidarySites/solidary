import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import BuilderContentSection from "./components/BuilderContentSection";
import BuilderPreviewPanel from "./components/BuilderPreviewPanel";
import BuilderSidebar from "./components/BuilderSidebar";
import BuilderTopbar from "./components/BuilderTopbar";
import { useSiteBuilderRouteController } from "./hooks/useSiteBuilderRouteController";

export default function SiteBuilderRoute() {
  const controller = useSiteBuilderRouteController();

  return (
    <div className="app-shell builder-shell">
      <SiteHeader />

      <BuilderTopbar {...controller.topbarProps} />

      <div className={controller.bodyClassName}>
        {controller.showMetadataFullView ? (
          <section className="builder-settings-full">
            <div
              className={`builder-section-lock-shell ${
                controller.metadataLockedByOther ? "is-locked" : ""
              }`.trim()}
            >
              {controller.metadataLockedByOther && (
                <p className="builder-section-lock-note">
                  {controller.metadataLockHolderName} is editing this section.
                </p>
              )}
              <fieldset className="builder-locked-fieldset" disabled={controller.metadataLockedByOther}>
                <BuilderContentSection {...controller.contentSectionProps} />
              </fieldset>
            </div>
          </section>
        ) : (
          <>
            {!controller.isPreviewFullscreen && <BuilderSidebar {...controller.sidebarProps} />}
            <BuilderPreviewPanel {...controller.previewPanelProps} />
          </>
        )}
      </div>

      <SiteFooter notice={controller.notice} noticeKind={controller.noticeKind} />
    </div>
  );
}
