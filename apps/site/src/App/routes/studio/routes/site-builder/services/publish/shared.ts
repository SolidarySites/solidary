import { supabase } from "../../../../../../lib/supabase";
import { githubRequest } from "../../../../../../services/github";
import { toBase64 } from "../../../../../../lib/base64";
import { normalizeSiteImagePathForStorage } from "../../../../../../lib/site-image-url";
import {
  BYTES_100_KB,
  BYTES_500_KB,
  BYTES_1_MB,
  processImageVariantsFromOriginal
} from "../../../../../../services/image-processing/picsquish";
import {
  DEFAULT_OG_IMAGE_URL,
  getSitePathFromStoragePath,
  isDraftStoragePublicUrl,
  normalizeSitePath,
  SITE_DRAFT_IMAGES_BUCKET,
  SOLIDARY_MEDIA_IMAGES_BASE_PATH
} from "../draft-utils";
import type { BuilderEditableSectionKey, DraftImageAsset } from "../types";

const SITE_IMAGE_PUBLIC_PATH = `${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/site-image.jpg`;
const SITE_IMAGE_REPO_PATH = `public${SITE_IMAGE_PUBLIC_PATH}`;
const SITE_IMAGE_THUMB_REPO_PATH = `public${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/site-image_thumb.jpg`;
const OG_IMAGE_REPO_PATH = `public${DEFAULT_OG_IMAGE_URL}`;

export const normalizeEditorTouchedSections = (value: string[] | null | undefined) =>
  (value ?? []).filter(
    (entry): entry is BuilderEditableSectionKey =>
      entry === "metadata" ||
      entry === "pages" ||
      entry === "header" ||
      entry === "footer" ||
      entry === "head" ||
      entry === "styles"
  );

export const normalizeSlugSet = (value: string[] | null | undefined): Set<string> =>
  new Set((value ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean));

export const getPublishImageInfo = ({
  siteImage,
  computedSlug,
  draftImageUrl,
  siteImagePreview,
  siteUrl
}: {
  siteImage: File | null;
  computedSlug: string;
  draftImageUrl: string | null;
  siteImagePreview: string | null;
  siteUrl: string;
}) => {
  void computedSlug;
  const existingImagePath = normalizeSiteImagePathForStorage({
    siteUrl,
    imageUrl: draftImageUrl || siteImagePreview || "",
    fallbackPath: ""
  });
  const hasSiteImage = Boolean(siteImage) || Boolean(existingImagePath && existingImagePath !== DEFAULT_OG_IMAGE_URL);
  const imageUrl = hasSiteImage ? SITE_IMAGE_PUBLIC_PATH : DEFAULT_OG_IMAGE_URL;
  return { imageUrl };
};

export const uploadSiteImageAssetsToGitHub = async ({
  ownerLogin,
  repoName,
  branch,
  siteImage,
  message
}: {
  ownerLogin: string;
  repoName: string;
  branch: string;
  siteImage: File;
  message: string;
}) => {
  const processedImages = await processImageVariantsFromOriginal({
    sourceImage: siteImage,
    sourceMimeType: siteImage.type,
    variants: [
      {
        key: "siteImage",
        label: "Site image",
        maxBytes: BYTES_1_MB
      },
      {
        key: "siteImageThumb",
        label: "Site image thumbnail",
        maxBytes: BYTES_100_KB
      },
      {
        key: "ogImage",
        label: "OG image",
        maxBytes: BYTES_500_KB,
        maxDimensionLimit: 1200
      }
    ] as const,
    jpegQuality: 0.9,
    jpegDpi: 72
  });

  await githubRequest("github-contents-batch-commit", {
    owner: ownerLogin,
    repo: repoName,
    branch,
    message,
    upserts: [
      {
        path: SITE_IMAGE_REPO_PATH,
        mode: "100644",
        content: toBase64(await processedImages.siteImage.arrayBuffer())
      },
      {
        path: SITE_IMAGE_THUMB_REPO_PATH,
        mode: "100644",
        content: toBase64(await processedImages.siteImageThumb.arrayBuffer())
      },
      {
        path: OG_IMAGE_REPO_PATH,
        mode: "100644",
        content: toBase64(await processedImages.ogImage.arrayBuffer())
      }
    ],
    deletes: []
  });
};

export const loadDraftImagesForDraft = async (targetDraftId: string): Promise<DraftImageAsset[]> => {
  const { data, error } = await supabase
    .from("site_draft_images")
    .select("id, storage_path, public_url, site_path, uploaded_at")
    .eq("draft_id", targetDraftId)
    .order("uploaded_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((image) => {
      const storagePath = typeof image.storage_path === "string" ? image.storage_path : "";
      const fallbackSitePath = getSitePathFromStoragePath(storagePath);
      const sitePath =
        typeof image.site_path === "string" && image.site_path.trim()
          ? normalizeSitePath(image.site_path)
          : fallbackSitePath;

      return {
        id: typeof image.id === "string" ? image.id : undefined,
        storagePath,
        publicUrl: typeof image.public_url === "string" ? image.public_url : "",
        sitePath,
        uploadedAt: typeof image.uploaded_at === "string" ? image.uploaded_at : undefined
      };
    })
    .filter((image) => image.storagePath && image.publicUrl && image.sitePath);
};

export const syncConnectedSiteUrls = async (siteId: string) => {
  const { error } = await supabase.rpc("site_connection_sync_site_links", {
    p_site_id: siteId
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const uploadDraftImagesToGitHub = async ({
  providerToken,
  ownerLogin,
  repoName,
  branch,
  images
}: {
  providerToken: string;
  ownerLogin: string;
  repoName: string;
  branch: string;
  images: DraftImageAsset[];
}) => {
  void providerToken;
  for (const image of images) {
    const sitePath = normalizeSitePath(image.sitePath);
    if (!sitePath || !image.storagePath.trim()) continue;
    if (!isDraftStoragePublicUrl(image.publicUrl)) continue;
    const repoPath = `public${sitePath}`;

    const { data: downloadData, error: downloadError } = await supabase.storage
      .from(SITE_DRAFT_IMAGES_BUCKET)
      .download(image.storagePath);
    if (downloadError) {
      throw new Error(downloadError.message);
    }

    const content = toBase64(await downloadData.arrayBuffer());
    await githubRequest("github-contents-write", {
      owner: ownerLogin,
      repo: repoName,
      path: repoPath,
      message: `Upload draft image ${sitePath}`,
      content,
      branch
    });
  }
};
