import type { BuilderTopbarProps } from "../../../chrome/BuilderTopbar";
import type { BuildSiteBuilderViewModelsOptions } from "./types";

type BuildTopbarPropsOptions = Pick<
  BuildSiteBuilderViewModelsOptions,
  "previewEditor" | "maxFormatImageUploadBytes"
>;

export const buildTopbarProps = ({
  previewEditor,
  maxFormatImageUploadBytes
}: BuildTopbarPropsOptions): BuilderTopbarProps => ({
  onRunFormatCommand: previewEditor.runPreviewCommand,
  onRunFormatLink: previewEditor.runPreviewLink,
  onUploadFormatImage: previewEditor.handleInlineImageUpload,
  onCaptureFormatSelection: previewEditor.capturePreviewSelection,
  isFormatImageUploading: previewEditor.uploadingInlineImage,
  maxFormatImageUploadBytes
});
