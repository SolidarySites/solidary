import type { RepoFileSet } from "../../../features/site-draft/types";
import { parseSolidaryJson } from "../../../features/site-draft/services/solidary";
import type { DraftItem, StudioAccessRole, StudioSiteListItem } from "./studio-types";

export const findSolidaryFile = (files: RepoFileSet) =>
  files["public/.well-known/solidary-links.json"] ??
  files[".well-known/solidary-links.json"] ??
  files.solidary ??
  "";

export const getDraftSiteTitle = (item: DraftItem) => {
  const solidary = parseSolidaryJson(findSolidaryFile(item.files));
  return solidary?.title ?? item.repo_full_name;
};

export const mapDraftItemToSiteListItem = (
  item: DraftItem,
  options: { accessRole?: StudioAccessRole } = {}
): StudioSiteListItem => {
  const solidary = parseSolidaryJson(findSolidaryFile(item.files));
  return {
    id: item.id,
    title: solidary?.title ?? item.repo_full_name,
    description: solidary?.description ?? "",
    repoFullName: item.repo_full_name,
    repoHtmlUrl: `https://github.com/${item.repo_full_name}`,
    siteUrl: solidary?.site_url ?? "",
    accessRole: options.accessRole ?? item.access_role,
    updatedAt: item.updated_at
  };
};
