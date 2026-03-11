import { createContext } from "react";
import type { SiteNoticePayload } from "../types";

export type SiteNoticeContextValue = {
  setRouteNotice: (sourceId: string, notice: SiteNoticePayload | null) => void;
};

export const SiteNoticeContext = createContext<SiteNoticeContextValue | null>(null);
