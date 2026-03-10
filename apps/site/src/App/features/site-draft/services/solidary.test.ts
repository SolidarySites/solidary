import { describe, expect, it } from "vitest";
import { buildSolidaryMetadataFile, parseSolidaryJson } from "./solidary";

describe("parseSolidaryJson", () => {
  it("parses valid solidary config JSON", () => {
    const parsed = parseSolidaryJson(
      JSON.stringify({
        title: "Solidary Site",
        description: "A description",
        protocol_version: "1.0",
        site_url: "https://example.com",
        image_url: "/images/hero.jpg"
      })
    );

    expect(parsed).toEqual({
      title: "Solidary Site",
      description: "A description",
      protocol_version: "1.0",
      site_url: "https://example.com",
      image_url: "/images/hero.jpg"
    });
  });

  it("builds solidary metadata JSON", () => {
    const raw = buildSolidaryMetadataFile({
      templateSolidary:
        '{ "protocol_version": "1.0", "site_id": "", "site_url": "", "title": "", "image_url": "", "description": "" }',
      siteId: "site-1",
      siteUrl: "https://example.com",
      title: "Solidary Site",
      imageUrl: "/images/hero.jpg",
      description: "A description"
    });

    expect(parseSolidaryJson(raw)).toEqual({
      protocol_version: "1.0",
      site_id: "site-1",
      site_url: "https://example.com",
      title: "Solidary Site",
      image_url: "/images/hero.jpg",
      description: "A description"
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseSolidaryJson("{ not-valid-json }")).toBeNull();
  });
});
