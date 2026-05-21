import type { BuilderTopbarProps } from "../../../chrome/BuilderTopbar";
type BuildTopbarPropsOptions = {
  onRunFormatCommand: BuilderTopbarProps["onRunFormatCommand"];
  onRunFormatLink: BuilderTopbarProps["onRunFormatLink"];
  onUploadFormatImage: BuilderTopbarProps["onUploadFormatImage"];
  onCaptureFormatSelection: BuilderTopbarProps["onCaptureFormatSelection"];
  isFormatImageUploading: boolean;
  maxFormatImageUploadBytes: number;
};

export const buildTopbarProps = ({
  onRunFormatCommand,
  onRunFormatLink,
  onUploadFormatImage,
  onCaptureFormatSelection,
  isFormatImageUploading,
  maxFormatImageUploadBytes
}: BuildTopbarPropsOptions): BuilderTopbarProps => ({
  onRunFormatCommand,
  onRunFormatLink,
  onUploadFormatImage,
  onCaptureFormatSelection,
  isFormatImageUploading,
  maxFormatImageUploadBytes
});
