export type RepoFileSet = Record<string, string>;

export type AstroHeader = {
  disabled: boolean;
  fixed: boolean;
  brandText: string;
  disableBrand: boolean;
};

export type AstroFooter = {
  disabled: boolean;
  fixed: boolean;
  modules: Array<{
    content: string;
    alignment: "left" | "center" | "right";
  }>;
};

export type AstroSettings = {
  title: string;
  description: string;
  siteUrl: string;
  ogImage: string;
  headHtml?: string;
  header: AstroHeader;
  footer: AstroFooter;
};

export type AstroPageDraft = {
  title: string;
  slug: string;
  body: string;
  javascript?: string;
  showInNav: boolean;
  navOrder?: number;
};
