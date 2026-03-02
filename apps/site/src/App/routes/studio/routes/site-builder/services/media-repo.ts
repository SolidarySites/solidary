import { listDirectory } from "../../../../../services/github";

export const REPO_SOLIDARY_MEDIA_BASE_PATH = "public/solidary-media";
export const REPO_FONTS_BASE_PATH = "public/fonts";
export const REPO_FONTS_CSS_PATH = "src/styles/partials/fonts.css";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"]);
const FONT_EXTENSIONS = new Set(["otf", "ttf", "woff", "woff2"]);
const MAX_REPO_MEDIA_SCAN_DEPTH = 6;
const MAX_REPO_MEDIA_FILE_COUNT = 600;

type RepoPathParts = {
  owner: string;
  repo: string;
};

export type RepoMediaFileEntry = {
  name: string;
  path: string;
  publicPath: string;
  extension: string;
};

export type RepoMediaAssets = {
  images: RepoMediaFileEntry[];
  fonts: RepoMediaFileEntry[];
  warning: string | null;
};

export type RepoMediaFolderEntry = {
  name: string;
  path: string;
};

export type RepoMediaFolderContents = {
  folders: RepoMediaFolderEntry[];
  images: RepoImageObject[];
  warning: string | null;
};

export type SupportedFontExtension = "otf" | "ttf" | "woff" | "woff2";
export type FontFaceStyle = "normal" | "italic" | "oblique";
export type ImageVariantSize = "small" | "medium" | "large" | "original" | "custom";

type VariableWeightRange = {
  min: number;
  default: number;
  max: number;
};

export type InspectedFontFace = {
  familyName: string | null;
  subfamilyName: string | null;
  postscriptName: string | null;
  kind: "static" | "variable";
  weight: number | VariableWeightRange | null;
  style: FontFaceStyle | FontFaceStyle[];
  axes?: Record<string, { name?: string; min: number; default: number; max: number }>;
};

export type FontFaceDescriptor = {
  fontStyle: FontFaceStyle;
  fontWeight: string;
};

export type RepoImageObjectVariant = {
  path: string;
  publicPath: string;
  fileName: string;
  variant: ImageVariantSize;
};

export type RepoImageObject = {
  key: string;
  folderPath: string;
  title: string;
  uuid: string | null;
  thumbnailPath: string;
  thumbnailPublicPath: string;
  variants: RepoImageObjectVariant[];
  deletePaths: string[];
};

export type RepoImageTreeNode = {
  key: string;
  name: string;
  path: string;
  folders: RepoImageTreeNode[];
  images: RepoImageObject[];
};

const PROTECTED_IMAGE_PREFIXES = ["og-home", "site-image-thumb", "site-image"] as const;

const splitRepoName = (repoFullName: string): RepoPathParts | null => {
  const [owner, repo] = repoFullName.trim().split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
};

const toPublicPath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("public/")) return `/${trimmed.slice("public/".length)}`;
  return `/${trimmed.replace(/^\/+/, "")}`;
};

const getExtension = (filename: string): string => {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return extension.replace(/[^a-z0-9]/g, "");
};

const getFilenameWithoutExtension = (filename: string) => filename.replace(/\.[^/.]+$/, "");

const normalizeRelativeFolderPath = (folderPath: string) =>
  folderPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");

const isMissingPathError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|404|not a directory/i.test(message);
};

const readDirectoryTree = async ({
  owner,
  repo,
  branch,
  rootPath
}: {
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
}): Promise<Array<{ name: string; path: string; type: string }>> => {
  const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];
  const files: Array<{ name: string; path: string; type: string }> = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    let entries: Array<{ name: string; path: string; type: string }> = [];
    try {
      entries = await listDirectory("", owner, repo, current.path, branch);
    } catch (error) {
      if (current.depth === 0 && isMissingPathError(error)) {
        return [];
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry.type === "file") {
        files.push(entry);
        if (files.length >= MAX_REPO_MEDIA_FILE_COUNT) return files;
        continue;
      }
      if (entry.type === "dir" && current.depth < MAX_REPO_MEDIA_SCAN_DEPTH) {
        queue.push({
          path: entry.path,
          depth: current.depth + 1
        });
      }
    }
  }

  return files;
};

const mapRepoFiles = (
  files: Array<{ name: string; path: string }>,
  acceptedExtensions: Set<string>
): RepoMediaFileEntry[] =>
  files
    .map((entry) => {
      const extension = getExtension(entry.name);
      if (!acceptedExtensions.has(extension)) return null;
      return {
        name: entry.name,
        path: entry.path,
        publicPath: toPublicPath(entry.path),
        extension
      };
    })
    .filter((entry): entry is RepoMediaFileEntry => Boolean(entry))
    .sort((a, b) => a.path.localeCompare(b.path));

const mergeWarnings = (...values: Array<string | null>) => {
  const warnings = values
    .map((entry) => entry?.trim() ?? "")
    .filter(Boolean);
  if (!warnings.length) return null;
  return warnings.join(" ");
};

export const loadRepoMediaAssets = async ({
  repoFullName,
  branch
}: {
  repoFullName: string;
  branch: string;
}): Promise<RepoMediaAssets> => {
  const repoParts = splitRepoName(repoFullName);
  if (!repoParts) {
    return {
      images: [],
      fonts: [],
      warning: "Repository name is invalid. Unable to load media assets."
    };
  }

  const { owner, repo } = repoParts;
  const [imageFiles, fontFiles] = await Promise.all([
    readDirectoryTree({
      owner,
      repo,
      branch,
      rootPath: REPO_SOLIDARY_MEDIA_BASE_PATH
    }),
    readDirectoryTree({
      owner,
      repo,
      branch,
      rootPath: REPO_FONTS_BASE_PATH
    })
  ]);

  const images = mapRepoFiles(imageFiles, IMAGE_EXTENSIONS);
  const fonts = mapRepoFiles(fontFiles, FONT_EXTENSIONS);
  const imagesWarning =
    imageFiles.length === 0
      ? `No files found in ${REPO_SOLIDARY_MEDIA_BASE_PATH}.`
      : null;
  const fontsWarning =
    fontFiles.length === 0
      ? `No files found in ${REPO_FONTS_BASE_PATH}.`
      : null;

  return {
    images,
    fonts,
    warning: mergeWarnings(imagesWarning, fontsWarning)
  };
};

export const loadRepoFontAssets = async ({
  repoFullName,
  branch
}: {
  repoFullName: string;
  branch: string;
}): Promise<{ fonts: RepoMediaFileEntry[]; warning: string | null }> => {
  const repoParts = splitRepoName(repoFullName);
  if (!repoParts) {
    return {
      fonts: [],
      warning: "Repository name is invalid. Unable to load font assets."
    };
  }

  const { owner, repo } = repoParts;
  const fontFiles = await readDirectoryTree({
    owner,
    repo,
    branch,
    rootPath: REPO_FONTS_BASE_PATH
  });
  const fonts = mapRepoFiles(fontFiles, FONT_EXTENSIONS);

  return {
    fonts,
    warning: fonts.length === 0 ? `No files found in ${REPO_FONTS_BASE_PATH}.` : null
  };
};

export const loadRepoMediaFolderContents = async ({
  repoFullName,
  branch,
  folderPath
}: {
  repoFullName: string;
  branch: string;
  folderPath: string;
}): Promise<RepoMediaFolderContents> => {
  const repoParts = splitRepoName(repoFullName);
  if (!repoParts) {
    return {
      folders: [],
      images: [],
      warning: "Repository name is invalid. Unable to load media folders."
    };
  }

  const { owner, repo } = repoParts;
  const normalizedFolderPath = normalizeRelativeFolderPath(folderPath);
  const targetPath = normalizedFolderPath
    ? `${REPO_SOLIDARY_MEDIA_BASE_PATH}/${normalizedFolderPath}`
    : REPO_SOLIDARY_MEDIA_BASE_PATH;

  let entries: Array<{ name: string; path: string; type: string }> = [];
  try {
    entries = await listDirectory("", owner, repo, targetPath, branch);
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        folders: [],
        images: [],
        warning: null
      };
    }
    throw error;
  }

  const folders = entries
    .filter((entry) => entry.type === "dir")
    .map((entry) => ({
      name: entry.name,
      path: normalizedFolderPath ? `${normalizedFolderPath}/${entry.name}` : entry.name
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const imageEntries = mapRepoFiles(
    entries
      .filter((entry) => entry.type === "file")
      .map((entry) => ({ name: entry.name, path: entry.path })),
    IMAGE_EXTENSIONS
  );

  return {
    folders,
    images: buildImageObjects(imageEntries),
    warning: null
  };
};

const normalizeTitleText = (value: string) => {
  const trimmed = value.trim().replace(/^[_-]+|[_-]+$/g, "");
  if (!trimmed) return "";
  return trimmed.replace(/[_-]+/g, " ");
};

const IMAGE_VARIANT_REGEX =
  /^(?<prefix>.*?)(?<uuid>[a-f0-9]{10})_(?<variant>small|medium|large|original)$/i;

const parseVariantInfo = (filename: string): { title: string; uuid: string; variant: ImageVariantSize } | null => {
  const baseName = getFilenameWithoutExtension(filename);
  const match = baseName.match(IMAGE_VARIANT_REGEX);
  if (!match?.groups) return null;
  const uuid = (match.groups.uuid ?? "").toLowerCase();
  const variantText = (match.groups.variant ?? "").toLowerCase();
  const title = normalizeTitleText(match.groups.prefix ?? "");
  if (!uuid) return null;
  const variant =
    variantText === "small" || variantText === "medium" || variantText === "large" || variantText === "original"
      ? variantText
      : "custom";
  return { title, uuid, variant };
};

const thumbnailRank: Record<ImageVariantSize, number> = {
  small: 0,
  medium: 1,
  large: 2,
  original: 3,
  custom: 4
};

type ImageGroupAccumulator = {
  key: string;
  folderPath: string;
  title: string;
  uuid: string | null;
  variants: RepoImageObjectVariant[];
};

export const buildImageObjects = (entries: RepoMediaFileEntry[]): RepoImageObject[] => {
  const groups = new Map<string, ImageGroupAccumulator>();

  for (const entry of entries) {
    const normalizedPath = entry.path.trim();
    if (!normalizedPath.startsWith(`${REPO_SOLIDARY_MEDIA_BASE_PATH}/`)) continue;
    const relativePath = normalizedPath.slice(`${REPO_SOLIDARY_MEDIA_BASE_PATH}/`.length);
    const segments = relativePath.split("/");
    const fileName = segments.pop() ?? "";
    if (!fileName) continue;
    const folderPath = segments.join("/");

    const parsedVariant = parseVariantInfo(fileName);
    const title = parsedVariant?.title || normalizeTitleText(getFilenameWithoutExtension(fileName)) || fileName;
    const uuid = parsedVariant?.uuid ?? null;
    const variant = parsedVariant?.variant ?? "custom";
    const groupKey = parsedVariant
      ? `variant:${folderPath}:${parsedVariant.uuid}:${title.toLowerCase()}`
      : `file:${normalizedPath}`;

    const current = groups.get(groupKey) ?? {
      key: groupKey,
      folderPath,
      title,
      uuid,
      variants: []
    };

    current.variants.push({
      path: normalizedPath,
      publicPath: entry.publicPath,
      fileName,
      variant
    });

    groups.set(groupKey, current);
  }

  return Array.from(groups.values())
    .map((group) => {
      const orderedVariants = group.variants
        .slice()
        .sort((a, b) => thumbnailRank[a.variant] - thumbnailRank[b.variant] || a.path.localeCompare(b.path));
      const thumbnail = orderedVariants[0];
      return {
        key: group.key,
        folderPath: group.folderPath,
        title: group.title,
        uuid: group.uuid,
        thumbnailPath: thumbnail.path,
        thumbnailPublicPath: thumbnail.publicPath,
        variants: orderedVariants,
        deletePaths: orderedVariants.map((variant) => variant.path)
      };
    })
    .sort((a, b) => {
      if (a.folderPath !== b.folderPath) return a.folderPath.localeCompare(b.folderPath);
      return a.title.localeCompare(b.title);
    });
};

export const isProtectedImageFileName = (fileName: string): boolean => {
  const normalizedStem = getFilenameWithoutExtension(fileName).trim().toLowerCase();
  if (!normalizedStem) return false;
  return PROTECTED_IMAGE_PREFIXES.some(
    (prefix) =>
      normalizedStem === prefix ||
      normalizedStem.startsWith(`${prefix}-`) ||
      normalizedStem.startsWith(`${prefix}_`)
  );
};

export const isProtectedImageObject = (imageObject: RepoImageObject): boolean =>
  imageObject.variants.some((variant) => isProtectedImageFileName(variant.fileName));

const createImageTreeNode = (name: string, path: string): RepoImageTreeNode => ({
  key: path ? `folder:${path}` : "folder:root",
  name,
  path,
  folders: [],
  images: []
});

export const buildImageTree = (images: RepoImageObject[]): RepoImageTreeNode => {
  const root = createImageTreeNode("root", "");

  for (const image of images) {
    const folderSegments = image.folderPath
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    let current = root;
    let currentPath = "";

    for (const segment of folderSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let nextFolder = current.folders.find((folder) => folder.name === segment);
      if (!nextFolder) {
        nextFolder = createImageTreeNode(segment, currentPath);
        current.folders.push(nextFolder);
        current.folders.sort((a, b) => a.name.localeCompare(b.name));
      }
      current = nextFolder;
    }

    current.images.push(image);
    current.images.sort((a, b) => a.title.localeCompare(b.title));
  }

  return root;
};

export const getSupportedFontExtension = (filename: string): SupportedFontExtension | null => {
  const extension = getExtension(filename);
  if (!FONT_EXTENSIONS.has(extension)) return null;
  return extension as SupportedFontExtension;
};

const FONT_FORMAT_BY_EXTENSION: Record<SupportedFontExtension, string> = {
  otf: "opentype",
  ttf: "truetype",
  woff: "woff",
  woff2: "woff2"
};

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeCssString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const clampFontWeight = (value: number) => {
  if (!Number.isFinite(value)) return 400;
  return Math.max(1, Math.min(1000, Math.round(value)));
};

const inferStaticStyle = (face: Record<string, unknown>): FontFaceStyle => {
  const os2 = face["OS/2"] as { fsSelection?: number } | undefined;
  const fsSelection = os2?.fsSelection ?? 0;

  const isItalic = (fsSelection & 0x01) !== 0;
  const isOblique = (fsSelection & 0x0200) !== 0;

  if (isOblique) return "oblique";
  const italicAngle = typeof face.italicAngle === "number" ? face.italicAngle : 0;
  if (isItalic || italicAngle !== 0) return "italic";
  return "normal";
};

const inferStaticWeight = (face: Record<string, unknown>): number | null => {
  const os2 = face["OS/2"] as { usWeightClass?: number } | undefined;
  const fromTable = os2?.usWeightClass;
  if (typeof fromTable === "number") return clampFontWeight(fromTable);

  const subfamilyName = typeof face.subfamilyName === "string" ? face.subfamilyName.toLowerCase() : "";
  if (!subfamilyName) return 400;

  if (subfamilyName.includes("thin")) return 100;
  if (subfamilyName.includes("extralight") || subfamilyName.includes("ultralight")) return 200;
  if (subfamilyName.includes("light")) return 300;
  if (subfamilyName.includes("regular") || subfamilyName.includes("book") || subfamilyName.includes("roman")) {
    return 400;
  }
  if (subfamilyName.includes("medium")) return 500;
  if (subfamilyName.includes("semibold") || subfamilyName.includes("demibold")) return 600;
  if (subfamilyName.includes("bold")) return 700;
  if (subfamilyName.includes("extrabold") || subfamilyName.includes("ultrabold")) return 800;
  if (subfamilyName.includes("black") || subfamilyName.includes("heavy")) return 900;

  return 400;
};

const inspectFace = (face: Record<string, unknown>): InspectedFontFace => {
  const axes = (face.variationAxes as
    | Record<string, { name?: string; min: number; default: number; max: number }>
    | undefined);
  if (axes && Object.keys(axes).length > 0) {
    const weightAxis = axes.wght;
    const italicAxis = axes.ital;
    const slantAxis = axes.slnt;

    let style: FontFaceStyle | FontFaceStyle[] = "normal";
    if (italicAxis) {
      style = ["normal", "italic"];
    } else if (slantAxis) {
      style = ["normal", "oblique"];
    }

    return {
      familyName: typeof face.familyName === "string" ? face.familyName : null,
      subfamilyName: typeof face.subfamilyName === "string" ? face.subfamilyName : null,
      postscriptName: typeof face.postscriptName === "string" ? face.postscriptName : null,
      kind: "variable",
      weight: weightAxis
        ? {
            min: clampFontWeight(weightAxis.min),
            default: clampFontWeight(weightAxis.default),
            max: clampFontWeight(weightAxis.max)
          }
        : null,
      style,
      axes
    };
  }

  return {
    familyName: typeof face.familyName === "string" ? face.familyName : null,
    subfamilyName: typeof face.subfamilyName === "string" ? face.subfamilyName : null,
    postscriptName: typeof face.postscriptName === "string" ? face.postscriptName : null,
    kind: "static",
    weight: inferStaticWeight(face),
    style: inferStaticStyle(face)
  };
};

export const inspectUploadedFont = async (file: File): Promise<InspectedFontFace[]> => {
  const fontkit = await import("fontkit");
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const parsed = fontkit.create(bytes) as Record<string, unknown>;

  if ("fonts" in parsed && Array.isArray((parsed as { fonts?: unknown[] }).fonts)) {
    return ((parsed as { fonts: unknown[] }).fonts as Record<string, unknown>[]).map((face) => inspectFace(face));
  }

  return [inspectFace(parsed)];
};

const formatFontWeight = (weight: number | VariableWeightRange | null): string => {
  if (typeof weight === "number") return `${clampFontWeight(weight)}`;
  if (weight) {
    const min = clampFontWeight(weight.min);
    const max = clampFontWeight(weight.max);
    if (min === max) return `${min}`;
    return `${Math.min(min, max)} ${Math.max(min, max)}`;
  }
  return "400";
};

const normalizeFontStyle = (value: string): FontFaceStyle => {
  if (value === "italic" || value === "oblique") return value;
  return "normal";
};

export const resolveFontFaceDescriptors = (faces: InspectedFontFace[]): FontFaceDescriptor[] => {
  if (!faces.length) {
    return [{ fontStyle: "normal", fontWeight: "400" }];
  }

  const descriptors: FontFaceDescriptor[] = [];
  const seen = new Set<string>();

  faces.forEach((face) => {
    const styles = Array.isArray(face.style) ? face.style : [face.style];
    const normalizedStyles = styles.length ? styles : ["normal"];
    const fontWeight = formatFontWeight(face.weight);

    normalizedStyles.forEach((style) => {
      const fontStyle = normalizeFontStyle(style);
      const key = `${fontStyle}:${fontWeight}`;
      if (seen.has(key)) return;
      seen.add(key);
      descriptors.push({ fontStyle, fontWeight });
    });
  });

  return descriptors.length ? descriptors : [{ fontStyle: "normal", fontWeight: "400" }];
};

export const buildFontFaceBlock = ({
  fontFamily,
  publicPath,
  extension,
  fontWeight = "400",
  fontStyle = "normal"
}: {
  fontFamily: string;
  publicPath: string;
  extension: SupportedFontExtension;
  fontWeight?: string | number;
  fontStyle?: FontFaceStyle;
}) => {
  const safeFamily = escapeCssString(fontFamily.trim());
  const safePath = escapeCssString(publicPath.trim());
  const format = FONT_FORMAT_BY_EXTENSION[extension];
  return (
    `@font-face{\n` +
    `  font-family: "${safeFamily}";\n` +
    `  src: url("${safePath}") format("${format}");\n` +
    `  font-weight: ${String(fontWeight).trim() || "400"};\n` +
    `  font-style: ${fontStyle};\n` +
    `  font-display: swap;\n` +
    `}\n`
  );
};

export const appendFontFaceBlock = ({
  fontsCss,
  fontFamily,
  publicPath,
  extension,
  fontWeight,
  fontStyle
}: {
  fontsCss: string;
  fontFamily: string;
  publicPath: string;
  extension: SupportedFontExtension;
  fontWeight?: string | number;
  fontStyle?: FontFaceStyle;
}) => {
  const normalized = normalizeLineEndings(fontsCss).trimEnd();
  const block = buildFontFaceBlock({ fontFamily, publicPath, extension, fontWeight, fontStyle });
  if (!normalized) return block;
  return `${normalized}\n\n${block}`;
};

export const removeFontFaceBlocksByPublicPath = ({
  fontsCss,
  publicPath
}: {
  fontsCss: string;
  publicPath: string;
}) => {
  const normalized = normalizeLineEndings(fontsCss);
  const escapedPath = escapeRegExp(publicPath.trim());
  if (!escapedPath) return normalized;

  const pattern = new RegExp(
    `@font-face\\s*\\{[\\s\\S]*?src\\s*:[^;]*url\\((['"]?)${escapedPath}\\1\\)[^;]*;[\\s\\S]*?\\}\\s*`,
    "gi"
  );

  const withoutMatch = normalized.replace(pattern, "");
  const compacted = withoutMatch
    .split("\n")
    .reduce<string[]>((lines, line) => {
      if (!line.trim() && lines[lines.length - 1] === "") return lines;
      lines.push(line.trimEnd());
      return lines;
    }, [])
    .join("\n")
    .trim();

  return compacted ? `${compacted}\n` : "";
};
