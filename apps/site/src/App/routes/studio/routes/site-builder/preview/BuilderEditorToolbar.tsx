import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
} from "../chrome/BuilderToolbarIcons";
import type {
  BuilderImageFormatConversion,
  BuilderImageUploadOptions
} from "../services/types";

type BuilderEditorToolbarProps = {
  onRunCommand: (command: string, value?: string) => void;
  onRunLink: () => void;
  onUploadImage: (file: File, options: BuilderImageUploadOptions) => Promise<void>;
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
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [noCompression, setNoCompression] = useState(false);
  const [convertFormat, setConvertFormat] = useState<BuilderImageFormatConversion>("none");
  const [stagedImageFile, setStagedImageFile] = useState<File | null>(null);
  const [stagedImagePreviewUrl, setStagedImagePreviewUrl] = useState<string | null>(null);
  const maxSizeMb = Math.floor(maxImageUploadBytes / (1024 * 1024));

  useEffect(
    () => () => {
      if (stagedImagePreviewUrl) {
        URL.revokeObjectURL(stagedImagePreviewUrl);
      }
    },
    [stagedImagePreviewUrl]
  );

  const clearStagedImage = () => {
    setStagedImageFile(null);
    setStagedImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const openImageDialog = () => {
    onCaptureSelection();
    setShowImageDialog(true);
    setImageUrl("");
    setImageError(null);
    setNoCompression(false);
    setConvertFormat("none");
    clearStagedImage();
  };

  const closeImageDialog = () => {
    if (uploadingImage) return;
    setShowImageDialog(false);
    setImageUrl("");
    setImageError(null);
    setNoCompression(false);
    setConvertFormat("none");
    clearStagedImage();
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

  const handleStagedImageInsert = async () => {
    if (!stagedImageFile) {
      setImageError("Select an image to insert.");
      return;
    }
    setImageError(null);
    try {
      await onUploadImage(stagedImageFile, {
        noCompression,
        convertFormat
      });
      closeImageDialog();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to upload image.";
      setImageError(message);
    }
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

  const imageDialog = showImageDialog ? (
    <div
      className="builder-image-dialog-overlay"
      onMouseDown={() => {
        closeImageDialog();
      }}
    >
      <div
        className="builder-image-dialog"
        role="dialog"
        aria-label="Insert image"
        aria-modal="true"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="builder-image-dialog-header">
          <h3>Insert image</h3>
          <button type="button" className="ghost" onClick={closeImageDialog} disabled={uploadingImage}>
            Close
          </button>
        </div>

        <label className="builder-image-dialog-field">
          Upload
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setImageError(null);
              setStagedImageFile(file);
              setStagedImagePreviewUrl((current) => {
                if (current) URL.revokeObjectURL(current);
                return URL.createObjectURL(file);
              });
            }}
            disabled={uploadingImage}
          />
        </label>
        <p className="builder-image-dialog-hint">{`Max upload size: ${maxSizeMb} MB`}</p>
        {stagedImageFile && stagedImagePreviewUrl && (
          <div className="builder-image-dialog-preview">
            <p>{stagedImageFile.name}</p>
            <img src={stagedImagePreviewUrl} alt="Selected image preview" />
          </div>
        )}

        <details className="builder-image-dialog-dropdown">
          <summary>Paste external link</summary>
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
          <div className="builder-image-dialog-actions">
            <button type="button" className="ghost" onClick={closeImageDialog} disabled={uploadingImage}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={handleUrlInsert} disabled={uploadingImage}>
              Insert
            </button>
          </div>
        </details>

        <details className="builder-image-dialog-dropdown">
          <summary>Advanced</summary>
          <label className="builder-image-dialog-checkbox">
            <input
              type="checkbox"
              checked={noCompression}
              onChange={(event) => setNoCompression(event.target.checked)}
              disabled={uploadingImage}
            />
            No compression
          </label>
          <label className="builder-image-dialog-field">
            Convert format
            <select
              value={convertFormat}
              onChange={(event) =>
                setConvertFormat(event.target.value as BuilderImageFormatConversion)
              }
              disabled={uploadingImage}
            >
              <option value="none">Off (keep original)</option>
              <option value="webp">WebP</option>
              <option value="jpg">JPG</option>
            </select>
          </label>
        </details>

        {imageError && <p className="builder-image-dialog-error">{imageError}</p>}

        <div className="builder-image-dialog-actions">
          <button type="button" className="ghost" onClick={clearStagedImage} disabled={uploadingImage}>
            Clear image
          </button>
          <button type="button" className="ghost" onClick={closeImageDialog} disabled={uploadingImage}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void handleStagedImageInsert();
            }}
            disabled={uploadingImage || !stagedImageFile}
          >
            {uploadingImage ? "Inserting..." : "Insert"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

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

      {imageDialog &&
        (typeof document !== "undefined" ? createPortal(imageDialog, document.body) : imageDialog)}
    </>
  );
};

export default BuilderEditorToolbar;
