import type { Session } from "@supabase/supabase-js";
import type { AstroPageDraft } from "../../../features/site-draft/types";
import {
  buildSolidaryLinksConnection,
  SOLIDARY_LINKS_INDEX_TYPE
} from "../../../features/site-draft/services/solidary-links";
import {
  BYTES_100_KB,
  BYTES_1_MB,
  BYTES_500_KB
} from "../../../services/image-processing/picsquish";
import { prepareCreationImage } from "../../../services/image-processing/creation-images";
import {
  buildWellKnownFiles,
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_OG_IMAGE_URL,
  SITE_IMAGE_PATH,
  SITE_IMAGE_THUMB_PATH
} from "./provisioning/content";
import { provisionGitHubRepository } from "./provisioning/github-provisioning";
import { loadRootIndex, saveProvisionedSiteDraft } from "./provisioning/persistence";

type ProvisionSiteDraftParams = {
  session: Session;
  supabaseAccessToken: string;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  computedSlug: string;
  siteImage: File | null;
  templateSolidary: string;
  templateSolidaryLinks: string;
  tokensCss: string;
  pages: AstroPageDraft[];
  onStep: (value: string) => void;
  onSiteUrlResolved: (value: string) => void;
};

const SITE_CREATE_IMAGE_VARIANTS = [
  {
    key: "siteImage",
    label: "Site image",
    maxBytes: BYTES_1_MB
  },
  {
    key: "siteImageThumb",
    label: "Site thumbnail",
    maxBytes: BYTES_100_KB
  },
  {
    key: "ogImage",
    label: "OG image",
    maxBytes: BYTES_500_KB,
    maxDimensionLimit: 1200
  }
] as const;

export const provisionSiteDraft = async ({
  session,
  supabaseAccessToken,
  siteId,
  siteTitle,
  siteDescription,
  siteUrl,
  computedSlug,
  siteImage,
  templateSolidary,
  templateSolidaryLinks,
  tokensCss,
  pages,
  onStep,
  onSiteUrlResolved
}: ProvisionSiteDraftParams): Promise<string> => {
  if (siteImage && siteImage.type && !siteImage.type.startsWith("image/")) {
    throw new Error("Site image must be an image file.");
  }

  const slug = computedSlug || `site-${Date.now()}`;
  let siteImageContentB64: string | undefined;
  let siteImageThumbContentB64: string | undefined;
  let ogImageContentB64: string | undefined;
  let siteImageOriginalStoragePath: string | undefined;
  let siteImageOriginalMimeType: string | undefined;

  if (siteImage) {
    onStep("Optimizing site image...");
    const preparedImage = await prepareCreationImage({
      file: siteImage,
      ownerUserId: session.user.id,
      stagingFolder: "create-site",
      stagingId: siteId,
      variants: SITE_CREATE_IMAGE_VARIANTS,
      jpegQuality: 0.9,
      jpegDpi: 72
    });

    if (preparedImage.mode === "optimized") {
      siteImageContentB64 = preparedImage.imagesB64.siteImage;
      siteImageThumbContentB64 = preparedImage.imagesB64.siteImageThumb;
      ogImageContentB64 = preparedImage.imagesB64.ogImage;
    } else {
      siteImageOriginalStoragePath = preparedImage.originalStoragePath;
      siteImageOriginalMimeType = preparedImage.originalMimeType;
    }
  }

  const provisionedRepo = await provisionGitHubRepository({
    supabaseAccessToken,
    siteId,
    siteTitle,
    siteDescription,
    slug,
    siteImagePath: siteImage ? SITE_IMAGE_PATH : undefined,
    siteImageContentB64,
    siteImageOriginalStoragePath,
    siteImageOriginalMimeType,
    siteImageThumbPath: siteImage ? SITE_IMAGE_THUMB_PATH : undefined,
    siteImageThumbContentB64,
    ogImagePath: siteImage ? DEFAULT_OG_IMAGE_PATH : undefined,
    ogImageContentB64,
    onStep
  });
  onSiteUrlResolved(provisionedRepo.siteUrlResolved);
  const imageUrl = DEFAULT_OG_IMAGE_URL;
  const siteRecordImageUrl = siteImage ? `/${SITE_IMAGE_PATH.replace(/^public\//, "")}` : imageUrl;
  const rootIndex = await loadRootIndex();
  const rootConnectionUuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${siteId}`;

  const { solidaryFile, solidaryLinksFile } = buildWellKnownFiles({
    templateSolidary,
    templateSolidaryLinks,
    siteId,
    siteTitle,
    siteDescription,
    siteUrl,
    hasSiteImage: Boolean(siteImage),
    urlOverride: provisionedRepo.siteUrlResolved,
    connectionsOverride: [
      buildSolidaryLinksConnection({
        connectionUuid: rootConnectionUuid,
        connectedSiteId: rootIndex.id,
        connectedSiteUrl: rootIndex.canonical_url ?? "",
        connectedSiteType: SOLIDARY_LINKS_INDEX_TYPE
      })
    ]
  });

  onStep("Launching your site...");
  await saveProvisionedSiteDraft({
    session,
    siteId,
    siteTitle,
    siteDescription,
    siteUrl,
    siteUrlResolved: provisionedRepo.siteUrlResolved,
    siteRecordImageUrl,
    imageUrl,
    repoFullName: provisionedRepo.repoFullName,
    defaultBranch: provisionedRepo.defaultBranch,
    solidaryFile,
    solidaryLinksFile,
    tokensCss,
    pages,
    rootIndex,
    rootConnectionUuid
  });

  return siteId;
};
