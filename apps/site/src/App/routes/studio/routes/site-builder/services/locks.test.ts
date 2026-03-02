import { describe, expect, it } from "vitest";
import type { BuilderPage } from "./types";
import {
  getEditableSectionFromUi,
  getLockKeyFromUi,
  getLockLabel,
  getPageLockKey,
  getPageLockKeyForPage,
  getPageLockKeyForSlug,
  isPageLockKey
} from "./locks";

describe("getEditableSectionFromUi", () => {
  it("maps content section to metadata", () => {
    expect(getEditableSectionFromUi("content", "pages", false)).toBe("metadata");
  });

  it("returns null for non-editing pages settings", () => {
    expect(getEditableSectionFromUi("settings", "pages", false)).toBeNull();
  });

  it("maps media settings to styles editable section", () => {
    expect(getEditableSectionFromUi("settings", "media", false)).toBe("styles");
  });
});

describe("page lock keys", () => {
  const pages: BuilderPage[] = [
    { id: "home-id", slug: "home", title: "Home", body: "Home page", showInNav: true },
    { id: "about-id", slug: "about", title: "About", body: "About page", showInNav: true }
  ];

  it("normalizes freeform values to supported page lock keys", () => {
    expect(getPageLockKey(" About Us! ")).toBe("page:about-us");
    expect(isPageLockKey("page:about-us")).toBe(true);
  });

  it("uses page id when available", () => {
    expect(getPageLockKeyForPage(pages[1], 1)).toBe("page:about-id");
  });

  it("resolves active slug to matching page lock key", () => {
    expect(getPageLockKeyForSlug(pages, "about")).toBe("page:about-id");
    expect(getPageLockKeyForSlug(pages, "missing")).toBe("page:missing");
  });
});

describe("getLockKeyFromUi and getLockLabel", () => {
  const pages: BuilderPage[] = [{ slug: "home", title: "Home", body: "Home page", showInNav: true }];

  it("returns metadata lock key for content section", () => {
    expect(getLockKeyFromUi("content", "pages", "home", pages, false)).toBe("metadata");
  });

  it("returns page lock key while editing pages", () => {
    expect(getLockKeyFromUi("settings", "pages", "home", pages, true)).toBe("page:home");
  });

  it("maps media settings to styles lock key", () => {
    expect(getLockKeyFromUi("settings", "media", "home", pages, false)).toBe("styles");
  });

  it("returns human-readable labels for section and page keys", () => {
    expect(getLockLabel("header")).toBe("Header");
    expect(getLockLabel("page:home")).toBe("this page");
    expect(getLockLabel("not-a-lock")).toBe("this section");
  });
});
