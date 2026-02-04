export type Flow = "choose" | "site" | "index" | "provisioning" | "editor";

export type NoticeKind = "error" | "notice" | null;

export type SiteDraft = {
  id: string;
  title: string;
  imageUrl: string;
  imagePath: string;
  description: string;
  slug: string;
  repoFullName: string;
  repoHtmlUrl: string;
  defaultBranch: string;
  siteUrl: string;
  siteUrlRoot: string;
  baseUrl: string;
};

export type RepoFileSet = {
  index: string;
  config: string;
  solidary: string;
  readme: string;
};
