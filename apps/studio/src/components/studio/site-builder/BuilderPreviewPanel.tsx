import type { RefObject } from "react";
import AstroTemplatePreview, {
  type AstroTemplatePreviewHandle,
  type PreviewSelectedImage
} from "../AstroTemplatePreview";
import type { BuilderPage, DraftImageAsset, FooterOptions, HeaderOptions } from "./types";

type BuilderPreviewPanelProps = {
  shouldLoadDraft: boolean;
  isDraftLoading: boolean;
  draftLoadError: string | null;
  canEditContent: boolean;
  readOnlyMessage?: string | null;
  previewRef: RefObject<AstroTemplatePreviewHandle | null>;
  previewBrand: string;
  pages: BuilderPage[];
  draftImages: DraftImageAsset[];
  tokensCss: string;
  homeFallbackBody: string;
  activePreviewSlug: string;
  publishedSiteBaseUrl: string | null;
  header: HeaderOptions;
  footer: FooterOptions;
  onActivePreviewSlugChange: (slug: string) => void;
  onPageBodyChange: (safeSlug: string, body: string) => void;
  onSelectedImageChange: (selectedImage: PreviewSelectedImage | null) => void;
};

const BuilderPreviewPanel = ({
  shouldLoadDraft,
  isDraftLoading,
  draftLoadError,
  canEditContent,
  readOnlyMessage,
  previewRef,
  previewBrand,
  pages,
  draftImages,
  tokensCss,
  homeFallbackBody,
  activePreviewSlug,
  publishedSiteBaseUrl,
  header,
  footer,
  onActivePreviewSlugChange,
  onPageBodyChange,
  onSelectedImageChange
}: BuilderPreviewPanelProps) => (
  <section className="builder-panel">
    {!isDraftLoading && !draftLoadError && readOnlyMessage && (
      <div className="builder-preview-readonly-note">{readOnlyMessage}</div>
    )}

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
        editable={canEditContent}
        previewBrand={previewBrand}
        pages={pages}
        draftImages={draftImages}
        tokensCss={tokensCss}
        homeFallbackBody={homeFallbackBody}
        activePageSlug={activePreviewSlug}
        publishedSiteBaseUrl={publishedSiteBaseUrl}
        header={header}
        footer={footer}
        onActivePageChange={onActivePreviewSlugChange}
        onPageBodyChange={onPageBodyChange}
        onSelectedImageChange={onSelectedImageChange}
      />
    )}
  </section>
);

export default BuilderPreviewPanel;
