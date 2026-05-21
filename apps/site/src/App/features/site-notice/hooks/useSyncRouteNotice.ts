import { useContext, useEffect, useRef } from "react";
import { SiteNoticeContext } from "../context/SiteNoticeContext";
import type { SiteNoticePayload } from "../types";
import type { NoticeKind } from "../../../types/notice";

const createRouteNoticeSourceId = () => `route-notice-${Math.random().toString(36).slice(2, 10)}`;

const toDisplayKind = (noticeKind: NoticeKind): SiteNoticePayload["kind"] =>
  noticeKind === "error" ? "error" : "success";

type UseSyncRouteNoticeOptions = {
  notice: string | null;
  noticeKind: NoticeKind;
};

export const useSyncRouteNotice = ({ notice, noticeKind }: UseSyncRouteNoticeOptions) => {
  const context = useContext(SiteNoticeContext);
  const sourceIdRef = useRef(createRouteNoticeSourceId());
  const sequenceRef = useRef(0);
  const previousNoticeRef = useRef<{ message: string; kind: NoticeKind } | null>(null);

  if (!context) {
    throw new Error("useSyncRouteNotice must be used within SiteNoticeProvider.");
  }

  useEffect(() => {
    const sourceId = sourceIdRef.current;
    return () => {
      context.setRouteNotice(sourceId, null);
    };
  }, [context]);

  useEffect(() => {
    const message = notice?.trim() ?? "";
    const previousNotice = previousNoticeRef.current;
    const hasChanged =
      previousNotice?.message !== message || previousNotice?.kind !== noticeKind;

    previousNoticeRef.current = {
      message,
      kind: noticeKind
    };

    if (!message) {
      context.setRouteNotice(sourceIdRef.current, null);
      return;
    }

    if (hasChanged) {
      sequenceRef.current += 1;
    }

    context.setRouteNotice(sourceIdRef.current, {
      signature: `${sourceIdRef.current}:${sequenceRef.current}`,
      message,
      kind: toDisplayKind(noticeKind)
    });
  }, [context, notice, noticeKind]);
};
