import { squish } from "picsquish";

const DEFAULT_JPEG_QUALITY = 0.9;
const DEFAULT_JPEG_DPI = 72;
const DEFAULT_MIN_DIMENSION_LIMIT = 64;
const DEFAULT_DIMENSION_REDUCTION_FACTOR = 0.9;
const DEFAULT_MAX_DIMENSION_ATTEMPTS = 30;

export const BYTES_100_KB = 100 * 1024 - 1;
export const BYTES_500_KB = 500 * 1024 - 1;
export const BYTES_1_MB = 1024 * 1024 - 1;

type JpegBlobConvertible = {
  toBlob: (options?: { type: "image/jpeg"; quality?: number }) => Promise<Blob>;
  toCanvas: () => HTMLCanvasElement;
};

export type ImageVariantSpec<Key extends string = string> = {
  key: Key;
  label: string;
  maxBytes: number;
  maxDimensionLimit?: number;
};

type ProcessImageVariantsFromOriginalParams<Key extends string> = {
  sourceImage: Blob;
  variants: ReadonlyArray<ImageVariantSpec<Key>>;
  jpegQuality?: number;
  jpegDpi?: number;
  minDimensionLimit?: number;
  dimensionReductionFactor?: number;
  maxDimensionAttempts?: number;
};

type RenderVariantParams = {
  sourceImage: Blob;
  variant: ImageVariantSpec<string>;
  initialDimensionLimit: number;
  jpegQuality: number;
  jpegDpi: number;
  minDimensionLimit: number;
  dimensionReductionFactor: number;
  maxDimensionAttempts: number;
};

const toKilobytes = (bytes: number) => Math.ceil(bytes / 1024);

const ensureCanvasBlob = async (canvas: HTMLCanvasElement, jpegQuality: number): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode image as JPEG."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      jpegQuality
    );
  });

const toJpegBlob = async (result: JpegBlobConvertible, jpegQuality: number): Promise<Blob> => {
  try {
    const blob = await result.toBlob({
      type: "image/jpeg",
      quality: jpegQuality
    });
    if (blob.size > 0) {
      return blob;
    }
  } catch {
    // Fall back to standard canvas encoding below.
  }

  return ensureCanvasBlob(result.toCanvas(), jpegQuality);
};

const withJpegDpi = async (blob: Blob, dpi: number): Promise<Blob> => {
  if (blob.type !== "image/jpeg") return blob;
  const source = new Uint8Array(await blob.arrayBuffer());
  if (source.length < 20) return blob;
  if (source[0] !== 0xff || source[1] !== 0xd8) return blob;

  let offset = 2;
  while (offset + 4 < source.length) {
    if (source[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = source[offset + 1];
    if (marker === 0xda) break;
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    const segmentLength = (source[offset + 2] << 8) | source[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > source.length) break;

    if (
      marker === 0xe0 &&
      segmentLength >= 16 &&
      source[offset + 4] === 0x4a &&
      source[offset + 5] === 0x46 &&
      source[offset + 6] === 0x49 &&
      source[offset + 7] === 0x46 &&
      source[offset + 8] === 0x00
    ) {
      const next = new Uint8Array(source);
      const unitsOffset = offset + 11;
      const densityXOffset = offset + 12;
      const densityYOffset = offset + 14;
      const clampedDpi = Math.max(1, Math.min(65535, Math.floor(dpi)));

      next[unitsOffset] = 0x01;
      next[densityXOffset] = (clampedDpi >> 8) & 0xff;
      next[densityXOffset + 1] = clampedDpi & 0xff;
      next[densityYOffset] = (clampedDpi >> 8) & 0xff;
      next[densityYOffset + 1] = clampedDpi & 0xff;

      return new Blob([next], { type: "image/jpeg" });
    }

    offset += 2 + segmentLength;
  }

  return blob;
};

const renderVariantFromOriginal = async ({
  sourceImage,
  variant,
  initialDimensionLimit,
  jpegQuality,
  jpegDpi,
  minDimensionLimit,
  dimensionReductionFactor: _dimensionReductionFactor,
  maxDimensionAttempts
}: RenderVariantParams): Promise<Blob> => {
  const normalizedStart = Math.max(minDimensionLimit, Math.floor(initialDimensionLimit));
  const normalizedMin = Math.max(1, Math.floor(minDimensionLimit));
  const encodedByDimension = new Map<number, Blob>();
  const state: {
    smallestBlob: Blob | null;
    bestUnderLimit: { dimension: number; blob: Blob } | null;
  } = {
    smallestBlob: null,
    bestUnderLimit: null
  };

  const encodeAtDimension = async (dimension: number) => {
    const normalizedDimension = Math.max(normalizedMin, Math.floor(dimension));
    const cached = encodedByDimension.get(normalizedDimension);
    if (cached) return cached;

    const result = await squish(sourceImage, normalizedDimension);
    if (
      !result ||
      typeof result !== "object" ||
      !("toBlob" in result) ||
      typeof result.toBlob !== "function" ||
      !("toCanvas" in result) ||
      typeof result.toCanvas !== "function"
    ) {
      throw new Error("Image processing returned an unexpected result.");
    }

    const jpegBlob = await toJpegBlob(
      {
        toBlob: result.toBlob.bind(result),
        toCanvas: result.toCanvas.bind(result)
      },
      jpegQuality
    );
    const jpegWithDpi = await withJpegDpi(jpegBlob, jpegDpi);
    encodedByDimension.set(normalizedDimension, jpegWithDpi);
    return jpegWithDpi;
  };

  const considerCandidate = (dimension: number, blob: Blob) => {
    if (!state.smallestBlob || blob.size < state.smallestBlob.size) {
      state.smallestBlob = blob;
    }
    if (blob.size > variant.maxBytes) {
      return;
    }
    if (
      !state.bestUnderLimit ||
      blob.size > state.bestUnderLimit.blob.size ||
      (blob.size === state.bestUnderLimit.blob.size && dimension > state.bestUnderLimit.dimension)
    ) {
      state.bestUnderLimit = {
        dimension,
        blob
      };
    }
  };

  const startBlob = await encodeAtDimension(normalizedStart);
  considerCandidate(normalizedStart, startBlob);
  if (startBlob.size <= variant.maxBytes) {
    return startBlob;
  }

  const minBlob = await encodeAtDimension(normalizedMin);
  considerCandidate(normalizedMin, minBlob);
  if (minBlob.size > variant.maxBytes) {
    const largestAllowedKb = toKilobytes(variant.maxBytes);
    const actualKb = toKilobytes(minBlob.size);
    throw new Error(`${variant.label} must be smaller than ${largestAllowedKb}KB (currently ${actualKb}KB).`);
  }

  let left = normalizedMin;
  let right = Math.max(normalizedMin, normalizedStart - 1);
  let iteration = 0;
  while (left <= right && iteration < Math.max(1, maxDimensionAttempts)) {
    iteration += 1;
    const mid = Math.floor((left + right) / 2);
    const midBlob = await encodeAtDimension(mid);
    considerCandidate(mid, midBlob);

    if (midBlob.size <= variant.maxBytes) {
      left = mid + 1;
      continue;
    }
    right = mid - 1;
  }

  // Compression can be slightly non-monotonic; probe around the best match for tighter fit.
  if (state.bestUnderLimit) {
    const refineRadius = Math.max(4, Math.min(32, Math.floor(maxDimensionAttempts / 2)));
    const refineStart = Math.max(normalizedMin, state.bestUnderLimit.dimension - refineRadius);
    const refineEnd = Math.min(normalizedStart, state.bestUnderLimit.dimension + refineRadius);
    for (let dimension = refineStart; dimension <= refineEnd; dimension += 1) {
      const blob = await encodeAtDimension(dimension);
      considerCandidate(dimension, blob);
    }
  }

  if (state.bestUnderLimit) {
    return state.bestUnderLimit.blob;
  }

  const largestAllowedKb = toKilobytes(variant.maxBytes);
  const actualKb = toKilobytes(state.smallestBlob?.size ?? 0);
  throw new Error(`${variant.label} must be smaller than ${largestAllowedKb}KB (currently ${actualKb}KB).`);
};

const getImageMaxDimension = async (image: Blob, minDimensionLimit: number): Promise<number> => {
  const bitmap = await createImageBitmap(image);
  try {
    return Math.max(bitmap.width, bitmap.height, minDimensionLimit);
  } finally {
    bitmap.close();
  }
};

export const processImageVariantsFromOriginal = async <Key extends string>({
  sourceImage,
  variants,
  jpegQuality = DEFAULT_JPEG_QUALITY,
  jpegDpi = DEFAULT_JPEG_DPI,
  minDimensionLimit = DEFAULT_MIN_DIMENSION_LIMIT,
  dimensionReductionFactor = DEFAULT_DIMENSION_REDUCTION_FACTOR,
  maxDimensionAttempts = DEFAULT_MAX_DIMENSION_ATTEMPTS
}: ProcessImageVariantsFromOriginalParams<Key>): Promise<Record<Key, Blob>> => {
  if (!variants.length) {
    throw new Error("At least one image variant must be configured.");
  }

  const imageMaxDimension = await getImageMaxDimension(sourceImage, minDimensionLimit);
  const outputEntries: Array<readonly [Key, Blob]> = [];

  for (const variant of variants) {
    const initialDimensionLimit = Math.min(
      imageMaxDimension,
      Math.max(minDimensionLimit, Math.floor(variant.maxDimensionLimit ?? imageMaxDimension))
    );
    const blob = await renderVariantFromOriginal({
      sourceImage,
      variant,
      initialDimensionLimit,
      jpegQuality,
      jpegDpi,
      minDimensionLimit,
      dimensionReductionFactor,
      maxDimensionAttempts
    });
    outputEntries.push([variant.key, blob]);
  }

  return Object.fromEntries(outputEntries) as Record<Key, Blob>;
};
