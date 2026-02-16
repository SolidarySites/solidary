import type { AstroPageDraft } from "../../../studio/astro";
import type { RepoFileSet } from "../../../studio/types";

export type BuilderPage = AstroPageDraft & {
  id?: string;
  position?: number | null;
  isHome?: boolean;
};

export type DraftImageAsset = {
  id?: string;
  storagePath: string;
  publicUrl: string;
  sitePath: string;
  uploadedAt?: string;
};

export type HeaderOptions = {
  disabled: boolean;
  fixed: boolean;
  brandText: string;
  disableBrand: boolean;
};

export type FooterModuleAlignment = "left" | "center" | "right";

export type FooterModule = {
  content: string;
  alignment: FooterModuleAlignment;
};

export type FooterOptions = {
  disabled: boolean;
  fixed: boolean;
  modules: FooterModule[];
};

export type SiteAccessRole = "owner" | "admin" | "editor" | "viewer";

export type BuilderSection = "menu" | "content" | "settings";

export type BuilderSettingsSection = "pages" | "header" | "footer" | "styles";

export type DraftState = {
  id: string;
  repoFullName: string;
  branch: string;
  ownerUserId: string;
  revision: number;
  lastEditedAt?: string | null;
  lastEditedByUserId?: string | null;
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
