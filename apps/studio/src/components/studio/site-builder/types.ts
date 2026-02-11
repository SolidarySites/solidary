import type { AstroPageDraft } from "../../../studio/astro";
import type { RepoFileSet } from "../../../studio/types";

export type BuilderPage = AstroPageDraft & {
  id?: string;
  position?: number | null;
  isHome?: boolean;
};

export type BuilderSection = "content" | "pages" | "styles" | "settings";

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
