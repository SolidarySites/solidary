import { useMemo, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import { normalizeFooterModules } from "../services/draft-utils";
import type { UseBuilderSectionNavigationResult } from "./useBuilderSectionNavigation.types";
import {
  getPageSafeSlug,
  makeUniquePageSlug
} from "../services/utils";
import type {
  BuilderPage,
  FooterModule,
  FooterModuleAlignment
} from "../services/types";

type UseBuilderPageEditingParams = {
  pages: BuilderPage[];
  activePreviewSlug: string;
  setPages: Dispatch<SetStateAction<BuilderPage[]>>;
  setActivePreviewSlug: Dispatch<SetStateAction<string>>;
  setFooterModules: Dispatch<SetStateAction<FooterModule[]>>;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  touchedPageSlugsRef: MutableRefObject<Set<string>>;
  deletedPageSlugsRef: MutableRefObject<Set<string>>;
  switchEditorSection: UseBuilderSectionNavigationResult["switchEditorSection"];
};

export const useBuilderPageEditing = ({
  pages,
  activePreviewSlug,
  setPages,
  setActivePreviewSlug,
  setFooterModules,
  pageTitleRef,
  touchedPageSlugsRef,
  deletedPageSlugsRef,
  switchEditorSection
}: UseBuilderPageEditingParams) => {
  const normalizeTouchedSlug = (value: string | null | undefined) =>
    value?.trim().toLowerCase() ?? "";

  const markPageSlugTouched = (slug: string | null | undefined) => {
    const normalized = normalizeTouchedSlug(slug);
    if (!normalized) return;
    touchedPageSlugsRef.current.add(normalized);
    deletedPageSlugsRef.current.delete(normalized);
  };

  const markPageSlugDeleted = (slug: string | null | undefined) => {
    const normalized = normalizeTouchedSlug(slug);
    if (!normalized) return;
    touchedPageSlugsRef.current.delete(normalized);
    deletedPageSlugsRef.current.add(normalized);
  };

  const addPage = () => {
    const slug = makeUniquePageSlug("new-page", pages);
    setPages((items) => [
      ...items,
      {
        id: slug,
        title: "New page",
        slug,
        body: "<p>Write your page content here.</p>",
        javascript: "",
        showInNav: true,
        position: items.length
      }
    ]);
    markPageSlugTouched(slug);
    setActivePreviewSlug(slug);
    void switchEditorSection("settings", "pages", {
      nextPageEditingMode: true,
      nextPreviewSlug: slug,
      skipDraftRefresh: true
    });
    requestAnimationFrame(() => pageTitleRef.current?.focus());
  };

  const updatePage = (index: number, updates: Partial<BuilderPage>) => {
    const existing = pages[index];
    if (existing) {
      const previousSlug = getPageSafeSlug(existing, index);
      const nextSlug = getPageSafeSlug({ ...existing, ...updates }, index);
      if (previousSlug !== nextSlug && activePreviewSlug === previousSlug) {
        setActivePreviewSlug(nextSlug);
      }
      if (previousSlug !== nextSlug) {
        markPageSlugDeleted(previousSlug);
        markPageSlugTouched(nextSlug);
      } else {
        markPageSlugTouched(previousSlug);
      }
    }
    setPages((items) => items.map((item, idx) => (idx === index ? { ...item, ...updates } : item)));
  };

  const updatePageBody = (safeSlug: string, body: string) => {
    markPageSlugTouched(safeSlug);
    setPages((items) =>
      items.map((item, index) =>
        getPageSafeSlug(item, index) === safeSlug ? { ...item, body } : item
      )
    );
  };

  const updatePageJavaScript = (safeSlug: string, javascript: string) => {
    markPageSlugTouched(safeSlug);
    setPages((items) =>
      items.map((item, index) =>
        getPageSafeSlug(item, index) === safeSlug ? { ...item, javascript } : item
      )
    );
  };

  const handlePageTitleChange = (index: number, nextTitle: string) => {
    const page = pages[index];
    if (!page) return;
    if (page.isHome) {
      updatePage(index, { title: nextTitle });
      return;
    }

    updatePage(index, {
      title: nextTitle,
      slug: makeUniquePageSlug(nextTitle || page.slug || "page", pages, index)
    });
  };

  const handlePageSlugChange = (index: number, nextSlug: string) => {
    const page = pages[index];
    if (!page || page.isHome) return;
    updatePage(index, {
      slug: makeUniquePageSlug(nextSlug || "page", pages, index)
    });
  };

  const headerNavItems = useMemo(
    () =>
      pages
        .map((page, index) => ({
          page,
          safeSlug: getPageSafeSlug(page, index)
        }))
        .filter(({ page }) => page.showInNav !== false)
        .map(({ page, safeSlug }) => ({
          slug: safeSlug,
          label: page.title.trim() || "Untitled page"
        })),
    [pages]
  );

  const moveHeaderNavItem = (slug: string, direction: -1 | 1) => {
    setPages((items) => {
      const navIndices = items
        .map((page, index) => ({
          index,
          slug: getPageSafeSlug(page, index),
          showInNav: page.showInNav !== false
        }))
        .filter((item) => item.showInNav);
      const currentNavIndex = navIndices.findIndex((item) => item.slug === slug);
      if (currentNavIndex === -1) return items;
      const targetNavIndex = currentNavIndex + direction;
      if (targetNavIndex < 0 || targetNavIndex >= navIndices.length) return items;

      const fromIndex = navIndices[currentNavIndex].index;
      const toIndex = navIndices[targetNavIndex].index;
      const next = [...items];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      markPageSlugTouched(navIndices[currentNavIndex].slug);
      markPageSlugTouched(navIndices[targetNavIndex].slug);
      return next;
    });
  };

  const updateFooterModuleContent = (index: number, value: string) => {
    setFooterModules((items) => {
      const next = normalizeFooterModules(items);
      if (index < 0 || index >= next.length) return next;
      next[index] = {
        ...next[index],
        content: value
      };
      return next;
    });
  };

  const updateFooterModuleAlignment = (index: number, alignment: FooterModuleAlignment) => {
    setFooterModules((items) => {
      const next = normalizeFooterModules(items);
      if (index < 0 || index >= next.length) return next;
      next[index] = {
        ...next[index],
        alignment
      };
      return next;
    });
  };

  const moveFooterModule = (index: number, direction: -1 | 1) => {
    setFooterModules((items) => {
      const next = normalizeFooterModules(items);
      const target = index + direction;
      if (index < 0 || index >= next.length || target < 0 || target >= next.length) {
        return next;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return {
    addPage,
    updatePageBody,
    updatePageJavaScript,
    handlePageTitleChange,
    handlePageSlugChange,
    headerNavItems,
    moveHeaderNavItem,
    updateFooterModuleContent,
    updateFooterModuleAlignment,
    moveFooterModule
  };
};
