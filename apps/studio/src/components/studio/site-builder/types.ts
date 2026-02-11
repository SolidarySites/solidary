import type { AstroPageDraft } from "../../../studio/astro";
import type { RepoFileSet } from "../../../studio/types";

export type BuilderPage = AstroPageDraft & {
  id?: string;
  position?: number | null;
  isHome?: boolean;
};

export type FooterCustomLink = {
  label: string;
  url: string;
};

export type HeaderOptions = {
  disabled: boolean;
  fixed: boolean;
  brandText: string;
  disableBrand: boolean;
};

export type FooterOptions = {
  disabled: boolean;
  fixed: boolean;
  disableCopyright: boolean;
  copyrightName: string;
  customText: string;
  customLinks: FooterCustomLink[];
};

export type BuilderSection = "menu" | "content" | "settings" | "format_text";

export type BuilderSettingsSection = "pages" | "header" | "footer" | "styles";

export type DraftState = {
  id: string;
  repoFullName: string;
  branch: string;
  files: RepoFileSet;
};

export type GitHubPublishPhase = "pending" | "queued" | "in_progress" | "deployed" | "failed";

export type GitHubPublishStatusResponse = {
  phase: GitHubPublishPhase;
  message?: string;
  runUrl?: string;
  pagesUrl?: string;
  runStatus?: string;
  runConclusion?: string | null;
};

export type PublishFeedback = {
  kind: "progress" | "success" | "error";
  text: string;
  runUrl?: string;
  pagesUrl?: string;
};
