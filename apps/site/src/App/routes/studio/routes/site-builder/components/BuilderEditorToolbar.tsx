import { useRef, useState, type ReactNode } from "react";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BulletedListIcon,
  ClearIcon,
  GlyphIcon,
  ImageIcon,
  LinkIcon,
  NumberedListIcon,
  QuoteIcon
} from "./BuilderToolbarIcons";

type BuilderEditorToolbarProps = {
  onRunCommand: (command: string, value?: string) => void;
  onRunLink: () => void;
  onUploadImage: (file: File) => Promise<void>;
  uploadingImage: boolean;
  maxImageUploadBytes: number;
  onCaptureSelection: () => void;
  orientation?: "horizontal" | "vertical";
};

type ToolbarAction = {
  label: string;
  icon: ReactNode;
  onRun: () => void;
};

const BuilderEditorToolbar = ({
  onRunCommand,
  onRunLink,
  onUploadImage,
  uploadingImage,
  maxImageUploadBytes,
  onCaptureSelection,
  orientation = "horizontal"
}: BuilderEditorToolbarProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageMode, setImageMode] = useState<"url" | "upload">("url");
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const maxSizeMb = Math.floor(maxImageUploadBytes / (1024 * 1024));

  const openImageDialog = () => {
    onCaptureSelection();
    setShowImageDialog(true);
    setImageMode("url");
    setImageUrl("");
    setImageError(null);
  };

  const closeImageDialog = () => {
    if (uploadingImage) return;
    setShowImageDialog(false);
    setImageMode("url");
    setImageUrl("");
    setImageError(null);
  };

  const handleUrlInsert = () => {
    const normalizedImageUrl = imageUrl.trim();
    if (!normalizedImageUrl) {
      setImageError("Enter an image URL.");
      return;
    }
    onRunCommand("insertImage", normalizedImageUrl);
    closeImageDialog();
  };

  const actions: ToolbarAction[] = [
    {
      label: "Paragraph",
      icon: <GlyphIcon glyph="p" />,
      onRun: () => onRunCommand("formatBlock", "p")
    },
    {
      label: "Heading 1",
      icon: <GlyphIcon glyph="H1" />,
      onRun: () => onRunCommand("formatBlock", "h1")
    },
    {
      label: "Heading 2",
      icon: <GlyphIcon glyph="H2" />,
      onRun: () => onRunCommand("formatBlock", "h2")
    },
    {
      label: "Heading 3",
      icon: <GlyphIcon glyph="H3" />,
      onRun: () => onRunCommand("formatBlock", "h3")
    },
    {
      label: "Bold",
      icon: <GlyphIcon glyph="B" />,
      onRun: () => onRunCommand("bold")
    },
    {
      label: "Italic",
      icon: <GlyphIcon glyph="I" />,
      onRun: () => onRunCommand("italic")
    },
    {
      label: "Underline",
      icon: <GlyphIcon glyph="U" />,
      onRun: () => onRunCommand("underline")
    },
    {
      label: "Align left",
      icon: <AlignLeftIcon />,
      onRun: () => onRunCommand("justifyLeft")
    },
    {
      label: "Align center",
      icon: <AlignCenterIcon />,
      onRun: () => onRunCommand("justifyCenter")
    },
    {
      label: "Align right",
      icon: <AlignRightIcon />,
      onRun: () => onRunCommand("justifyRight")
    },
    {
      label: "Bulleted list",
      icon: <BulletedListIcon />,
      onRun: () => onRunCommand("insertUnorderedList")
    },
    {
      label: "Numbered list",
      icon: <NumberedListIcon />,
      onRun: () => onRunCommand("insertOrderedList")
    },
    {
      label: "Quote",
      icon: <QuoteIcon />,
      onRun: () => onRunCommand("formatBlock", "blockquote")
    },
    {
      label: "Link",
      icon: <LinkIcon />,
      onRun: () => {
        onCaptureSelection();
        onRunLink();
      }
    },
    {
      label: "Insert image",
      icon: <ImageIcon />,
      onRun: openImageDialog
    },
    {
      label: "Clear formatting",
      icon: <ClearIcon />,
      onRun: () => onRunCommand("clearAllFormatting")
    }
  ];

  return (
    <>
      <div
        className={`builder-editor-toolbar ${orientation === "vertical" ? "is-vertical" : ""}`.trim()}
        role="toolbar"
        aria-label="Formatting tools"
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="builder-toolbar-button"
            aria-label={action.label}
            title={action.label}
            onPointerDown={(event) => {
              event.preventDefault();
              action.onRun();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              action.onRun();
            }}
          >
            {action.icon}
          </button>
        ))}
      </div>

      {showImageDialog && (
        <div className="builder-image-dialog" role="dialog" aria-label="Insert image">
          <div className="builder-image-dialog-modes">
            <button
              type="button"
              className={imageMode === "url" ? "primary" : "ghost"}
              onClick={() => {
                setImageMode("url");
                setImageError(null);
              }}
              disabled={uploadingImage}
            >
              Paste URL
            </button>
            <button
              type="button"
              className={imageMode === "upload" ? "primary" : "ghost"}
              onClick={() => {
                setImageMode("upload");
                setImageError(null);
              }}
              disabled={uploadingImage}
            >
              Upload from computer
            </button>
          </div>

          {imageMode === "url" ? (
            <label className="builder-image-dialog-field">
              Image URL
              <input
                value={imageUrl}
                onChange={(event) => {
                  setImageUrl(event.target.value);
                  setImageError(null);
                }}
                placeholder="https://example.com/image.jpg"
                disabled={uploadingImage}
              />
            </label>
          ) : (
            <div className="builder-image-dialog-upload">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? "Uploading..." : "Choose image"}
              </button>
              <p>{`Max upload size: ${maxSizeMb} MB`}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="builder-editor-image-input"
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  setImageError(null);
                  try {
                    await onUploadImage(file);
                    closeImageDialog();
                  } catch (caught) {
                    const message =
                      caught instanceof Error ? caught.message : "Failed to upload image.";
                    setImageError(message);
                  }
                }}
              />
            </div>
          )}

          {imageError && <p className="builder-image-dialog-error">{imageError}</p>}

          <div className="builder-image-dialog-actions">
            <button type="button" className="ghost" onClick={closeImageDialog} disabled={uploadingImage}>
              Cancel
            </button>
            {imageMode === "url" && (
              <button type="button" className="primary" onClick={handleUrlInsert}>
                Insert
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default BuilderEditorToolbar;
