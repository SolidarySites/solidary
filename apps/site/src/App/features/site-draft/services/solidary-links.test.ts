import { describe, expect, it } from "vitest";
import {
  buildSolidaryLinksFile,
  parseSolidaryLinksJson,
  SOLIDARY_LINKS_CONNECTION_TYPE,
  SOLIDARY_LINKS_SITE_TYPE
} from "./solidary-links";

const templateSolidaryLinks = JSON.stringify(
  {
    "@context": {
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
    },
    "@id": "",
    "@type": SOLIDARY_LINKS_SITE_TYPE,
    site_id: "",
    site_url: "",
    connections: []
  },
  null,
  2
);

describe("solidary-links", () => {
  it("builds root site links JSON and preserves existing connections", () => {
    const raw = buildSolidaryLinksFile({
      templateSolidaryLinks,
      siteId: "site-1",
      siteUrl: "https://example.com",
      previousSolidaryLinksRaw: JSON.stringify({
        "@id": "https://old.example.com",
        "@type": "site",
        site_id: "site-1",
        site_url: "https://old.example.com",
        connections: [
          {
            "@id": "urn:uuid:conn-1",
            "@type": "connection",
            connection_uuid: "conn-1",
            connected_site: {
              "@id": "https://connected.example.com",
              "@type": "site",
              site_id: "site-2",
              site_url: "https://connected.example.com"
            }
          }
        ]
      })
    });

    expect(parseSolidaryLinksJson(raw)).toEqual({
      "@context": {
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
      },
      "@id": "https://example.com",
      "@type": "site",
      site_id: "site-1",
      site_url: "https://example.com",
      connections: [
        {
          "@id": "urn:uuid:conn-1",
          "@type": SOLIDARY_LINKS_CONNECTION_TYPE,
          connection_uuid: "conn-1",
          connected_site: {
            "@id": "https://connected.example.com",
            "@type": SOLIDARY_LINKS_SITE_TYPE,
            site_id: "site-2",
            site_url: "https://connected.example.com"
          }
        }
      ]
    });
  });
});
