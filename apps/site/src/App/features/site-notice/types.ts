export type SiteNoticeDisplayKind = "error" | "success" | "warning";

export type SiteNoticePayload = {
  signature: string;
  message: string;
  kind: SiteNoticeDisplayKind;
};
