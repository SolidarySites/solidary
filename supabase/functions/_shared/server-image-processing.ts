import { Buffer } from "node:buffer";
import {
  AlphaAction,
  ImageMagick,
  initializeImageMagick,
  MagickColors,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.40";

const SITE_DRAFT_IMAGES_BUCKET = "site-draft-images";
const DEFAULT_JPEG_QUALITY = 90;
const MIN_DIMENSION_LIMIT = 64;
const MAX_DIMENSION_ATTEMPTS = 30;
const SUPPORTED_CREATION_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
]);

type SupabaseClientLike = {
  storage: {
    from: (bucket: string) => {
      download: (
        path: string,
      ) => Promise<{ data: Blob | null; error: { message?: string } | null }>;
      remove: (
        paths: string[],
      ) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

export type ServerImageVariantSpec<Key extends string = string> = {
  key: Key;
  label: string;
  maxBytes: number;
  maxDimensionLimit?: number;
};

type ProcessServerImageVariantsParams<Key extends string> = {
  sourceBytes: Uint8Array;
  variants: ReadonlyArray<ServerImageVariantSpec<Key>>;
};

let imageMagickReady: Promise<void> | null = null;

const normalizeMimeType = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "image/jpg" || normalized === "image/pjpeg") {
    return "image/jpeg";
  }
  return normalized;
};

const toKilobytes = (bytes: number) => Math.ceil(bytes / 1024);

const ensureImageMagickReady = () => {
  if (!imageMagickReady) {
    imageMagickReady = (async () => {
      const moduleUrl = import.meta.resolve(
        "npm:@imagemagick/magick-wasm@0.0.40",
      );
      const wasmUrl = new URL("./magick.wasm", moduleUrl);
      const wasmBytes = await Deno.readFile(wasmUrl);
      await initializeImageMagick(wasmBytes);
    })();
  }
  return imageMagickReady;
};

export const assertSupportedCreationImageMimeType = (
  mimeType: string,
  label = "Image",
) => {
  const normalized = normalizeMimeType(mimeType);
  if (!SUPPORTED_CREATION_IMAGE_MIME_TYPES.has(normalized)) {
    throw new Error(`${label} must be a JPEG, PNG, or WebP image.`);
  }
  return normalized;
};

export const downloadStagedCreationImageBytes = async ({
  supabase,
  storagePath,
}: {
  supabase: SupabaseClientLike;
  storagePath: string;
}) => {
  const { data, error } = await supabase.storage
    .from(SITE_DRAFT_IMAGES_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      error?.message?.trim() || "Failed to download staged image.",
    );
  }

  return new Uint8Array(await data.arrayBuffer());
};

export const cleanupStagedCreationImage = async ({
  supabase,
  storagePath,
  logPrefix,
}: {
  supabase: SupabaseClientLike;
  storagePath: string;
  logPrefix: string;
}) => {
  if (!storagePath.trim()) return;
  const { error } = await supabase.storage.from(SITE_DRAFT_IMAGES_BUCKET)
    .remove([storagePath]);
  if (error) {
    console.log(`${logPrefix} failed to delete staged image`, {
      storagePath,
      message: error.message,
    });
  }
};

const getPreparedDimensions = async (sourceBytes: Uint8Array) => {
  await ensureImageMagickReady();
  return ImageMagick.read(sourceBytes, (image) => {
    image.autoOrient();
    return {
      width: image.width,
      height: image.height,
      maxDimension: Math.max(image.width, image.height, MIN_DIMENSION_LIMIT),
    };
  });
};

const encodeJpegAtDimension = async ({
  sourceBytes,
  dimension,
  quality,
}: {
  sourceBytes: Uint8Array;
  dimension: number;
  quality: number;
}) => {
  await ensureImageMagickReady();
  return ImageMagick.read(sourceBytes, (image) => {
    image.autoOrient();
    image.strip();
    image.backgroundColor = MagickColors.White;
    image.alpha(AlphaAction.Remove);
    image.quality = quality;

    const maxSide = Math.max(image.width, image.height);
    if (maxSide > dimension) {
      const scale = dimension / maxSide;
      image.resize(
        Math.max(1, Math.round(image.width * scale)),
        Math.max(1, Math.round(image.height * scale)),
      );
    }

    return image.write(MagickFormat.Jpeg, (data) => new Uint8Array(data));
  });
};

const renderVariant = async ({
  sourceBytes,
  sourceMaxDimension,
  variant,
}: {
  sourceBytes: Uint8Array;
  sourceMaxDimension: number;
  variant: ServerImageVariantSpec;
}) => {
  const normalizedStart = Math.max(
    MIN_DIMENSION_LIMIT,
    Math.floor(
      Math.min(
        sourceMaxDimension,
        variant.maxDimensionLimit ?? sourceMaxDimension,
      ),
    ),
  );
  const normalizedMin = Math.max(
    1,
    Math.min(MIN_DIMENSION_LIMIT, normalizedStart),
  );
  const encodedByDimension = new Map<number, Uint8Array>();
  const state: {
    bestUnderLimit: { dimension: number; bytes: Uint8Array } | null;
    smallestBytes: Uint8Array | null;
  } = {
    bestUnderLimit: null,
    smallestBytes: null,
  };

  const encodeAtDimension = async (dimension: number) => {
    const normalizedDimension = Math.max(normalizedMin, Math.floor(dimension));
    const cached = encodedByDimension.get(normalizedDimension);
    if (cached) return cached;
    const encoded = await encodeJpegAtDimension({
      sourceBytes,
      dimension: normalizedDimension,
      quality: DEFAULT_JPEG_QUALITY,
    });
    encodedByDimension.set(normalizedDimension, encoded);
    return encoded;
  };

  const considerCandidate = (dimension: number, bytes: Uint8Array) => {
    if (!state.smallestBytes || bytes.length < state.smallestBytes.length) {
      state.smallestBytes = bytes;
    }
    if (bytes.length > variant.maxBytes) return;
    if (
      !state.bestUnderLimit ||
      bytes.length > state.bestUnderLimit.bytes.length ||
      (bytes.length === state.bestUnderLimit.bytes.length &&
        dimension > state.bestUnderLimit.dimension)
    ) {
      state.bestUnderLimit = { dimension, bytes };
    }
  };

  const startBytes = await encodeAtDimension(normalizedStart);
  considerCandidate(normalizedStart, startBytes);
  if (startBytes.length <= variant.maxBytes) return startBytes;

  const minBytes = await encodeAtDimension(normalizedMin);
  considerCandidate(normalizedMin, minBytes);
  if (minBytes.length > variant.maxBytes) {
    for (const quality of [82, 72, 60, 50]) {
      const lowerQualityBytes = await encodeJpegAtDimension({
        sourceBytes,
        dimension: normalizedMin,
        quality,
      });
      considerCandidate(normalizedMin, lowerQualityBytes);
      if (lowerQualityBytes.length <= variant.maxBytes) {
        return lowerQualityBytes;
      }
    }

    throw new Error(
      `${variant.label} must be smaller than ${
        toKilobytes(variant.maxBytes)
      }KB ` +
        `(currently ${toKilobytes(state.smallestBytes?.length ?? 0)}KB).`,
    );
  }

  let left = normalizedMin;
  let right = Math.max(normalizedMin, normalizedStart - 1);
  let iteration = 0;
  while (left <= right && iteration < MAX_DIMENSION_ATTEMPTS) {
    iteration += 1;
    const mid = Math.floor((left + right) / 2);
    const midBytes = await encodeAtDimension(mid);
    considerCandidate(mid, midBytes);

    if (midBytes.length <= variant.maxBytes) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (!state.bestUnderLimit) {
    throw new Error(
      `${variant.label} could not be optimized under its size limit.`,
    );
  }

  return state.bestUnderLimit.bytes;
};

export const processCreationImageVariantsOnServer = async <Key extends string>({
  sourceBytes,
  variants,
}: ProcessServerImageVariantsParams<Key>): Promise<Record<Key, string>> => {
  if (!variants.length) {
    throw new Error("At least one image variant must be configured.");
  }

  const { maxDimension } = await getPreparedDimensions(sourceBytes);
  const entries = await Promise.all(
    variants.map(async (variant) => {
      const bytes = await renderVariant({
        sourceBytes,
        sourceMaxDimension: maxDimension,
        variant,
      });
      return [variant.key, Buffer.from(bytes).toString("base64")] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<Key, string>;
};
