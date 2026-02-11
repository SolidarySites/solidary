import type { RefObject } from "react";
import AstroTemplatePreview, { type AstroTemplatePreviewHandle } from "../AstroTemplatePreview";
import type { BuilderPage, FooterOptions, HeaderOptions } from "./types";

type BuilderPreviewPanelProps = {
  shouldLoadDraft: boolean;
  isDraftLoading: boolean;
  draftLoadError: string | null;
  previewRef: RefObject<AstroTemplatePreviewHandle | null>;
  previewBrand: string;
  pages: BuilderPage[];
  tokensCss: string;
  homeFallbackBody: string;
  activePreviewSlug: string;
  header: HeaderOptions;
  footer: FooterOptions;
  onActivePreviewSlugChange: (slug: string) => void;
  onPageBodyChange: (safeSlug: string, body: string) => void;
};

const BuilderPreviewPanel = ({
  shouldLoadDraft,
  isDraftLoading,
  draftLoadError,
  previewRef,
  previewBrand,
  pages,
  tokensCss,
  homeFallbackBody,
  activePreviewSlug,
  header,
  footer,
  onActivePreviewSlugChange,
  onPageBodyChange
}: BuilderPreviewPanelProps) => (
  <section className="builder-panel">
    {shouldLoadDraft && isDraftLoading && (
      <div className="provisioning">
        <div className="spinner" />
        <h2>Loading draft preview</h2>
        <p>Preparing your saved site content...</p>
      </div>
    )}

    {!isDraftLoading && draftLoadError && (
      <div className="provisioning">
        <h2>Unable to load draft</h2>
        <p>{draftLoadError}</p>
      </div>
    )}

    {!isDraftLoading && !draftLoadError && (
      <AstroTemplatePreview
        ref={previewRef}
        previewBrand={previewBrand}
        pages={pages}
        tokensCss={tokensCss}
        homeFallbackBody={homeFallbackBody}
        activePageSlug={activePreviewSlug}
        header={header}
        footer={footer}
        onActivePageChange={onActivePreviewSlugChange}
        onPageBodyChange={onPageBodyChange}
      />
    )}
  </section>
);

export default BuilderPreviewPanel;
