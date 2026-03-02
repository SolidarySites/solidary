import type { BuilderStylesMode, DraftImageAsset, FooterOptions, HeaderOptions } from "../../services/types";

export type PreviewPage = {
  id?: string;
  title: string;
  slug: string;
  body: string;
  javascript?: string;
  showInNav?: boolean;
  isHome?: boolean;
};

export type PreviewSelectedImage = {
  pageSlug: string;
  id: string;
  src: string;
  alt: string;
  caption: string;
  sizePercent: number;
};

export type PreviewSelectedElement = {
  elementId: string;
  pageSlug: string;
  tagName: string;
  className: string;
  inlineStyle: string;
};

export type AstroTemplatePreviewHandle = {
  execCommand: (command: string, value?: string) => void;
  focusEditor: () => void;
  captureSelection: () => void;
  replaceImageSource: (
    previousSrc: string,
    nextSrc: string | null,
    aspectRatioOverride?: number
  ) => void;
  setImageAspectRatioBySource: (source: string, aspectRatio: number) => void;
  updateSelectedImageAlt: (value: string) => void;
  updateSelectedImageCaption: (value: string) => void;
  updateSelectedImageSize: (value: number) => void;
  updateSelectedElementClassName: (value: string, elementId?: string) => void;
  updateSelectedElementInlineStyle: (value: string, elementId?: string) => void;
  clearSelectedImage: () => void;
};

export type AstroTemplatePreviewProps = {
  editable: boolean;
  previewBrand: string;
  pages: PreviewPage[];
  draftImages: DraftImageAsset[];
  tokensCss: string;
  styleMode: BuilderStylesMode;
  advancedStructureCss: string;
  previewStylesCss: string;
  homeFallbackBody: string;
  activePageSlug: string;
  publishedSiteBaseUrl: string | null;
  header: HeaderOptions;
  footer: FooterOptions;
  onActivePageChange: (slug: string) => void;
  onPageBodyChange: (slug: string, body: string) => void;
  onSelectedImageChange?: (selectedImage: PreviewSelectedImage | null) => void;
  onSelectedElementChange?: (selectedElement: PreviewSelectedElement | null) => void;
};

export type ParsedPage = PreviewPage & {
  safeSlug: string;
};

export type SelectedImageState = {
  pageSlug: string;
  id: string;
  src: string;
  alt: string;
  caption: string;
  sizePercent: number;
};

export type FooterSegment = {
  type: "text" | "link";
  text: string;
  href?: string;
};

export type PreviewNavItem = {
  label: string;
  slug: string;
  href: string;
};
