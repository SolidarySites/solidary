import { useCallback, useEffect, useMemo, useState } from "react";
import { toExternalUrl } from "../../services/draft-utils";
import {
  loadRepoFontAssets,
  loadRepoMediaFolderContents,
  type RepoMediaFileEntry
} from "../../services/media-repo";
import type {
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  DraftState
} from "../../services/types";
import {
  createMediaFolderNodeState,
  pageBodyReferencesImagePath,
  resolveRepoContextFromDraftState,
  type MediaFolderNodeState,
  type MediaImageUsageEntry
} from "./shared";

type UseMediaLibraryOptions = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  draftState: DraftState | null;
  pages: BuilderPage[];
  siteUrl: string;
  publishedSiteBaseUrl: string | null;
};

export const useMediaLibrary = ({
  activeSection,
  activeSettingsSection,
  draftState,
  pages,
  siteUrl,
  publishedSiteBaseUrl
}: UseMediaLibraryOptions) => {
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [mediaFolderNodes, setMediaFolderNodes] = useState<Record<string, MediaFolderNodeState>>({});
  const [repoFontAssets, setRepoFontAssets] = useState<RepoMediaFileEntry[]>([]);

  const refreshMediaAssets = useCallback(async () => {
    const repoContext = resolveRepoContextFromDraftState(draftState);
    if (!repoContext) {
      setMediaLoading(false);
      setMediaFolderNodes({
        "": {
          ...createMediaFolderNodeState({ path: "", name: "solidary-media" }),
          error: "Draft repository settings are missing."
        }
      });
      setRepoFontAssets([]);
      setMediaWarning(null);
      setMediaError("Draft repository settings are missing.");
      return;
    }

    setMediaLoading(true);
    setMediaError(null);
    setMediaFolderNodes({
      "": {
        ...createMediaFolderNodeState({ path: "", name: "solidary-media" }),
        loading: true
      }
    });

    try {
      const [fontAssets, rootContents] = await Promise.all([
        loadRepoFontAssets({
          repoFullName: repoContext.repoFullName,
          branch: repoContext.branch
        }),
        loadRepoMediaFolderContents({
          repoFullName: repoContext.repoFullName,
          branch: repoContext.branch,
          folderPath: ""
        })
      ]);

      setRepoFontAssets(fontAssets.fonts);
      setMediaWarning(fontAssets.warning ?? rootContents.warning);
      setMediaFolderNodes(() => {
        const rootNode: MediaFolderNodeState = {
          path: "",
          name: "solidary-media",
          folders: rootContents.folders,
          images: rootContents.images,
          loaded: true,
          loading: false,
          error: null
        };

        const next: Record<string, MediaFolderNodeState> = {
          "": rootNode
        };

        rootContents.folders.forEach((folder) => {
          next[folder.path] = createMediaFolderNodeState({
            path: folder.path,
            name: folder.name
          });
        });

        return next;
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to load repository media files.";
      setMediaError(message);
      setMediaWarning(null);
      setRepoFontAssets([]);
      setMediaFolderNodes({
        "": {
          ...createMediaFolderNodeState({ path: "", name: "solidary-media" }),
          error: message
        }
      });
    } finally {
      setMediaLoading(false);
    }
  }, [draftState]);

  const ensureMediaFolderLoaded = useCallback((folderPath: string, folderName: string) => {
    const normalizedPath = folderPath.trim().replace(/^\/+|\/+$/g, "");
    const currentNode = mediaFolderNodes[normalizedPath];
    if (currentNode?.loaded || currentNode?.loading) return;

    const repoContext = resolveRepoContextFromDraftState(draftState);
    if (!repoContext) return;

    setMediaFolderNodes((current) => {
      const existing = current[normalizedPath];
      return {
        ...current,
        [normalizedPath]: {
          ...(existing ??
            createMediaFolderNodeState({
              path: normalizedPath,
              name: folderName
            })),
          loading: true,
          error: null
        }
      };
    });

    void (async () => {
      try {
        const contents = await loadRepoMediaFolderContents({
          repoFullName: repoContext.repoFullName,
          branch: repoContext.branch,
          folderPath: normalizedPath
        });
        setMediaFolderNodes((current) => {
          const existing = current[normalizedPath];
          const next: Record<string, MediaFolderNodeState> = {
            ...current,
            [normalizedPath]: {
              path: normalizedPath,
              name: existing?.name ?? folderName,
              folders: contents.folders,
              images: contents.images,
              loaded: true,
              loading: false,
              error: null
            }
          };

          contents.folders.forEach((folder) => {
            if (next[folder.path]) return;
            next[folder.path] = createMediaFolderNodeState({
              path: folder.path,
              name: folder.name
            });
          });

          return next;
        });
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Unable to load folder contents.";
        setMediaFolderNodes((current) => {
          const existing = current[normalizedPath];
          return {
            ...current,
            [normalizedPath]: {
              ...(existing ??
                createMediaFolderNodeState({
                  path: normalizedPath,
                  name: folderName
                })),
              loading: false,
              loaded: false,
              error: message
            }
          };
        });
      }
    })();
  }, [draftState, mediaFolderNodes]);

  useEffect(() => {
    if (activeSection !== "settings" || activeSettingsSection !== "media") {
      setMediaLoading(false);
      return;
    }

    void refreshMediaAssets();
  }, [activeSection, activeSettingsSection, refreshMediaAssets]);

  const mediaRootFolderNode = mediaFolderNodes[""] ?? null;
  const mediaImageUsageByKey = useMemo<Record<string, MediaImageUsageEntry[]>>(() => {
    const usageByKey: Record<string, MediaImageUsageEntry[]> = {};

    Object.values(mediaFolderNodes).forEach((node) => {
      node.images.forEach((imageObject) => {
        const candidatePaths = new Set<string>();
        imageObject.variants.forEach((variant) => {
          const publicPath = variant.publicPath.trim();
          if (publicPath) {
            candidatePaths.add(publicPath);
            candidatePaths.add(publicPath.replace(/^\/+/, ""));
          }
        });

        const candidates = Array.from(candidatePaths);
        usageByKey[imageObject.key] = pages
          .filter((page) => pageBodyReferencesImagePath(page.body ?? "", candidates))
          .map((page) => ({
            slug: page.slug,
            title: page.title.trim() || page.slug || "Untitled page"
          }));
      });
    });

    return usageByKey;
  }, [mediaFolderNodes, pages]);

  const mediaCanonicalBaseUrl = useMemo(() => {
    const external = toExternalUrl(siteUrl);
    if (!external) return null;
    return external.replace(/\/+$/, "");
  }, [siteUrl]);

  const previewAssetBaseUrl = useMemo(() => {
    const candidates = [publishedSiteBaseUrl, toExternalUrl(siteUrl)];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      return trimmed.replace(/\/+$/, "");
    }
    return null;
  }, [publishedSiteBaseUrl, siteUrl]);

  return {
    mediaWarning,
    mediaError,
    mediaLoading,
    mediaCanonicalBaseUrl,
    mediaRootFolderNode,
    mediaFolderNodes,
    mediaImageUsageByKey,
    repoFontAssets,
    refreshMediaAssets,
    ensureMediaFolderLoaded,
    previewAssetBaseUrl
  };
};
