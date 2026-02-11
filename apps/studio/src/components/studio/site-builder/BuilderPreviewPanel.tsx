import type { RefObject } from "react";
import AstroTemplatePreview, { type AstroTemplatePreviewHandle } from "../AstroTemplatePreview";
import type { BuilderPage } from "./types";

type BuilderPreviewPanelProps = {
  shouldLoadDraft: boolean;
  isDraftLoading: boolean;
  draftLoadError: string | null;
  previewRef: RefObject<AstroTemplatePreviewHandle | null>;
  previewBrand: string;
  pages: BuilderPage[];
  authorName: string;
  authorEmail: string;
  authorUrl: string;
  tokensCss: string;
  homeFallbackBody: string;
  activePreviewSlug: string;
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
  authorName,
  authorEmail,
  authorUrl,
  tokensCss,
  homeFallbackBody,
  activePreviewSlug,
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
        author={{
          name: authorName,
          email: authorEmail,
          url: authorUrl
        }}
        tokensCss={tokensCss}
        homeFallbackBody={homeFallbackBody}
        activePageSlug={activePreviewSlug}
        onActivePageChange={onActivePreviewSlugChange}
        onPageBodyChange={onPageBodyChange}
      />
    )}
  </section>
);

export default BuilderPreviewPanel;
