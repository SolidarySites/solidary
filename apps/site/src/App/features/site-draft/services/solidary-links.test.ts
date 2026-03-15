import { describe, expect, it } from "vitest";
import { TEMPLATE_SOLIDARY_LINKS } from "../../../../templates/site";
import {
  buildSolidaryLinksFile,
  SOLIDARY_LINKS_INDEX_TYPE,
  parseSolidaryLinksJson,
  SOLIDARY_LINKS_CONNECTION_TYPE,
  SOLIDARY_LINKS_SITE_TYPE
} from "./solidary-links";

const templateSolidaryLinks = TEMPLATE_SOLIDARY_LINKS;

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
        connections: [
          {
            "@id": "urn:uuid:conn-1",
            "@type": "connection",
            connected_site: {
              "@id": "https://connected.example.com",
              "@type": "site",
              site_id: "site-2"
            }
          }
        ]
      })
    });

    expect(parseSolidaryLinksJson(raw)).toEqual({
        "@context": {
          site: "urn:solidary:type:site",
          index: "urn:solidary:type:index",
          connection: "urn:solidary:type:connection",
          site_id: "urn:solidary:term:site_id",
          connections: {
          "@id": "urn:solidary:term:connections",
          "@container": "@set"
        },
        connected_site: "urn:solidary:term:connected_site"
      },
      "@id": "https://example.com",
      "@type": "site",
      site_id: "site-1",
      connections: [
        {
          "@id": "urn:uuid:conn-1",
          "@type": SOLIDARY_LINKS_CONNECTION_TYPE,
          connected_site: {
            "@id": "https://connected.example.com",
            "@type": SOLIDARY_LINKS_SITE_TYPE,
            site_id: "site-2"
          }
        }
      ]
    });
    expect(raw).not.toContain('"site_url"');
    expect(raw).not.toContain("connection_uuid");
  });

  it("supports index roots", () => {
    const raw = buildSolidaryLinksFile({
      templateSolidaryLinks,
      siteId: "index-1",
      siteUrl: "https://index.example.com",
      rootType: SOLIDARY_LINKS_INDEX_TYPE
    });

    expect(parseSolidaryLinksJson(raw)?.["@type"]).toBe(SOLIDARY_LINKS_INDEX_TYPE);
  });
});
