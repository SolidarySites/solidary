import { useState } from "react";
import type { RepoImageObject, RepoMediaFileEntry } from "../services/media-repo";
import { isProtectedImageObject } from "../services/media-repo";

type MediaFolderNode = {
  path: string;
  name: string;
  folders: Array<{ name: string; path: string }>;
  images: RepoImageObject[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

type BuilderMediaSectionProps = {
  mediaCanonicalBaseUrl: string | null;
  rootFolderNode: MediaFolderNode | null;
  folderNodes: Record<string, MediaFolderNode>;
  imageUsageByKey: Record<string, Array<{ slug: string; title: string }>>;
  fonts: RepoMediaFileEntry[];
  mediaLoading: boolean;
  mediaError: string | null;
  mediaWarning: string | null;
  selectedImageFileNames: string[];
  uploadingImages: boolean;
  removingImageKey: string | null;
  renamingImageKey: string | null;
  selectedFontFileName: string;
  fontFamilyName: string;
  uploadingFont: boolean;
  removingFontPath: string | null;
  onRefresh: () => void;
  onEnsureFolderLoaded: (folderPath: string, folderName: string) => void;
  onImageFilesChange: (files: File[]) => void;
  onUploadImages: () => void;
  onRemoveImageObject: (imageObject: RepoImageObject) => void;
  onRenameImageObject: (imageObject: RepoImageObject, nextTitle: string) => void;
  onFontFileChange: (file: File | null) => void;
  onFontFamilyNameChange: (value: string) => void;
  onUploadFont: () => void;
  onRemoveFont: (entry: RepoMediaFileEntry) => void;
};

const getFilenameStem = (filename: string) => filename.replace(/\.[^/.]+$/, "");

const getDisplayTitle = (imageObject: RepoImageObject) =>
  imageObject.title || getFilenameStem(imageObject.variants[0]?.fileName ?? "image");

const resolveThumbnailSrc = (mediaCanonicalBaseUrl: string | null, publicPath: string) =>
  mediaCanonicalBaseUrl ? `${mediaCanonicalBaseUrl}${publicPath}` : publicPath;

const BuilderMediaSection = ({
  mediaCanonicalBaseUrl,
  rootFolderNode,
  folderNodes,
  imageUsageByKey,
  fonts,
  mediaLoading,
  mediaError,
  mediaWarning,
  selectedImageFileNames,
  uploadingImages,
  removingImageKey,
  renamingImageKey,
  selectedFontFileName,
  fontFamilyName,
  uploadingFont,
  removingFontPath,
  onRefresh,
  onEnsureFolderLoaded,
  onImageFilesChange,
  onUploadImages,
  onRemoveImageObject,
  onRenameImageObject,
  onFontFileChange,
  onFontFamilyNameChange,
  onUploadFont,
  onRemoveFont
}: BuilderMediaSectionProps) => {
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(new Set());
  const [activeImageKey, setActiveImageKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const isImageActionBusy =
    uploadingImages || Boolean(removingImageKey) || Boolean(renamingImageKey);
  const isFontActionBusy = uploadingFont || Boolean(removingFontPath) || isImageActionBusy;

  const toggleFolder = (folderPath: string, folderName: string) => {
    setExpandedFolderPaths((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) {
        next.delete(folderPath);
        return next;
      }
      next.add(folderPath);
      return next;
    });
    onEnsureFolderLoaded(folderPath, folderName);
  };

  const handleSelectImage = (imageObject: RepoImageObject) => {
    if (activeImageKey === imageObject.key) {
      setActiveImageKey(null);
      setRenameDraft("");
      return;
    }
    setActiveImageKey(imageObject.key);
    setRenameDraft(imageObject.title || getFilenameStem(getDisplayTitle(imageObject)));
  };

  const renderImageRow = (imageObject: RepoImageObject) => {
    const isRemoving = removingImageKey === imageObject.key;
    const isRenaming = renamingImageKey === imageObject.key;
    const isProtected = isProtectedImageObject(imageObject);
    const isActive = activeImageKey === imageObject.key;
    const usageEntries = imageUsageByKey[imageObject.key] ?? [];
    const thumbnailSrc = resolveThumbnailSrc(mediaCanonicalBaseUrl, imageObject.thumbnailPublicPath);
    const displayTitle = getDisplayTitle(imageObject);

    return (
      <li key={imageObject.key} className="builder-media-tree-image-row">
        <button
          type="button"
          className="ghost builder-media-image-name-button"
          onClick={() => handleSelectImage(imageObject)}
        >
          {displayTitle}
        </button>
        {isActive && (
          <aside className="builder-media-image-options-box">
            <div className="builder-media-image-options-preview">
              <img src={thumbnailSrc} alt={imageObject.title || displayTitle} loading="lazy" />
            </div>
            <div className="builder-media-image-options-meta">
              <p>
                <strong>Title:</strong> {imageObject.title || displayTitle}
              </p>
              <p>
                <strong>UUID:</strong> {imageObject.uuid ?? "none"}
              </p>
              <p>
                <strong>Files:</strong> {imageObject.variants.length}
              </p>
              <p>
                <strong>Path:</strong> /solidary-media/{imageObject.folderPath || "."}
              </p>
              <p>
                <strong>Used on pages:</strong> {usageEntries.length}
              </p>
              {usageEntries.length > 0 ? (
                <ul className="builder-media-image-usage-list">
                  {usageEntries.map((usage) => (
                    <li key={`${imageObject.key}-${usage.slug}`}>
                      <strong>{usage.title}</strong>
                      <span>{usage.slug}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="builder-format-toolbar-note">Not found in any page figure.</p>
              )}
              {isProtected && (
                <p className="builder-section-lock-note">
                  Protected image. Rename and delete are disabled.
                </p>
              )}
            </div>
            <label className="builder-media-rename-label">
              Rename
              <input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                disabled={isImageActionBusy || isProtected}
              />
            </label>
            <div className="builder-media-image-options-actions">
              <button
                type="button"
                className="ghost"
                disabled={isImageActionBusy || isProtected || !renameDraft.trim()}
                onClick={() => onRenameImageObject(imageObject, renameDraft)}
              >
                {isRenaming ? "Renaming..." : "Rename"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={isImageActionBusy || isProtected}
                onClick={() => onRemoveImageObject(imageObject)}
              >
                {isRemoving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </aside>
        )}
      </li>
    );
  };

  const renderFolderNode = (folderPath: string) => {
    const folderNode = folderNodes[folderPath];
    if (!folderNode) return null;
    const isExpanded = expandedFolderPaths.has(folderPath);

    return (
      <li key={`folder-${folderPath}`} className="builder-media-tree-folder-row">
        <button
          type="button"
          className="ghost builder-media-folder-toggle"
          onClick={() => toggleFolder(folderPath, folderNode.name)}
        >
          <span>{isExpanded ? "▾" : "▸"}</span>
          <span>{folderNode.name}</span>
        </button>
        {isExpanded && (
          <div className="builder-media-folder-children">
            {folderNode.loading && <p className="builder-format-toolbar-note">Loading folder...</p>}
            {folderNode.error && <p className="builder-section-lock-note">{folderNode.error}</p>}
            {!folderNode.loading && folderNode.loaded && (
              <>
                {folderNode.folders.length === 0 && folderNode.images.length === 0 ? (
                  <p className="builder-format-toolbar-note">Folder is empty.</p>
                ) : (
                  <ul className="builder-media-tree-list">
                    {folderNode.folders.map((folder) => renderFolderNode(folder.path))}
                    {folderNode.images.map((imageObject) => renderImageRow(imageObject))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  const rootHasEntries = rootFolderNode
    ? rootFolderNode.folders.length > 0 || rootFolderNode.images.length > 0
    : false;

  return (
    <div className="builder-section builder-media-section">
      <div className="section-header">
        <h2>Media manager</h2>
        <p>Load and manage repository media files directly from GitHub.</p>
      </div>

      <div className="builder-media-status-row">
        <p className="builder-format-toolbar-note">
          {mediaLoading ? "Loading media from repository..." : "Media loaded from repository paths."}
        </p>
        <button type="button" className="ghost" onClick={onRefresh} disabled={mediaLoading || isFontActionBusy}>
          {mediaLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {mediaWarning && <p className="builder-section-lock-note">{mediaWarning}</p>}
      {mediaError && <p className="builder-section-lock-note">{mediaError}</p>}

      <div className="builder-styles-card">
        <div className="section-header">
          <h3>Images</h3>
          <p>
            Browse <code>public/solidary-media</code>. Uploads go to{" "}
            <code>solidary-media/images/uploads</code>.
          </p>
        </div>

        <div className="builder-media-font-upload-grid">
          <label>
            Image files
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={isImageActionBusy}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                onImageFilesChange(files);
                event.currentTarget.value = "";
              }}
            />
            {selectedImageFileNames.length ? (
              <span className="builder-format-toolbar-note">
                Selected: {selectedImageFileNames.join(", ")}
              </span>
            ) : (
              <span className="builder-format-toolbar-note">Choose one or more image files.</span>
            )}
          </label>
          <button
            type="button"
            className="primary"
            onClick={onUploadImages}
            disabled={isImageActionBusy || selectedImageFileNames.length === 0}
          >
            {uploadingImages ? "Uploading..." : "Upload images"}
          </button>
        </div>

        {!rootFolderNode || rootFolderNode.loading ? (
          <p className="builder-format-toolbar-note">Loading folder index...</p>
        ) : !rootHasEntries ? (
          <p className="builder-format-toolbar-note">No image files found.</p>
        ) : (
          <ul className="builder-media-tree-list">
            {rootFolderNode.folders.map((folder) => renderFolderNode(folder.path))}
            {rootFolderNode.images.map((imageObject) => renderImageRow(imageObject))}
          </ul>
        )}
      </div>

      <div className="builder-styles-card">
        <div className="section-header">
          <h3>Fonts</h3>
          <p>
            Upload font packages to <code>public/fonts</code> and sync <code>src/styles/partials/fonts.css</code>.
          </p>
        </div>

        <div className="builder-media-font-upload-grid">
          <label>
            Font family name
            <input
              value={fontFamilyName}
              onChange={(event) => onFontFamilyNameChange(event.target.value)}
              placeholder="Example: Newsreader"
              disabled={isFontActionBusy}
            />
          </label>
          <label>
            Font package
            <input
              type="file"
              accept=".otf,.ttf,.woff,.woff2"
              disabled={isFontActionBusy}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                onFontFileChange(file);
                event.currentTarget.value = "";
              }}
            />
            {selectedFontFileName ? (
              <span className="builder-format-toolbar-note">Selected: {selectedFontFileName}</span>
            ) : (
              <span className="builder-format-toolbar-note">
                Allowed types: OTF, TrueType, WOFF, WOFF2.
              </span>
            )}
          </label>
          <button
            type="button"
            className="primary"
            onClick={onUploadFont}
            disabled={isFontActionBusy || !selectedFontFileName || !fontFamilyName.trim()}
          >
            {uploadingFont ? "Uploading..." : "Upload font"}
          </button>
        </div>

        {fonts.length === 0 ? (
          <p className="builder-format-toolbar-note">No font packages found.</p>
        ) : (
          <ul className="builder-media-list">
            {fonts.map((entry) => {
              const isRemoving = removingFontPath === entry.path;
              return (
                <li key={entry.path} className="builder-media-list-item builder-media-list-item-with-action">
                  <code>{entry.publicPath}</code>
                  <button
                    type="button"
                    className="ghost"
                    disabled={isFontActionBusy}
                    onClick={() => onRemoveFont(entry)}
                  >
                    {isRemoving ? "Removing..." : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default BuilderMediaSection;
