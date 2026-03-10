import type { RepoFileSet } from "../../../features/site-draft/types";
import { parseSolidaryJson } from "../../../features/site-draft/services/solidary";
import { resolveSiteImageUrl, resolveSiteThumbnailUrl } from "../../../lib/site-image-url";
import type { DraftItem, StudioAccessRole, StudioSiteListItem } from "./studio-types";

export const findSolidaryFile = (files: RepoFileSet) =>
  files["public/.well-known/solidary.json"] ??
  files[".well-known/solidary.json"] ??
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
  const siteUrl = solidary?.site_url ?? "";
  const siteImageUrl = solidary?.site_image ?? "";
  const siteImageThumbUrl = solidary?.site_image_thumb ?? "";
  const accessRole = options.accessRole ?? item.access_role;
  return {
    id: item.id,
    title: solidary?.title ?? item.repo_full_name,
    description: solidary?.description ?? "",
    imageUrl: siteImageThumbUrl
      ? resolveSiteImageUrl(siteUrl, siteImageThumbUrl)
      : resolveSiteThumbnailUrl({ siteUrl, fallbackImageUrl: siteImageUrl }),
    repoFullName: item.repo_full_name,
    repoHtmlUrl: `https://github.com/${item.repo_full_name}`,
    siteUrl,
    accessRole,
    canDelete: accessRole === "owner",
    canManageSettings: accessRole === "owner" || accessRole === "admin",
    updatedAt: item.updated_at
  };
};
