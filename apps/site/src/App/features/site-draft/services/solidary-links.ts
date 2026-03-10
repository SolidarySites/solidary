export const SOLIDARY_LINKS_SITE_TYPE = "site";
export const SOLIDARY_LINKS_CONNECTION_TYPE = "connection";

export type SolidaryLinksConnectedSite = {
  "@id": string;
  "@type": typeof SOLIDARY_LINKS_SITE_TYPE;
  site_id: string;
  site_url: string;
};

export type SolidaryLinksConnection = {
  "@id": string;
  "@type": typeof SOLIDARY_LINKS_CONNECTION_TYPE;
  connection_uuid: string;
  connected_site: SolidaryLinksConnectedSite;
};

export type SolidaryLinksDocument = {
  "@context": {
    site_id: string;
    site_url: {
      "@id": string;
      "@type": "@id";
    };
    connections: {
      "@id": string;
      "@container": "@set";
    };
    connection_uuid: string;
    connected_site: string;
  };
  "@id": string;
  "@type": typeof SOLIDARY_LINKS_SITE_TYPE;
  site_id: string;
  site_url: string;
  connections: SolidaryLinksConnection[];
};

const DEFAULT_CONTEXT: SolidaryLinksDocument["@context"] = {
  site_id: "urn:solidary:term:site_id",
  site_url: {
    "@id": "urn:solidary:term:site_url",
    "@type": "@id"
  },
  connections: {
    "@id": "urn:solidary:term:connections",
    "@container": "@set"
  },
  connection_uuid: "urn:solidary:term:connection_uuid",
  connected_site: "urn:solidary:term:connected_site"
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const parseJsonObject = (raw: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const normalizeConnection = (value: unknown): SolidaryLinksConnection | null => {
  const record = asRecord(value);
  const connection_uuid = readString(record.connection_uuid);
  const connectedSiteRecord = asRecord(record.connected_site);
  const site_id = readString(connectedSiteRecord.site_id);
  const site_url = readString(connectedSiteRecord.site_url);
  if (!connection_uuid || !site_id || !site_url) {
    return null;
  }

  return {
    "@id": `urn:uuid:${connection_uuid}`,
    "@type": SOLIDARY_LINKS_CONNECTION_TYPE,
    connection_uuid,
    connected_site: {
      "@id": site_url,
      "@type": SOLIDARY_LINKS_SITE_TYPE,
      site_id,
      site_url
    }
  };
};

const normalizeConnections = (value: unknown): SolidaryLinksConnection[] =>
  Array.isArray(value)
    ? value
        .map((entry) => normalizeConnection(entry))
        .filter((entry): entry is SolidaryLinksConnection => Boolean(entry))
    : [];

const buildDefaultDocument = (): SolidaryLinksDocument => ({
  "@context": DEFAULT_CONTEXT,
  "@id": "",
  "@type": SOLIDARY_LINKS_SITE_TYPE,
  site_id: "",
  site_url: "",
  connections: []
});

export const parseSolidaryLinksJson = (raw: string): SolidaryLinksDocument | null => {
  const record = parseJsonObject(raw);
  if (!record) return null;

  return {
    "@context": DEFAULT_CONTEXT,
    "@id": readString(record["@id"]),
    "@type": SOLIDARY_LINKS_SITE_TYPE,
    site_id: readString(record.site_id),
    site_url: readString(record.site_url),
    connections: normalizeConnections(record.connections)
  };
};

export const buildSolidaryLinksFile = ({
  templateSolidaryLinks,
  siteId,
  siteUrl,
  previousSolidaryLinksRaw
}: {
  templateSolidaryLinks: string;
  siteId: string;
  siteUrl: string;
  previousSolidaryLinksRaw?: string;
}) => {
  const templateDocument =
    parseSolidaryLinksJson(templateSolidaryLinks) ?? buildDefaultDocument();
  const previousDocument = parseSolidaryLinksJson(previousSolidaryLinksRaw ?? "");

  const nextDocument: SolidaryLinksDocument = {
    ...templateDocument,
    "@context": DEFAULT_CONTEXT,
    "@id": siteUrl.trim(),
    "@type": SOLIDARY_LINKS_SITE_TYPE,
    site_id: siteId.trim(),
    site_url: siteUrl.trim(),
    connections: previousDocument?.connections ?? templateDocument.connections
  };

  return `${JSON.stringify(nextDocument, null, 2)}\n`;
};
