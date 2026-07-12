import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("normalizes Latin diacritics", () => {
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
  });

  it("falls back when a title has no ASCII slug characters", () => {
    expect(slugify("東京")).toBe("untitled");
  });
});
