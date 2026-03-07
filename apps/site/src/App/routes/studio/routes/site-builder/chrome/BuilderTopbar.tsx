import { useEffect, useRef, useState } from "react";
import BuilderEditorToolbar from "../preview/BuilderEditorToolbar";
import type { BuilderImageUploadOptions } from "../services/types";

type BuilderTopbarProps = {
  onRunFormatCommand: (command: string, value?: string) => void;
  onRunFormatLink: () => void;
  onUploadFormatImage: (file: File, options: BuilderImageUploadOptions) => Promise<void>;
  onCaptureFormatSelection: () => void;
  isFormatImageUploading: boolean;
  maxFormatImageUploadBytes: number;
};

const BuilderTopbar = ({
  onRunFormatCommand,
  onRunFormatLink,
  onUploadFormatImage,
  onCaptureFormatSelection,
  isFormatImageUploading,
  maxFormatImageUploadBytes
}: BuilderTopbarProps) => {
  const topbarRef = useRef<HTMLDivElement | null>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const topbar = topbarRef.current;
    if (!topbar) return;

    let animationFrame = 0;
    const updateStickyState = () => {
      const stickyOffset = Number.parseFloat(window.getComputedStyle(topbar).top) || 0;
      const stuck = topbar.getBoundingClientRect().top <= stickyOffset + 0.5;
      setIsSticky((previous) => (previous === stuck ? previous : stuck));
    };
    const scheduleStickyStateUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateStickyState();
      });
    };

    updateStickyState();
    window.addEventListener("scroll", scheduleStickyStateUpdate, { passive: true });
    window.addEventListener("resize", scheduleStickyStateUpdate);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleStickyStateUpdate);
      window.removeEventListener("resize", scheduleStickyStateUpdate);
    };
  }, []);

  useEffect(() => {
    const topbar = topbarRef.current;
    if (!topbar) return;
    const shell = topbar.closest(".builder-shell");
    if (!(shell instanceof HTMLElement)) return;

    let animationFrame = 0;
    const updateStickyHeightVar = () => {
      const height = Math.ceil(topbar.getBoundingClientRect().height);
      shell.style.setProperty("--builder-topbar-sticky-height", `${height}px`);
    };
    const scheduleStickyHeightUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateStickyHeightVar();
      });
    };

    scheduleStickyHeightUpdate();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleStickyHeightUpdate();
          });
    resizeObserver?.observe(topbar);
    window.addEventListener("resize", scheduleStickyHeightUpdate);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleStickyHeightUpdate);
      shell.style.removeProperty("--builder-topbar-sticky-height");
    };
  }, []);

  return (
    <div ref={topbarRef} className={`builder-topbar builder-topbar-toolbar ${isSticky ? "is-sticky" : ""}`}>
      <aside className="builder-toolbar-rail" aria-label="Formatting tools">
        <BuilderEditorToolbar
          orientation="horizontal"
          onRunCommand={onRunFormatCommand}
          onRunLink={onRunFormatLink}
          onUploadImage={onUploadFormatImage}
          onCaptureSelection={onCaptureFormatSelection}
          uploadingImage={isFormatImageUploading}
          maxImageUploadBytes={maxFormatImageUploadBytes}
        />
      </aside>
    </div>
  );
};

export default BuilderTopbar;
