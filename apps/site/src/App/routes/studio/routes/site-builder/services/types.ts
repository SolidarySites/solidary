import type { AstroPageDraft } from "../../../../../features/site-draft/types";
import type { RepoFileSet } from "../../../../../features/site-draft/types";

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

export type BuilderImageFormatConversion = "none" | "webp" | "jpg";

export type BuilderImageUploadOptions = {
  noCompression: boolean;
  convertFormat: BuilderImageFormatConversion;
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

export type SiteAccessRole = "owner" | "admin" | "editor" | "contributor";
export type CollaboratorRole = "admin" | "editor" | "contributor";
export type DraftType = "owner" | "editor";

export type CollaboratorSearchResult = {
  userId: string;
  email: string;
  displayName: string;
  githubLogin: string | null;
};

export type ManagedCollaboratorSyncState = "synced" | "pending_invite" | "unknown";

export type ManagedCollaborator = {
  userId: string;
  role: CollaboratorRole;
  email: string;
  displayName: string;
  githubLogin: string | null;
  syncState: ManagedCollaboratorSyncState;
};

export type BuilderSection = "menu" | "content" | "settings";

export type BuilderSettingsSection = "pages" | "header" | "footer" | "styles";

export type BuilderEditableSectionKey = "metadata" | "pages" | "header" | "footer" | "styles";

export type DraftState = {
  id: string;
  siteId: string;
  repoFullName: string;
  branch: string;
  ownerUserId: string;
  draftType: DraftType;
  sourceOwnerDraftId?: string | null;
  touchedSections: Array<BuilderEditableSectionKey>;
  touchedPageSlugs: string[];
  deletedPageSlugs: string[];
  editorBranch?: string | null;
  lastPullRequestNumber?: number | null;
  lastPullRequestUrl?: string | null;
  lastPullRequestState?: string | null;
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
