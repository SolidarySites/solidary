import { useEffect, useRef, useState } from "react";
import BuilderActions from "./BuilderActions";
import type { PublishFeedback } from "./types";

type BuilderTopbarProps = {
  savingDraft: boolean;
  isProvisioning: boolean;
  provisionStep: string;
  canSaveDraft: boolean;
  canPublish: boolean;
  publishLabel: string;
  liveSiteUrl: string | null;
  githubRepoUrl: string | null;
  accessRole: "owner" | "admin" | "editor" | "viewer" | null;
  activeCollaborators: string[];
  canOpenMetadataSettings: boolean;
  metadataSettingsActive: boolean;
  isPreviewFullscreen: boolean;
  onOpenMetadataSettings: () => void;
  onTogglePreviewFullscreen: () => void;
  publishFeedback: PublishFeedback | null;
  onSaveDraft: () => void;
  onPublish: () => void;
};

const BuilderTopbar = ({
  savingDraft,
  isProvisioning,
  provisionStep,
  canSaveDraft,
  canPublish,
  publishLabel,
  liveSiteUrl,
  githubRepoUrl,
  accessRole,
  activeCollaborators,
  canOpenMetadataSettings,
  metadataSettingsActive,
  isPreviewFullscreen,
  onOpenMetadataSettings,
  onTogglePreviewFullscreen,
  publishFeedback,
  onSaveDraft,
  onPublish
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

  const openExternal = (url: string | null) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div ref={topbarRef} className={`builder-topbar ${isSticky ? "is-sticky" : ""}`}>
      <div className="builder-topbar-main">
        <div className="builder-topbar-links">
          {canOpenMetadataSettings && (
            <button
              type="button"
              className={`builder-topbar-link-button ${metadataSettingsActive ? "is-active" : ""}`.trim()}
              onClick={onOpenMetadataSettings}
            >
              Settings
            </button>
          )}
          <button
            type="button"
            className="builder-topbar-link-button"
            disabled={!liveSiteUrl}
            onClick={() => openExternal(liveSiteUrl)}
          >
            Live site
          </button>
          <button
            type="button"
            className="builder-topbar-link-button"
            disabled={!githubRepoUrl}
            onClick={() => openExternal(githubRepoUrl)}
          >
            GitHub repo
          </button>
          <button type="button" className="builder-topbar-link-button" onClick={onTogglePreviewFullscreen}>
            {isPreviewFullscreen ? "Exit full screen preview" : "View full screen preview"}
          </button>
        </div>
        <div className="builder-collab-strip" aria-live="polite">
          <span className="builder-collab-pill">
            {accessRole === "owner" ? "Owner access" : `Role: ${accessRole ?? "none"}`}
          </span>
          <span className="builder-collab-pill">
            {activeCollaborators.length ? `${activeCollaborators.length} active now` : "No one else active"}
          </span>
          {activeCollaborators.slice(0, 3).map((name, index) => (
            <span key={`${name}-${index}`} className="builder-collab-name">
              {name}
            </span>
          ))}
        </div>
      </div>
      <BuilderActions
        savingDraft={savingDraft}
        isProvisioning={isProvisioning}
        provisionStep={provisionStep}
        canSaveDraft={canSaveDraft}
        canPublish={canPublish}
        publishLabel={publishLabel}
        publishFeedback={publishFeedback}
        onSaveDraft={onSaveDraft}
        onPublish={onPublish}
      />
    </div>
  );
};

export default BuilderTopbar;
