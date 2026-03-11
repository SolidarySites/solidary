import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteNoticePayload } from "../types";
import "../site-notice.css";

const AUTO_DISMISS_MS = 5_000;
const EXIT_TRANSITION_MS = 220;

type SiteNoticePopoutProps = {
  notice: SiteNoticePayload | null;
  onDismiss: (signature: string) => void;
};

const getNoticeLabel = (kind: SiteNoticePayload["kind"]) => {
  if (kind === "error") return "Error";
  if (kind === "warning") return "Notice";
  return "Success";
};

export default function SiteNoticePopout({ notice, onDismiss }: SiteNoticePopoutProps) {
  const [renderedNotice, setRenderedNotice] = useState<SiteNoticePayload | null>(notice);
  const [isVisible, setIsVisible] = useState(Boolean(notice));
  const dismissTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const dismissDeadlineRef = useRef<number | null>(null);
  const remainingTimeRef = useRef(AUTO_DISMISS_MS);
  const hoveredRef = useRef(false);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    dismissDeadlineRef.current = null;
  }, []);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(
    (duration: number, signature: string) => {
      clearDismissTimer();

      if (hoveredRef.current) {
        remainingTimeRef.current = duration;
        return;
      }

      if (duration <= 0) {
        onDismiss(signature);
        return;
      }

      remainingTimeRef.current = duration;
      dismissDeadlineRef.current = Date.now() + duration;
      dismissTimerRef.current = window.setTimeout(() => {
        dismissTimerRef.current = null;
        dismissDeadlineRef.current = null;
        onDismiss(signature);
      }, duration);
    },
    [clearDismissTimer, onDismiss]
  );

  useEffect(() => {
    if (!notice) {
      clearDismissTimer();
      setIsVisible(false);
      return;
    }

    clearExitTimer();
    setRenderedNotice(notice);
    remainingTimeRef.current = AUTO_DISMISS_MS;

    const animationFrame = window.requestAnimationFrame(() => {
      setIsVisible(true);
      scheduleDismiss(AUTO_DISMISS_MS, notice.signature);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [clearDismissTimer, clearExitTimer, notice, scheduleDismiss]);

  useEffect(() => {
    if (isVisible || !renderedNotice) {
      return;
    }

    clearExitTimer();
    exitTimerRef.current = window.setTimeout(() => {
      setRenderedNotice((current) =>
        current?.signature === renderedNotice.signature ? null : current
      );
      exitTimerRef.current = null;
    }, EXIT_TRANSITION_MS);

    return clearExitTimer;
  }, [clearExitTimer, isVisible, renderedNotice]);

  useEffect(() => {
    return () => {
      clearDismissTimer();
      clearExitTimer();
    };
  }, [clearDismissTimer, clearExitTimer]);

  if (!renderedNotice) {
    return null;
  }

  const liveProps =
    renderedNotice.kind === "error"
      ? { role: "alert" as const, "aria-live": "assertive" as const }
      : { role: "status" as const, "aria-live": "polite" as const };

  const handlePointerEnter = () => {
    hoveredRef.current = true;
    if (dismissDeadlineRef.current !== null) {
      remainingTimeRef.current = Math.max(0, dismissDeadlineRef.current - Date.now());
    }
    clearDismissTimer();
  };

  const handlePointerLeave = () => {
    hoveredRef.current = false;

    if (!notice || notice.signature !== renderedNotice.signature) {
      return;
    }

    scheduleDismiss(remainingTimeRef.current || AUTO_DISMISS_MS, renderedNotice.signature);
  };

  return (
    <div className="site-notice-layer" aria-hidden={isVisible ? undefined : "true"}>
      <aside
        className={`site-notice-popout is-${isVisible ? "visible" : "hidden"} is-${renderedNotice.kind}`}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        {...liveProps}
      >
        <p className="site-notice-label">{getNoticeLabel(renderedNotice.kind)}</p>
        <p className="site-notice-message">{renderedNotice.message}</p>
      </aside>
    </div>
  );
}
