import type { DraftState } from "../../services/types";
import type {
  RepoImageObject,
  RepoMediaFolderEntry
} from "../../services/media-repo";

export type RepoContext = {
  owner: string;
  repo: string;
  branch: string;
  repoFullName: string;
};

export type MediaFolderNodeState = {
  path: string;
  name: string;
  folders: RepoMediaFolderEntry[];
  images: RepoImageObject[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

export type MediaImageUsageEntry = {
  slug: string;
  title: string;
};

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif"
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const resolveRepoContextFromDraftState = (draftState: DraftState | null): RepoContext | null => {
  const repoFullName = draftState?.repoFullName?.trim() ?? "";
  const [owner, repo] = repoFullName.split("/");
  const branch = (draftState?.editorBranch ?? draftState?.branch ?? "").trim();
  if (!owner || !repo || !branch || !repoFullName) return null;

  return {
    owner,
    repo,
    branch,
    repoFullName
  };
};

export const getImageUploadExtension = (file: File): string => {
  const extensionFromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extensionFromName) return extensionFromName;
  return IMAGE_EXTENSION_BY_MIME[file.type] ?? "png";
};

export const getFilenameExtension = (filename: string) =>
  filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";

export const getBasePathFromSiteUrl = (siteUrl: string) => {
  const trimmed = siteUrl.trim();
  if (!trimmed) return "";
  try {
    const pathname = new URL(trimmed).pathname.trim();
    if (!pathname || pathname === "/") return "";
    return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  } catch {
    return "";
  }
};

export const withBasePath = (basePath: string, path: string) => {
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  if (!basePath) return normalizedPath;
  return `${basePath}${normalizedPath}`;
};

export const createMediaFolderNodeState = ({
  path,
  name
}: {
  path: string;
  name: string;
}): MediaFolderNodeState => ({
  path,
  name,
  folders: [],
  images: [],
  loaded: false,
  loading: false,
  error: null
});

export const pageBodyReferencesImagePath = (pageBody: string, candidatePaths: string[]) => {
  const body = pageBody.trim();
  if (!body || candidatePaths.length === 0) return false;

  const escapedCandidates = candidatePaths
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => escapeRegExp(value));
  if (!escapedCandidates.length) return false;
  const combined = escapedCandidates.join("|");

  const figurePattern = new RegExp(
    `<figure\\b[^>]*>[\\s\\S]*?(?:${combined})[\\s\\S]*?<\\/figure>`,
    "i"
  );
  if (figurePattern.test(body)) return true;

  const htmlImagePattern = new RegExp(
    `<img\\b[^>]*?(?:src|srcset)\\s*=\\s*["'][^"']*(?:${combined})[^"']*["'][^>]*>`,
    "i"
  );
  if (htmlImagePattern.test(body)) return true;

  const markdownImagePattern = new RegExp(`!\\[[^\\]]*\\]\\([^)]*(?:${combined})[^)]*\\)`, "i");
  return markdownImagePattern.test(body);
};
