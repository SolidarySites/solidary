export const SOLIDARY_LINKS_SITE_TYPE = "site";
export const SOLIDARY_LINKS_CONNECTION_TYPE = "connection";

export type SolidaryLinksConnectedSite = {
  "@id": string;
  "@type": typeof SOLIDARY_LINKS_SITE_TYPE;
  site_id: string;
};

export type SolidaryLinksConnection = {
  "@id": string;
  "@type": typeof SOLIDARY_LINKS_CONNECTION_TYPE;
  connected_site: SolidaryLinksConnectedSite;
};

export type SolidaryLinksDocument = {
  "@context": {
    site: string;
    connection: string;
    site_id: string;
    connections: {
      "@id": string;
      "@container": "@set";
    };
    connected_site: string;
  };
  "@id": string;
  "@type": typeof SOLIDARY_LINKS_SITE_TYPE;
  site_id: string;
  connections: SolidaryLinksConnection[];
};

const DEFAULT_CONTEXT: SolidaryLinksDocument["@context"] = {
  site: "urn:solidary:type:site",
  connection: "urn:solidary:type:connection",
  site_id: "urn:solidary:term:site_id",
  connections: {
    "@id": "urn:solidary:term:connections",
    "@container": "@set"
  },
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
  const connectionId = readString(record["@id"]);
  const connectedSiteRecord = asRecord(record.connected_site);
  const site_id = readString(connectedSiteRecord.site_id);
  const connectedSiteId = readString(connectedSiteRecord["@id"]);
  if (!connectionId || !site_id || !connectedSiteId) {
    return null;
  }

  return {
    "@id": connectionId,
    "@type": SOLIDARY_LINKS_CONNECTION_TYPE,
    connected_site: {
      "@id": connectedSiteId,
      "@type": SOLIDARY_LINKS_SITE_TYPE,
      site_id
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
    connections: previousDocument?.connections ?? templateDocument.connections
  };

  return `${JSON.stringify(nextDocument, null, 2)}\n`;
};
