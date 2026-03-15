import { resolveSiteImageUrl } from "../../../lib/site-image-url";

export type SolidaryConfig = {
  protocol_version?: string;
  type?: "site" | "index";
  site_id?: string;
  site_url?: string;
  title?: string;
  site_image?: string;
  site_image_thumb?: string;
  description?: string;
  index_level?: number;
  parent_index_id?: string;
  parent_index_url?: string;
  parent_index_level?: number;
};

export const SOLIDARY_PROTOCOL_VERSION = "1.0";
export const SOLIDARY_SITE_IMAGE_PATH = "/solidary-media/images/site-image.jpg";
export const SOLIDARY_SITE_IMAGE_THUMB_PATH = "/solidary-media/images/site-image_thumb.jpg";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const parseSolidaryJson = (raw: string): SolidaryConfig | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = asRecord(parsed);
    const normalizedType =
      typeof record.type === "string" && (record.type === "site" || record.type === "index")
        ? record.type
        : typeof record.site_status === "string" && record.site_status === "solidaryIndex"
          ? "index"
          : "site";
    const next: SolidaryConfig = {
      type: normalizedType
    };
    if (typeof record.protocol_version === "string") {
      next.protocol_version = record.protocol_version;
    }
    if (typeof record.site_id === "string") {
      next.site_id = record.site_id;
    }
    if (typeof record.site_url === "string") {
      next.site_url = record.site_url;
    }
    if (typeof record.title === "string") {
      next.title = record.title;
    }
    if (typeof record.site_image === "string") {
      next.site_image = record.site_image;
    }
    if (typeof record.site_image_thumb === "string") {
      next.site_image_thumb = record.site_image_thumb;
    }
    if (typeof record.description === "string") {
      next.description = record.description;
    }
    if (typeof record.index_level === "number") {
      next.index_level = record.index_level;
    }
    if (typeof record.parent_index_id === "string") {
      next.parent_index_id = record.parent_index_id;
    }
    if (typeof record.parent_index_url === "string") {
      next.parent_index_url = record.parent_index_url;
    }
    if (typeof record.parent_index_level === "number") {
      next.parent_index_level = record.parent_index_level;
    }
    return next;
  } catch {
    return null;
  }
};

const parseTemplateObject = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const resolveSolidaryMetadataImages = ({
  siteUrl,
  hasSiteImage
}: {
  siteUrl: string;
  hasSiteImage: boolean;
}) =>
  hasSiteImage
    ? {
        siteImageUrl: resolveSiteImageUrl(siteUrl, SOLIDARY_SITE_IMAGE_PATH),
        siteImageThumbUrl: resolveSiteImageUrl(siteUrl, SOLIDARY_SITE_IMAGE_THUMB_PATH)
      }
    : {
        siteImageUrl: "",
        siteImageThumbUrl: ""
      };

export const buildSolidaryMetadataFile = ({
  templateSolidary,
  siteId,
  siteUrl,
  title,
  siteImageUrl,
  siteImageThumbUrl,
  description,
  type,
  indexLevel,
  parentIndexId,
  parentIndexUrl,
  parentIndexLevel
}: {
  templateSolidary: string;
  siteId: string;
  siteUrl: string;
  title: string;
  siteImageUrl: string;
  siteImageThumbUrl: string;
  description: string;
  type?: "site" | "index";
  indexLevel?: number;
  parentIndexId?: string;
  parentIndexUrl?: string;
  parentIndexLevel?: number;
}) => {
  const templateDocument = parseTemplateObject(templateSolidary);
  const templateType =
    typeof templateDocument.type === "string" &&
      (templateDocument.type === "site" || templateDocument.type === "index")
      ? templateDocument.type
      : typeof templateDocument.site_status === "string" && templateDocument.site_status === "solidaryIndex"
        ? "index"
        : "site";
  const templateParentIndexId =
    typeof templateDocument.parent_index_id === "string"
      ? templateDocument.parent_index_id
      : undefined;
  const templateParentIndexUrl =
    typeof templateDocument.parent_index_url === "string"
      ? templateDocument.parent_index_url
      : undefined;
  const templateParentIndexLevel =
    typeof templateDocument.parent_index_level === "number"
      ? templateDocument.parent_index_level
      : undefined;
  const nextDocument: Record<string, unknown> = {
    ...templateDocument,
    protocol_version: SOLIDARY_PROTOCOL_VERSION,
    site_id: siteId.trim(),
    site_url: siteUrl.trim(),
    title: title.trim(),
    site_image: siteImageUrl.trim(),
    site_image_thumb: siteImageThumbUrl.trim(),
    description: description.trim(),
    type: type ?? templateType,
    index_level:
      typeof indexLevel === "number"
        ? indexLevel
        : typeof templateDocument.index_level === "number"
          ? templateDocument.index_level
          : undefined,
    parent_index_id: parentIndexId?.trim() || templateParentIndexId,
    parent_index_url: parentIndexUrl?.trim() || templateParentIndexUrl,
    parent_index_level:
      typeof parentIndexLevel === "number"
        ? parentIndexLevel
        : templateParentIndexLevel
  };

  return `${JSON.stringify(nextDocument, null, 2)}\n`;
};
