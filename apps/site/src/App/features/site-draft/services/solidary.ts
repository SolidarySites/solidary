export type SolidaryConfig = {
  protocol_version?: string;
  site_id?: string;
  site_url?: string;
  title?: string;
  image_url?: string;
  description?: string;
};

export const SOLIDARY_PROTOCOL_VERSION = "1.0";

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
    return {
      protocol_version:
        typeof record.protocol_version === "string" ? record.protocol_version : undefined,
      site_id: typeof record.site_id === "string" ? record.site_id : undefined,
      site_url: typeof record.site_url === "string" ? record.site_url : undefined,
      title: typeof record.title === "string" ? record.title : undefined,
      image_url: typeof record.image_url === "string" ? record.image_url : undefined,
      description: typeof record.description === "string" ? record.description : undefined
    };
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

export const buildSolidaryMetadataFile = ({
  templateSolidary,
  siteId,
  siteUrl,
  title,
  imageUrl,
  description
}: {
  templateSolidary: string;
  siteId: string;
  siteUrl: string;
  title: string;
  imageUrl: string;
  description: string;
}) => {
  const templateDocument = parseTemplateObject(templateSolidary);
  const nextDocument: SolidaryConfig = {
    ...templateDocument,
    protocol_version: SOLIDARY_PROTOCOL_VERSION,
    site_id: siteId.trim(),
    site_url: siteUrl.trim(),
    title: title.trim(),
    image_url: imageUrl.trim(),
    description: description.trim()
  };

  return `${JSON.stringify(nextDocument, null, 2)}\n`;
};
