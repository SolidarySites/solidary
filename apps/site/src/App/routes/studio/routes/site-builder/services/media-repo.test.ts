import { describe, expect, it } from "vitest";
import {
  buildFontFaceBlock,
  buildImageObjects,
  buildImageTree,
  resolveFontFaceDescriptors,
  type InspectedFontFace,
  type RepoMediaFileEntry
} from "./media-repo";

describe("buildImageObjects", () => {
  it("groups UUID/size variants into one image object with small thumbnail priority", () => {
    const entries: RepoMediaFileEntry[] = [
      {
        name: "hero_97dcc8fe12_original.jpg",
        path: "public/solidary-media/images/pages/hero_97dcc8fe12_original.jpg",
        publicPath: "/solidary-media/images/pages/hero_97dcc8fe12_original.jpg",
        extension: "jpg"
      },
      {
        name: "hero_97dcc8fe12_small.jpg",
        path: "public/solidary-media/images/pages/hero_97dcc8fe12_small.jpg",
        publicPath: "/solidary-media/images/pages/hero_97dcc8fe12_small.jpg",
        extension: "jpg"
      },
      {
        name: "custom-banner.png",
        path: "public/solidary-media/images/custom-banner.png",
        publicPath: "/solidary-media/images/custom-banner.png",
        extension: "png"
      }
    ];

    const objects = buildImageObjects(entries);

    expect(objects).toHaveLength(2);
    const hero = objects.find((entry) => entry.uuid === "97dcc8fe12");
    expect(hero).toBeDefined();
    expect(hero?.title).toBe("hero");
    expect(hero?.thumbnailPublicPath).toBe("/solidary-media/images/pages/hero_97dcc8fe12_small.jpg");
    expect(hero?.deletePaths).toHaveLength(2);
  });
});

describe("buildImageTree", () => {
  it("builds nested folders without rendering the root folder", () => {
    const entries: RepoMediaFileEntry[] = [
      {
        name: "hero_97dcc8fe12_small.jpg",
        path: "public/solidary-media/images/pages/hero_97dcc8fe12_small.jpg",
        publicPath: "/solidary-media/images/pages/hero_97dcc8fe12_small.jpg",
        extension: "jpg"
      },
      {
        name: "logo.png",
        path: "public/solidary-media/brand/logo.png",
        publicPath: "/solidary-media/brand/logo.png",
        extension: "png"
      }
    ];

    const tree = buildImageTree(buildImageObjects(entries));
    expect(tree.name).toBe("root");
    expect(tree.path).toBe("");
    expect(tree.folders.map((folder) => folder.name)).toEqual(["brand", "images"]);
  });
});

describe("resolveFontFaceDescriptors", () => {
  it("maps variable font faces to deduplicated style/weight descriptors", () => {
    const faces: InspectedFontFace[] = [
      {
        familyName: "Newsreader",
        subfamilyName: "Roman",
        postscriptName: "Newsreader-Roman",
        kind: "variable",
        weight: { min: 200, default: 400, max: 800 },
        style: ["normal", "italic"]
      },
      {
        familyName: "Newsreader",
        subfamilyName: "Italic",
        postscriptName: "Newsreader-Italic",
        kind: "static",
        weight: 400,
        style: "italic"
      }
    ];

    const descriptors = resolveFontFaceDescriptors(faces);
    expect(descriptors).toEqual([
      { fontStyle: "normal", fontWeight: "200 800" },
      { fontStyle: "italic", fontWeight: "200 800" },
      { fontStyle: "italic", fontWeight: "400" }
    ]);
  });
});

describe("buildFontFaceBlock", () => {
  it("renders explicit weight and style values", () => {
    const block = buildFontFaceBlock({
      fontFamily: "Newsreader",
      publicPath: "/fonts/newsreader.woff2",
      extension: "woff2",
      fontWeight: "200 800",
      fontStyle: "italic"
    });

    expect(block).toContain('font-family: "Newsreader";');
    expect(block).toContain('src: url("/fonts/newsreader.woff2") format("woff2");');
    expect(block).toContain("font-weight: 200 800;");
    expect(block).toContain("font-style: italic;");
  });
});
