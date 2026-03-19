export const SOLIDARY_LINKS_SITE_TYPE = "site";
export const SOLIDARY_LINKS_INDEX_TYPE = "index";
export const SOLIDARY_LINKS_CONNECTION_TYPE = "connection";
type SolidaryLinksRootType =
  | typeof SOLIDARY_LINKS_SITE_TYPE
  | typeof SOLIDARY_LINKS_INDEX_TYPE;

export type SolidaryLinksConnectedSite = {
  "@id": string;
  "@type": SolidaryLinksRootType;
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
    index: string;
    connection: string;
    site_id: string;
    connections: {
      "@id": string;
      "@container": "@set";
    };
    connected_site: string;
  };
  "@id": string;
  "@type": SolidaryLinksRootType;
  site_id: string;
  connections: SolidaryLinksConnection[];
};

const DEFAULT_CONTEXT: SolidaryLinksDocument["@context"] = {
  site: "urn:solidary:type:site",
  index: "urn:solidary:type:index",
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
  const connectedSiteType =
    readString(connectedSiteRecord["@type"]) === SOLIDARY_LINKS_INDEX_TYPE
      ? SOLIDARY_LINKS_INDEX_TYPE
      : SOLIDARY_LINKS_SITE_TYPE;
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
      "@type": connectedSiteType,
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

export const buildSolidaryLinksConnection = ({
  connectionUuid,
  connectedSiteId,
  connectedSiteUrl,
  connectedSiteType = SOLIDARY_LINKS_SITE_TYPE
}: {
  connectionUuid: string;
  connectedSiteId: string;
  connectedSiteUrl: string;
  connectedSiteType?: SolidaryLinksRootType;
}): SolidaryLinksConnection => ({
  "@id": `urn:uuid:${connectionUuid.trim()}`,
  "@type": SOLIDARY_LINKS_CONNECTION_TYPE,
  connected_site: {
    "@id": connectedSiteUrl.trim(),
    "@type": connectedSiteType,
    site_id: connectedSiteId.trim()
  }
});

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
  const rootType =
    readString(record["@type"]) === SOLIDARY_LINKS_INDEX_TYPE
      ? SOLIDARY_LINKS_INDEX_TYPE
      : SOLIDARY_LINKS_SITE_TYPE;

  return {
    "@context": DEFAULT_CONTEXT,
    "@id": readString(record["@id"]),
    "@type": rootType,
    site_id: readString(record.site_id),
    connections: normalizeConnections(record.connections)
  };
};

export const buildSolidaryLinksFile = ({
  templateSolidaryLinks,
  siteId,
  siteUrl,
  rootType = SOLIDARY_LINKS_SITE_TYPE,
  previousSolidaryLinksRaw,
  connectionsOverride
}: {
  templateSolidaryLinks: string;
  siteId: string;
  siteUrl: string;
  rootType?: SolidaryLinksRootType;
  previousSolidaryLinksRaw?: string;
  connectionsOverride?: SolidaryLinksConnection[];
}) => {
  const templateDocument =
    parseSolidaryLinksJson(templateSolidaryLinks) ?? buildDefaultDocument();
  const previousDocument = parseSolidaryLinksJson(previousSolidaryLinksRaw ?? "");

  const nextDocument: SolidaryLinksDocument = {
    ...templateDocument,
    "@context": DEFAULT_CONTEXT,
    "@id": siteUrl.trim(),
    "@type": rootType,
    site_id: siteId.trim(),
    connections: connectionsOverride ?? previousDocument?.connections ?? templateDocument.connections
  };

  return `${JSON.stringify(nextDocument, null, 2)}\n`;
};
