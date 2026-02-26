import { describe, expect, it, vi } from "vitest";
import { switchEditorSectionWithLocks } from "./switch-editor-section";
import type { BuilderPage } from "./types";

const pages: BuilderPage[] = [
  {
    id: "home-id",
    title: "Home",
    slug: "home",
    body: "<p>Home</p>",
    showInNav: true
  }
];

type SwitchParams = Parameters<typeof switchEditorSectionWithLocks>[0];

const buildParams = (overrides: Partial<SwitchParams> = {}) => {
  const params: SwitchParams = {
    nextSection: "settings",
    nextSettingsSection: "pages",
    options: {
      nextPageEditingMode: true,
      nextPreviewSlug: "new-page"
    },
    activeSection: "settings",
    activeSettingsSection: "pages",
    isPageEditingMode: false,
    activePreviewSlug: "home",
    pages,
    canEditDraft: true,
    draftStateId: "draft-1",
    hasUnsavedChanges: false,
    currentDraftSignature: "signature",
    saveSectionByKey: vi.fn(async () => undefined),
    acquireSectionLock: vi.fn(async () => true),
    releaseSectionLock: vi.fn(async () => undefined),
    loadSectionLocks: vi.fn(async () => ({})),
    refreshDraftAfterSectionChange: vi.fn(async () => undefined),
    reloadLatestDraftAfterConflict: vi.fn(async () => undefined),
    setLastSavedDraftSignature: vi.fn(),
    setActiveSection: vi.fn(),
    setActiveSettingsSection: vi.fn(),
    setActivePreviewSlug: vi.fn(),
    setIsPageEditingMode: vi.fn(),
    clearSelectedEditorImage: vi.fn(),
    setNotice: vi.fn(),
    setNoticeKind: vi.fn(),
    ...overrides
  };

  return params;
};

describe("switchEditorSectionWithLocks", () => {
  it("skips draft refresh when skipDraftRefresh is true", async () => {
    const params = buildParams({
      options: {
        nextPageEditingMode: true,
        nextPreviewSlug: "new-page",
        skipDraftRefresh: true
      }
    });

    await switchEditorSectionWithLocks(params);

    expect(params.refreshDraftAfterSectionChange).not.toHaveBeenCalled();
    expect(params.setActivePreviewSlug).toHaveBeenCalledWith("new-page");
    expect(params.setIsPageEditingMode).toHaveBeenCalledWith(true);
  });

  it("refreshes draft state by default after section switch", async () => {
    const params = buildParams();

    await switchEditorSectionWithLocks(params);

    expect(params.refreshDraftAfterSectionChange).toHaveBeenCalledWith({
      preservedPreviewSlug: "new-page"
    });
  });
});
