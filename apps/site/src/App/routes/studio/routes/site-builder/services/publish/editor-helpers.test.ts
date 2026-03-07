import { describe, expect, it } from "vitest";
import {
  FILE_KEYS,
  PAGE_PATH_PREFIX,
  PAGE_PATH_SUFFIX,
  TEMPLATE_RUNTIME_FILE_PATHS
} from "../constants";
import type { BuilderEditableSectionKey, BuilderPage } from "../types";
import { buildEditorFileChanges } from "./editor-helpers";

const BASE_PAGE: BuilderPage = {
  slug: "home",
  title: "Home",
  body: "Home content",
  showInNav: false,
  isHome: true
};

const PAGE_PATH = `${PAGE_PATH_PREFIX}home${PAGE_PATH_SUFFIX}`;

const buildFilesFixture = () => {
  const files: Record<string, string> = {
    [FILE_KEYS.solidary]: "{}",
    [FILE_KEYS.solidaryContent]: "---\ntitle: \"Site\"\n---\n",
    [FILE_KEYS.headerContent]: "---\nbrandText: \"Site\"\n---\n",
    [FILE_KEYS.footerContent]: "---\nmodules: []\n---\n",
    [FILE_KEYS.seoContent]:
      "---\ntwitter: true\nopenGraph: true\nstructuredData: true\nindexFollow: true\nlocale: \"en-US\"\nheadHtml: \"\"\n---\n",
    [FILE_KEYS.tokens]: ":root { --color: #000; }\n",
    [FILE_KEYS.globalStyles]: "@import \"./partials/tokens.css\";\n",
    [FILE_KEYS.structureStyles]: ".page { color: var(--fg); }\n",
    [PAGE_PATH]: "---\ntitle: \"Home\"\n---\nHome content\n"
  };
  TEMPLATE_RUNTIME_FILE_PATHS.forEach((path) => {
    files[path] = `template:${path}`;
  });
  return files;
};

describe("buildEditorFileChanges", () => {
  it("includes markdown metadata files and runtime templates for metadata edits", () => {
    const touchedSections = new Set<BuilderEditableSectionKey>(["metadata"]);
    const { upsertsByPath } = buildEditorFileChanges({
      touchedSections,
      touchedPageSlugs: new Set<string>(),
      deletedPageSlugs: new Set<string>(),
      normalizedPages: [BASE_PAGE],
      files: buildFilesFixture()
    });

    expect(upsertsByPath.get(FILE_KEYS.solidary)).toBe("{}");
    expect(upsertsByPath.get(FILE_KEYS.solidaryContent)).toContain('title: "Site"');
    expect(upsertsByPath.get(FILE_KEYS.seoContent)).toContain("headHtml");
    TEMPLATE_RUNTIME_FILE_PATHS.forEach((path) => {
      expect(upsertsByPath.get(path)).toBe(`template:${path}`);
    });
  });

  it("includes seo.md and runtime templates when head is edited", () => {
    const touchedSections = new Set<BuilderEditableSectionKey>(["head"]);
    const { upsertsByPath } = buildEditorFileChanges({
      touchedSections,
      touchedPageSlugs: new Set<string>(),
      deletedPageSlugs: new Set<string>(),
      normalizedPages: [BASE_PAGE],
      files: buildFilesFixture()
    });

    expect(upsertsByPath.get(FILE_KEYS.seoContent)).toContain("headHtml");
    TEMPLATE_RUNTIME_FILE_PATHS.forEach((path) => {
      expect(upsertsByPath.get(path)).toBe(`template:${path}`);
    });
  });

  it("includes only touched page files when pages are edited", () => {
    const touchedSections = new Set<BuilderEditableSectionKey>(["pages"]);
    const { upsertsByPath } = buildEditorFileChanges({
      touchedSections,
      touchedPageSlugs: new Set<string>(["home"]),
      deletedPageSlugs: new Set<string>(),
      normalizedPages: [BASE_PAGE],
      files: buildFilesFixture()
    });

    expect(upsertsByPath.get(PAGE_PATH)).toContain('title: "Home"');
    expect(upsertsByPath.has(FILE_KEYS.solidaryContent)).toBe(false);
  });

  it("includes tokens, global, and structure files when styles are edited", () => {
    const touchedSections = new Set<BuilderEditableSectionKey>(["styles"]);
    const { upsertsByPath } = buildEditorFileChanges({
      touchedSections,
      touchedPageSlugs: new Set<string>(),
      deletedPageSlugs: new Set<string>(),
      normalizedPages: [BASE_PAGE],
      files: buildFilesFixture()
    });

    expect(upsertsByPath.get(FILE_KEYS.tokens)).toContain("--color");
    expect(upsertsByPath.get(FILE_KEYS.globalStyles)).toContain("tokens.css");
    expect(upsertsByPath.get(FILE_KEYS.structureStyles)).toContain(".page");
  });
});
