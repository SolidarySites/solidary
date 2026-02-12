import { useRef, useState, type ReactNode } from "react";

type BuilderEditorToolbarProps = {
  onRunCommand: (command: string, value?: string) => void;
  onRunLink: () => void;
  onUploadImage: (file: File) => Promise<void>;
  uploadingImage: boolean;
  maxImageUploadBytes: number;
  onCaptureSelection: () => void;
};

type IconProps = {
  children: ReactNode;
};

type ToolbarAction = {
  label: string;
  icon: ReactNode;
  onRun: () => void;
};

const Icon = ({ children }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const GlyphIcon = ({ glyph }: { glyph: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <text x="12" y="16" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="currentColor">
      {glyph}
    </text>
  </svg>
);

const AlignLeftIcon = () => (
  <Icon>
    <path d="M5 7h14" />
    <path d="M5 11h10" />
    <path d="M5 15h14" />
    <path d="M5 19h9" />
  </Icon>
);

const AlignCenterIcon = () => (
  <Icon>
    <path d="M5 7h14" />
    <path d="M7 11h10" />
    <path d="M5 15h14" />
    <path d="M8 19h8" />
  </Icon>
);

const AlignRightIcon = () => (
  <Icon>
    <path d="M5 7h14" />
    <path d="M9 11h10" />
    <path d="M5 15h14" />
    <path d="M10 19h9" />
  </Icon>
);

const BulletedListIcon = () => (
  <Icon>
    <circle cx="6" cy="7.5" r="1.2" />
    <circle cx="6" cy="12" r="1.2" />
    <circle cx="6" cy="16.5" r="1.2" />
    <path d="M10 7.5h8" />
    <path d="M10 12h8" />
    <path d="M10 16.5h8" />
  </Icon>
);

const NumberedListIcon = () => (
  <Icon>
    <path d="M5 7h2v4" />
    <path d="M5 11h2" />
    <path d="M5 13.5h2l-2 3h2" />
    <path d="M10 7.5h8" />
    <path d="M10 12h8" />
    <path d="M10 16.5h8" />
  </Icon>
);

const QuoteIcon = () => (
  <Icon>
    <path d="M7 9h4v5H7z" />
    <path d="M13 9h4v5h-4z" />
    <path d="M11 14.5c0 1.9-1.2 3.4-3 3.5" />
    <path d="M17 14.5c0 1.9-1.2 3.4-3 3.5" />
  </Icon>
);

const LinkIcon = () => (
  <Icon>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M8 16a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-.5.5" />
    <path d="M16 8a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 1 1-5-5l.5-.5" />
  </Icon>
);

const ImageIcon = () => (
  <Icon>
    <rect x="4.5" y="6" width="15" height="12" rx="1.5" />
    <circle cx="9" cy="10" r="1.3" />
    <path d="m7 16 3.2-3.2a1.2 1.2 0 0 1 1.7 0L13 14l1.5-1.5a1.2 1.2 0 0 1 1.7 0L18 14.3" />
  </Icon>
);

const ClearIcon = () => (
  <Icon>
    <path d="M4 15h8" />
    <path d="m8 5 8 8" />
    <path d="m14.5 5 4.5 4.5-5 5H8.5L5 11.5 11.5 5z" />
  </Icon>
);

const BuilderEditorToolbar = ({
  onRunCommand,
  onRunLink,
  onUploadImage,
  uploadingImage,
  maxImageUploadBytes,
  onCaptureSelection
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
      <div className="builder-editor-toolbar" role="toolbar" aria-label="Formatting tools">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="builder-toolbar-button"
            aria-label={action.label}
            title={action.label}
            onMouseDown={(event) => {
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
