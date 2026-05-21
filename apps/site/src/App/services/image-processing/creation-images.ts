import { supabase } from "../../lib/supabase";
import { toBase64 } from "../../lib/base64";
import {
  processImageVariantsFromOriginal,
  type ImageVariantSpec
} from "./picsquish";

export const MAX_CREATION_IMAGE_BYTES = 5 * 1024 * 1024;
const SITE_DRAFT_IMAGES_BUCKET = "site-draft-images";

type ClientOptimizationResult<Key extends string> = {
  mode: "optimized";
  imagesB64: Record<Key, string>;
};

type ServerFallbackResult = {
  mode: "server_fallback";
  originalStoragePath: string;
  originalMimeType: string;
};

export type PreparedCreationImage<Key extends string> =
  | ClientOptimizationResult<Key>
  | ServerFallbackResult;

type PrepareCreationImageParams<Key extends string> = {
  file: File;
  ownerUserId: string;
  stagingFolder: "create-site" | "create-index";
  stagingId: string;
  variants: ReadonlyArray<ImageVariantSpec<Key>>;
  jpegQuality?: number;
  jpegDpi?: number;
};

const normalizeMimeType = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "image/jpg" || normalized === "image/pjpeg") return "image/jpeg";
  return normalized;
};

const getExtensionForMimeType = (mimeType: string) => {
  const normalized = normalizeMimeType(mimeType);
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  return "img";
};

const assertCreationImageFile = (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Select an image file.");
  }

  if (file.size > MAX_CREATION_IMAGE_BYTES) {
    throw new Error("Image is too large. Max upload size is 5 MB.");
  }
};

const supportsClientImageOptimization = () =>
  typeof globalThis.createImageBitmap === "function" &&
  typeof globalThis.Worker === "function" &&
  typeof globalThis.OffscreenCanvas !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  typeof HTMLCanvasElement.prototype.toBlob === "function";

const blobsToBase64Record = async <Key extends string>(
  blobs: Record<Key, Blob>
): Promise<Record<Key, string>> => {
  const entries = await Promise.all(
    Object.entries(blobs).map(async ([key, blob]) => [
      key,
      toBase64(await (blob as Blob).arrayBuffer())
    ] as const)
  );
  return Object.fromEntries(entries) as Record<Key, string>;
};

const uploadOriginalForServerFallback = async ({
  file,
  ownerUserId,
  stagingFolder,
  stagingId
}: {
  file: File;
  ownerUserId: string;
  stagingFolder: "create-site" | "create-index";
  stagingId: string;
}) => {
  const normalizedOwnerUserId = ownerUserId.trim();
  const normalizedStagingId = stagingId.trim();
  if (!normalizedOwnerUserId || !normalizedStagingId) {
    throw new Error("Could not prepare image fallback upload.");
  }

  const mimeType = normalizeMimeType(file.type || "application/octet-stream");
  const extension = getExtensionForMimeType(mimeType);
  const storagePath = `${normalizedOwnerUserId}/${stagingFolder}/${normalizedStagingId}/original.${extension}`;
  const { error } = await supabase.storage
    .from(SITE_DRAFT_IMAGES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: mimeType
    });

  if (error) {
    throw new Error(error.message);
  }

  return {
    originalStoragePath: storagePath,
    originalMimeType: mimeType
  };
};

export const prepareCreationImage = async <Key extends string>({
  file,
  ownerUserId,
  stagingFolder,
  stagingId,
  variants,
  jpegQuality = 0.9,
  jpegDpi = 72
}: PrepareCreationImageParams<Key>): Promise<PreparedCreationImage<Key>> => {
  assertCreationImageFile(file);

  if (supportsClientImageOptimization()) {
    try {
      const optimized = await processImageVariantsFromOriginal({
        sourceImage: file,
        sourceMimeType: file.type,
        variants,
        jpegQuality,
        jpegDpi
      });
      return {
        mode: "optimized",
        imagesB64: await blobsToBase64Record(optimized)
      };
    } catch {
      // Fall through to server-side optimization only when the browser path
      // fails. Do not use a fixed timeout: valid optimization work can take
      // longer while it searches for a variant under the target byte limit.
    }
  }

  return {
    mode: "server_fallback",
    ...(await uploadOriginalForServerFallback({
      file,
      ownerUserId,
      stagingFolder,
      stagingId
    }))
  };
};
