import { useLayoutEffect, useRef } from "react";

const MASTHEAD_COLUMNS = 12;
const RESERVED_MASTHEAD_COLUMNS = 4;
const TOOLTIP_OFFSET_PX = 14;
const MOBILE_BREAKPOINT_PX = 760;

export function useAboutTitleTooltipBounds() {
  const mastheadRef = useRef<HTMLElement | null>(null);
  const termRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const masthead = mastheadRef.current;
    const term = termRef.current;

    if (!masthead || !term) {
      return;
    }

    const syncTooltipBounds = () => {
      if (window.innerWidth <= MOBILE_BREAKPOINT_PX) {
        term.style.removeProperty("--landing-home-title-tooltip-max-width");
        return;
      }

      const mastheadRect = masthead.getBoundingClientRect();
      const termRect = term.getBoundingClientRect();
      const styles = window.getComputedStyle(masthead);
      const columnGap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
      const usableWidth = mastheadRect.width - columnGap * (MASTHEAD_COLUMNS - 1);

      if (usableWidth <= 0) {
        term.style.removeProperty("--landing-home-title-tooltip-max-width");
        return;
      }

      const columnWidth = usableWidth / MASTHEAD_COLUMNS;
      const leadingColumns = MASTHEAD_COLUMNS - RESERVED_MASTHEAD_COLUMNS;
      const reservedColumnsLeftEdge =
        mastheadRect.left + leadingColumns * columnWidth + leadingColumns * columnGap;
      const availableWidth = Math.max(
        0,
        Math.floor(reservedColumnsLeftEdge - termRect.right - TOOLTIP_OFFSET_PX)
      );

      term.style.setProperty("--landing-home-title-tooltip-max-width", `${availableWidth}px`);
    };

    syncTooltipBounds();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => syncTooltipBounds());

    resizeObserver?.observe(masthead);
    resizeObserver?.observe(term);
    window.addEventListener("resize", syncTooltipBounds);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncTooltipBounds);
      term.style.removeProperty("--landing-home-title-tooltip-max-width");
    };
  }, []);

  return { mastheadRef, termRef };
}
