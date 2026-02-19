import { describe, expect, it } from "vitest";
import { parseSolidaryJson } from "./solidary";

describe("parseSolidaryJson", () => {
  it("parses valid solidary config JSON", () => {
    const parsed = parseSolidaryJson(
      JSON.stringify({
        title: "Solidary Site",
        description: "A description",
        site_url: "https://example.com",
        image_url: "/images/hero.jpg"
      })
    );

    expect(parsed).toEqual({
      title: "Solidary Site",
      description: "A description",
      site_url: "https://example.com",
      image_url: "/images/hero.jpg"
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseSolidaryJson("{ not-valid-json }")).toBeNull();
  });
});
