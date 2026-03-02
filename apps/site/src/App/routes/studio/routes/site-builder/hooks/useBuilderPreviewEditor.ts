import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  AstroTemplatePreviewHandle,
  PreviewSelectedElement,
  PreviewSelectedImage
} from "../components/AstroTemplatePreview";
import {
  BYTES_1_MB,
  processImageVariantsFromOriginal
} from "../../../../../services/image-processing/picsquish";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  SITE_DRAFT_IMAGES_BUCKET,
  SOLIDARY_MEDIA_PAGE_IMAGES_BASE_PATH
} from "../services/draft-utils";
import type {
  BuilderImageUploadOptions,
  DraftImageAsset,
  DraftState
} from "../services/types";
import { supabase } from "../../../../../lib/supabase";
import { sanitizeFilename } from "../../../../../services/filename-sanitizer";
import type { NoticeKind } from "../../../../../types/notice";

type UseBuilderPreviewEditorParams = {
  canEditPageContent: boolean;
  session: Session | null;
  draftState: DraftState | null;
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
  setDraftImages: Dispatch<SetStateAction<DraftImageAsset[]>>;
};

type UploadFormat = "image/jpeg" | "image/png" | "image/webp";

type UploadVariantKey = "original" | "medium" | "small";

type UploadVariant = {
  key: UploadVariantKey;
  blob: Blob;
};

const TARGET_MEDIUM_RATIO = 0.5;
const TARGET_SMALL_RATIO = 0.1;

const MIME_EXTENSION_MAP: Record<UploadFormat, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const MANAGED_VARIANT_SUFFIX_PATTERN = /_[a-f0-9]{10}_(original|medium|small)$/i;

const normalizeMimeType = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "image/jpg" || normalized === "image/pjpeg") return "image/jpeg";
  return normalized;
};

const resolveUploadFormat = (mimeType: string): UploadFormat => {
  const normalized = normalizeMimeType(mimeType);
  if (normalized === "image/jpeg") return "image/jpeg";
  if (normalized === "image/webp") return "image/webp";
  return "image/png";
};

const getOutputFormatPreference = (
  convertFormat: BuilderImageUploadOptions["convertFormat"]
): "preserve" | "image/jpeg" | "image/webp" => {
  if (convertFormat === "jpg") return "image/jpeg";
  if (convertFormat === "webp") return "image/webp";
  return "preserve";
};

const createImageToken = () => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").slice(0, 10);
};

const clampBytes = (value: number) => Math.max(1, Math.floor(value));

const resolveImageAspectRatio = async (blob: Blob): Promise<number | null> => {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const aspectRatio = await new Promise<number | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          resolve(image.naturalWidth / image.naturalHeight);
          return;
        }
        resolve(null);
      };
      image.onerror = () => resolve(null);
      image.src = objectUrl;
    });
    if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      return null;
    }
    return aspectRatio;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const readFileAsDataUrl = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.trim()) {
        resolve(result);
        return;
      }
      reject(new Error("Failed to read image preview data."));
    };
    reader.onerror = () => {
      reject(new Error("Failed to read image preview data."));
    };
    reader.readAsDataURL(file);
  });

const buildProcessedVariants = async ({
  file,
  options
}: {
  file: File;
  options: BuilderImageUploadOptions;
}): Promise<{
  outputFormat: UploadFormat;
  variants: UploadVariant[];
}> => {
  const originalTargetBytes =
    !options.noCompression && file.size > BYTES_1_MB ? BYTES_1_MB : clampBytes(file.size);

  const originalResult = await processImageVariantsFromOriginal({
    sourceImage: file,
    sourceMimeType: file.type,
    outputFormat: getOutputFormatPreference(options.convertFormat),
    variants: [
      {
        key: "original",
        label: "Original image",
        maxBytes: originalTargetBytes
      }
    ],
    jpegQuality: 0.9,
    jpegDpi: 72,
    minDimensionLimit: 64,
    maxDimensionAttempts: 30
  });

  const originalBlob = originalResult.original;
  const mediumTargetBytes = clampBytes(originalBlob.size * TARGET_MEDIUM_RATIO);
  const smallTargetBytes = clampBytes(originalBlob.size * TARGET_SMALL_RATIO);

  const scaledResult = await processImageVariantsFromOriginal({
    sourceImage: originalBlob,
    sourceMimeType: originalBlob.type || file.type,
    outputFormat: "preserve",
    variants: [
      {
        key: "medium",
        label: "Medium image",
        maxBytes: mediumTargetBytes
      },
      {
        key: "small",
        label: "Small image",
        maxBytes: smallTargetBytes
      }
    ],
    jpegQuality: 0.9,
    jpegDpi: 72,
    minDimensionLimit: 64,
    maxDimensionAttempts: 30
  });

  const outputFormat = resolveUploadFormat(originalBlob.type || file.type);

  return {
    outputFormat,
    variants: [
      {
        key: "original",
        blob: originalBlob
      },
      {
        key: "medium",
        blob: scaledResult.medium
      },
      {
        key: "small",
        blob: scaledResult.small
      }
    ]
  };
};

export const useBuilderPreviewEditor = ({
  canEditPageContent,
  session,
  draftState,
  setNotice,
  setNoticeKind,
  setDraftImages
}: UseBuilderPreviewEditorParams) => {
  const [selectedEditorImage, setSelectedEditorImage] = useState<PreviewSelectedImage | null>(null);
  const [selectedEditorElement, setSelectedEditorElement] =
    useState<PreviewSelectedElement | null>(null);
  const previewRef = useRef<AstroTemplatePreviewHandle | null>(null);

  const resetNotices = () => {
    setNotice(null);
    setNoticeKind(null);
  };

  const runPreviewCommand = (command: string, value?: string) => {
    if (!canEditPageContent) return;
    previewRef.current?.execCommand(command, value);
  };

  const runPreviewLink = () => {
    if (!canEditPageContent) return;
    const url = window.prompt("Link URL");
    if (!url) return;
    previewRef.current?.execCommand("createLink", url);
  };

  const capturePreviewSelection = () => {
    previewRef.current?.captureSelection();
  };

  const handleSelectedEditorImageAltChange = (value: string) => {
    setSelectedEditorImage((current) => (current ? { ...current, alt: value } : current));
    previewRef.current?.updateSelectedImageAlt(value);
  };

  const handleSelectedEditorImageCaptionChange = (value: string) => {
    setSelectedEditorImage((current) => (current ? { ...current, caption: value } : current));
    previewRef.current?.updateSelectedImageCaption(value);
  };

  const handleSelectedEditorImageSizeChange = (value: number) => {
    const clamped = Math.min(100, Math.max(1, Number.isNaN(value) ? 100 : Math.round(value)));
    setSelectedEditorImage((current) =>
      current ? { ...current, sizePercent: clamped } : current
    );
    previewRef.current?.updateSelectedImageSize(clamped);
  };

  const handleSelectedEditorElementClassNameChange = (value: string, elementId?: string) => {
    setSelectedEditorElement((current) =>
      current && (!elementId || current.elementId === elementId)
        ? { ...current, className: value }
        : current
    );
    previewRef.current?.updateSelectedElementClassName(value, elementId);
  };

  const handleSelectedEditorElementInlineStyleChange = (value: string, elementId?: string) => {
    setSelectedEditorElement((current) =>
      current && (!elementId || current.elementId === elementId)
        ? { ...current, inlineStyle: value }
        : current
    );
    previewRef.current?.updateSelectedElementInlineStyle(value, elementId);
  };

  const clearSelectedEditorImage = () => {
    setSelectedEditorImage(null);
    setSelectedEditorElement(null);
  };

  const handleInlineImageUpload = async (
    file: File,
    options: BuilderImageUploadOptions
  ): Promise<void> => {
    resetNotices();

    if (!canEditPageContent) {
      const message = "Open Pages and make sure the section lock is available to edit content.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!file.type.startsWith("image/")) {
      const message = "Select an image file to insert.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      const message = "Image is too large. Max upload size is 10 MB.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!session) {
      const message = "Sign in with GitHub to upload images.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!draftState) {
      const message = "Create or load a draft before uploading images.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    const sanitizedBaseName = sanitizeFilename(file.name, {
      fallback: "image",
      stripExtension: true,
      stripPattern: MANAGED_VARIANT_SUFFIX_PATTERN,
      lowercase: true,
      spaces: "underscore"
    });
    const uniqueToken = createImageToken();
    const imageAspectRatio = await resolveImageAspectRatio(file);

    const localPreviewUrl = await readFileAsDataUrl(file);
    previewRef.current?.execCommand("insertImage", localPreviewUrl);
    if (imageAspectRatio) {
      previewRef.current?.setImageAspectRatioBySource(localPreviewUrl, imageAspectRatio);
    }

    void (async () => {
      const uploadedStoragePaths: string[] = [];

      try {
        const processed = await buildProcessedVariants({
          file,
          options
        });
        const extension = MIME_EXTENSION_MAP[processed.outputFormat];
        const uploadedAt = new Date().toISOString();

        const uploadedAssets: DraftImageAsset[] = [];
        let originalPublicUrl = "";

        for (const variant of processed.variants) {
          const filename = `${sanitizedBaseName}_${uniqueToken}_${variant.key}.${extension}`;
          const storagePath = `drafts/${draftState.id}/${filename}`;
          const sitePath = `${SOLIDARY_MEDIA_PAGE_IMAGES_BASE_PATH}/${filename}`;

          const uploadFile = new File([variant.blob], filename, {
            type: processed.outputFormat
          });

          const { error: uploadError } = await supabase.storage
            .from(SITE_DRAFT_IMAGES_BUCKET)
            .upload(storagePath, uploadFile, {
              cacheControl: "3600",
              upsert: false,
              contentType: processed.outputFormat
            });
          if (uploadError) {
            throw new Error(uploadError.message);
          }

          uploadedStoragePaths.push(storagePath);

          const { data: publicUrlData } = supabase.storage
            .from(SITE_DRAFT_IMAGES_BUCKET)
            .getPublicUrl(storagePath);

          const imageUrl = publicUrlData.publicUrl?.trim();
          if (!imageUrl) {
            throw new Error("Failed to generate a public image URL.");
          }

          uploadedAssets.push({
            storagePath,
            publicUrl: imageUrl,
            sitePath,
            uploadedAt
          });
          if (variant.key === "original") {
            originalPublicUrl = imageUrl;
          }
        }

        const { error: metadataError } = await supabase.from("site_draft_images").insert(
          uploadedAssets.map((asset) => ({
            draft_id: draftState.id,
            storage_path: asset.storagePath,
            public_url: asset.publicUrl,
            site_path: asset.sitePath
          }))
        );
        if (metadataError) {
          throw new Error(metadataError.message);
        }

        setDraftImages((items) => [...items, ...uploadedAssets]);

        if (!originalPublicUrl) {
          throw new Error("Failed to resolve uploaded original image.");
        }

        previewRef.current?.replaceImageSource(
          localPreviewUrl,
          originalPublicUrl,
          imageAspectRatio ?? undefined
        );
        setNotice("Image uploaded.");
        setNoticeKind("notice");
      } catch (caught) {
        if (uploadedStoragePaths.length) {
          await supabase.storage.from(SITE_DRAFT_IMAGES_BUCKET).remove(uploadedStoragePaths);
        }
        previewRef.current?.replaceImageSource(localPreviewUrl, null, imageAspectRatio ?? undefined);
        const message = caught instanceof Error ? caught.message : "Failed to upload image.";
        setNotice(message);
        setNoticeKind("error");
      }
    })();
  };

  return {
    previewRef,
    selectedEditorImage,
    selectedEditorElement,
    setSelectedEditorImage,
    setSelectedEditorElement,
    clearSelectedEditorImage,
    uploadingInlineImage: false,
    runPreviewCommand,
    runPreviewLink,
    capturePreviewSelection,
    handleSelectedEditorImageAltChange,
    handleSelectedEditorImageCaptionChange,
    handleSelectedEditorImageSizeChange,
    handleSelectedEditorElementClassNameChange,
    handleSelectedEditorElementInlineStyleChange,
    handleInlineImageUpload
  };
};
