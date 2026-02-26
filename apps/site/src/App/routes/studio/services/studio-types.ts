import type { RepoFileSet } from "../../../features/site-draft/types";

export type StudioAccessRole = "owner" | "admin" | "editor" | "viewer";

export type DraftItem = {
  id: string;
  site_id?: string;
  repo_full_name: string;
  branch: string;
  files: RepoFileSet;
  owner_user_id: string;
  access_role: StudioAccessRole;
  updated_at?: string;
};

export type StudioSiteListItem = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  repoFullName: string;
  repoHtmlUrl: string;
  siteUrl: string;
  accessRole?: StudioAccessRole;
  canDelete?: boolean;
  updatedAt?: string;
};
