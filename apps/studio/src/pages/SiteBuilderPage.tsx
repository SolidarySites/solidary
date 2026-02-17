import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import type {
  AstroTemplatePreviewHandle,
  PreviewSelectedImage
} from "../components/studio/AstroTemplatePreview";
import BuilderPreviewPanel from "../components/studio/site-builder/BuilderPreviewPanel";
import BuilderSidebar from "../components/studio/site-builder/BuilderSidebar";
import BuilderTopbar from "../components/studio/site-builder/BuilderTopbar";
import {
  buildFiles,
  buildSettingsPayload,
  buildSolidaryFile
} from "../components/studio/site-builder/build-files";
import {
  FILE_KEYS,
  PAGE_PATH_PREFIX,
  PAGE_PATH_SUFFIX
} from "../components/studio/site-builder/constants";
import { loadDraftById } from "../components/studio/site-builder/load-draft";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  DraftImageAsset,
  DraftState,
  FooterModule,
  FooterModuleAlignment,
  PublishFeedback,
  SiteAccessRole
} from "../components/studio/site-builder/types";
import { usePublishStatusTracking } from "../components/studio/site-builder/usePublishStatusTracking";
import {
  getPageSafeSlug,
  makeUniquePageSlug,
  stripFrontmatter
} from "../components/studio/site-builder/utils";
import type { NoticeKind } from "../studio/types";
import templateSolidary from "../templates/astro/solidary-links.json?raw";
import homeTemplate from "../../../../templates/astro-baseline/src/content/pages/home.md?raw";
import tokensTemplate from "../templates/astro/tokens.css?raw";
import { githubRequest, listDirectory } from "../studio/github";
import { slugify, toBase64 } from "../studio/utils";

const defaultHomeContent = stripFrontmatter(homeTemplate);
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const SITE_DRAFT_IMAGES_BUCKET = "site-draft-images";
const SOLIDARY_MEDIA_IMAGES_BASE_PATH = "/solidary-media/images";
const SOLIDARY_MEDIA_UPLOADS_BASE_PATH = `${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/uploads`;
const DEFAULT_OG_IMAGE_URL = `${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/og/og-default.jpg`;
const DEFAULT_FOOTER_MODULES: FooterModule[] = [
  { content: "%copyright%", alignment: "left" },
  { content: "", alignment: "center" },
  { content: "", alignment: "right" }
];
const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif"
};

const getImageExtension = (file: File) => {
  const extensionFromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extensionFromName) return extensionFromName;
  return IMAGE_EXTENSION_BY_MIME[file.type] ?? "png";
};

const normalizeSitePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const toExternalUrl = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const footerModuleAlignmentFallback: FooterModuleAlignment[] = ["left", "center", "right"];

const normalizeFooterModules = (modules: FooterModule[]) => {
  const normalized = modules
    .slice(0, 3)
    .map((module, index) => ({
      content: typeof module?.content === "string" ? module.content : "",
      alignment:
        module?.alignment === "left" || module?.alignment === "center" || module?.alignment === "right"
          ? module.alignment
          : (footerModuleAlignmentFallback[index] ?? "left")
    }));
  while (normalized.length < 3) {
    const alignment = footerModuleAlignmentFallback[normalized.length] ?? "left";
    normalized.push({
      content: "",
      alignment
    });
  }
  return normalized;
};

const getSitePathFromStoragePath = (storagePath: string) => {
  const normalized = storagePath.trim();
  if (!normalized) return "";
  const filename = normalized.split("/").pop()?.trim();
  if (!filename) return "";
  return `${SOLIDARY_MEDIA_UPLOADS_BASE_PATH}/${filename}`;
};

const isDraftStoragePublicUrl = (publicUrl: string) => {
  const trimmed = publicUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.includes(`/storage/v1/object/public/${SITE_DRAFT_IMAGES_BUCKET}/`);
  } catch {
    return false;
  }
};

const replaceDraftImageUrlsWithSitePaths = (body: string, draftImages: DraftImageAsset[]) => {
  let nextBody = body;
  draftImages.forEach((image) => {
    const publicUrl = image.publicUrl.trim();
    const sitePath = normalizeSitePath(image.sitePath);
    if (!publicUrl || !sitePath) return;
    nextBody = nextBody.replaceAll(publicUrl, sitePath);
  });
  return nextBody;
};

type DraftSaveSettingsInput = Parameters<typeof buildSettingsPayload>[0];

type DraftPageRow = {
  draft_id: string;
  slug: string;
  title: string;
  content: string;
  show_in_nav: boolean;
  position: number;
  is_home: boolean;
};

type DraftRevisionRow = {
  revision: number | null;
  last_edited_at: string | null;
  last_edited_by_user_id: string | null;
};

type BatchCommitResponse = {
  commitSha?: string;
  noChanges?: boolean;
};

type PresencePayload = {
  user_id?: string;
  name?: string;
  role?: SiteAccessRole;
  active_page_slug?: string | null;
  at?: string;
};

type DraftPresenceMember = {
  userId: string;
  name: string;
  role: SiteAccessRole | null;
  activePageSlug: string | null;
};

type SectionLockEntry = {
  sectionKey: BuilderEditableSectionKey;
  userId: string;
  holderName: string;
  expiresAt: string;
};

type SectionLockRecord = Partial<Record<BuilderEditableSectionKey, SectionLockEntry>>;

type SectionLockAcquireResult = {
  acquired?: boolean;
  lock_user_id?: string | null;
  lock_name?: string | null;
  expires_at?: string | null;
};

const EDITABLE_SECTION_LABELS: Record<BuilderEditableSectionKey, string> = {
  metadata: "Solidary Metadata",
  pages: "Pages",
  header: "Header",
  footer: "Footer",
  styles: "Styles"
};

const getEditableSectionFromUi = (
  section: BuilderSection,
  settingsSection: BuilderSettingsSection
): BuilderEditableSectionKey | null => {
  if (section === "content") return "metadata";
  if (section !== "settings") return null;
  return settingsSection;
};

const isBuilderEditableSectionKey = (value: string): value is BuilderEditableSectionKey =>
  value === "metadata" ||
  value === "pages" ||
  value === "header" ||
  value === "footer" ||
  value === "styles";

class DraftConflictError extends Error {
  constructor() {
    super("This draft was updated by someone else. Reload to get the latest version.");
    this.name = "DraftConflictError";
  }
}

const buildDraftPageRows = (
  draftId: string,
  pagesSnapshot: BuilderPage[],
  draftImages: DraftImageAsset[]
): DraftPageRow[] =>
  pagesSnapshot.map((page, index) => ({
    draft_id: draftId,
    slug: getPageSafeSlug(page, index),
    title: page.title.trim() || page.slug || `Page ${index + 1}`,
    content: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImages),
    show_in_nav: page.showInNav ?? true,
    position: index,
    is_home: Boolean(page.isHome)
  }));

const buildDraftSaveSignature = ({
  draftId,
  settingsInput,
  imageUrl,
  tokensCss,
  pagesSnapshot,
  draftImages
}: {
  draftId: string;
  settingsInput: DraftSaveSettingsInput;
  imageUrl: string;
  tokensCss: string;
  pagesSnapshot: BuilderPage[];
  draftImages: DraftImageAsset[];
}) =>
  JSON.stringify({
    settings: buildSettingsPayload(settingsInput, imageUrl),
    styles: {
      tokensCss
    },
    pages: buildDraftPageRows(draftId, pagesSnapshot, draftImages).map((row) => ({
      slug: row.slug,
      title: row.title,
      content: row.content,
      show_in_nav: row.show_in_nav,
      position: row.position,
      is_home: row.is_home
    }))
  });

export default function SiteBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [activeSection, setActiveSection] = useState<BuilderSection>("menu");
  const [activeSettingsSection, setActiveSettingsSection] = useState<BuilderSettingsSection>("pages");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState("Preparing your updates...");
  const [sessionResolved, setSessionResolved] = useState(false);

  const [siteTitle, setSiteTitle] = useState("New Astro Site");
  const [siteDescription, setSiteDescription] = useState("Describe your site in a sentence or two.");
  const [siteUrl, setSiteUrl] = useState("");

  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);

  const [pages, setPages] = useState<BuilderPage[]>([]);
  const [draftImages, setDraftImages] = useState<DraftImageAsset[]>([]);
  const [draftPageSlugs, setDraftPageSlugs] = useState<string[]>([]);
  const [activePreviewSlug, setActivePreviewSlug] = useState("home");
  const [headerDisabled, setHeaderDisabled] = useState(false);
  const [headerFixed, setHeaderFixed] = useState(false);
  const [headerBrandText, setHeaderBrandText] = useState("New Astro Site");
  const [headerBrandDisabled, setHeaderBrandDisabled] = useState(false);

  const [footerDisabled, setFooterDisabled] = useState(false);
  const [footerFixed, setFooterFixed] = useState(false);
  const [footerModules, setFooterModules] = useState<FooterModule[]>(
    normalizeFooterModules(DEFAULT_FOOTER_MODULES)
  );

  const [tokensCss, setTokensCss] = useState(tokensTemplate);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [siteAccessRole, setSiteAccessRole] = useState<SiteAccessRole | null>(null);
  const [activePresenceMembers, setActivePresenceMembers] = useState<DraftPresenceMember[]>([]);
  const [isDraftLoading, setIsDraftLoading] = useState(() => {
    const initialDraftId =
      searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId;
    return Boolean(initialDraftId);
  });
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploadingInlineImage, setUploadingInlineImage] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<PublishFeedback | null>(null);
  const [selectedEditorImage, setSelectedEditorImage] = useState<PreviewSelectedImage | null>(null);
  const [lastSavedDraftSignature, setLastSavedDraftSignature] = useState("");
  const [sectionLocks, setSectionLocks] = useState<SectionLockRecord>({});
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  const pageTitleRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<AstroTemplatePreviewHandle | null>(null);
  const draftPresenceChannelRef = useRef<RealtimeChannel | null>(null);
  const hasInitializedHeaderBrand = useRef(false);
  const cleanedPublishedDraftIdRef = useRef<string | null>(null);
  const shouldCaptureLoadedDraftSignature = useRef(false);
  const sectionTransitionInFlightRef = useRef(false);

  const draftId = useMemo(
    () => searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId ?? null,
    [location.state, searchParams]
  );
  const computedSlug = useMemo(() => slugify(siteTitle), [siteTitle]);
  const shouldLoadDraft = Boolean(draftId);
  const sessionUserId = session?.user.id ?? null;
  const isOwner = siteAccessRole === "owner";
  const canEditDraft =
    siteAccessRole === "owner" || siteAccessRole === "admin" || siteAccessRole === "editor";
  const canPublishByRole = siteAccessRole === "owner" || siteAccessRole === "admin";
  const activeEditableSection = useMemo(
    () => getEditableSectionFromUi(activeSection, activeSettingsSection),
    [activeSection, activeSettingsSection]
  );
  const activeSectionLock = activeEditableSection ? sectionLocks[activeEditableSection] : null;
  const activeSectionLockedByOther = Boolean(
    activeSectionLock && activeSectionLock.userId !== sessionUserId
  );
  const sidebarSectionLocks = useMemo(
    () =>
      Object.entries(sectionLocks).reduce(
        (accumulator, [sectionKey, lock]) => {
          if (!lock) return accumulator;
          accumulator[sectionKey as BuilderEditableSectionKey] = {
            holderName: lock.holderName,
            isSelf: lock.userId === sessionUserId
          };
          return accumulator;
        },
        {} as Partial<
          Record<
            BuilderEditableSectionKey,
            {
              holderName: string;
              isSelf: boolean;
            }
          >
        >
      ),
    [sectionLocks, sessionUserId]
  );
  const pagesLock = sectionLocks.pages;
  const pagesLockedByOther = Boolean(pagesLock && pagesLock.userId !== sessionUserId);
  const hasForeignSectionLocks = useMemo(
    () => Object.values(sectionLocks).some((lock) => Boolean(lock && lock.userId !== sessionUserId)),
    [sectionLocks, sessionUserId]
  );
  const canEditPageContent =
    canEditDraft &&
    activeSection === "settings" &&
    activeSettingsSection === "pages" &&
    !pagesLockedByOther;
  const previewReadOnlyMessage = useMemo(() => {
    if (shouldLoadDraft && isDraftLoading) return null;
    if (draftLoadError) return null;
    if (!canEditDraft) return "This draft is read-only for your current role.";
    if (activeSection !== "settings" || activeSettingsSection !== "pages") {
      return "Open Pages to edit content in the live preview.";
    }
    if (pagesLockedByOther) {
      return `${pagesLock?.holderName ?? "Another collaborator"} is editing Pages right now.`;
    }
    return null;
  }, [
    activeSection,
    activeSettingsSection,
    canEditDraft,
    draftLoadError,
    isDraftLoading,
    pagesLock?.holderName,
    pagesLockedByOther,
    shouldLoadDraft
  ]);
  const collaboratorPresenceNames = useMemo(
    () =>
      activePresenceMembers
        .filter((member) => member.userId !== sessionUserId)
        .map((member) => member.name),
    [activePresenceMembers, sessionUserId]
  );
  const sessionDisplayName = useMemo(() => {
    const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
    const candidates = [
      metadata.user_name,
      metadata.preferred_username,
      metadata.name,
      session?.user.email
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "Unknown";
  }, [session]);
  const publishedSiteBaseUrl = useMemo(() => {
    if (publishFeedback?.kind !== "success") return null;
    const candidate = publishFeedback.pagesUrl?.trim() || siteUrl.trim();
    return candidate || null;
  }, [publishFeedback, siteUrl]);
  const liveSiteUrl = toExternalUrl(publishedSiteBaseUrl ?? siteUrl);
  const githubRepoFullName = draftState?.repoFullName?.trim() ?? "";
  const githubRepoUrl = githubRepoFullName ? `https://github.com/${githubRepoFullName}` : null;
  const siteSettingsInput = useMemo(
    () => ({
      siteTitle,
      siteDescription,
      siteUrl,
      header: {
        disabled: headerDisabled,
        fixed: headerFixed,
        brandText: headerBrandText,
        disableBrand: headerBrandDisabled
      },
      footer: {
        disabled: footerDisabled,
        fixed: footerFixed,
        modules: normalizeFooterModules(footerModules)
      }
    }),
    [
      siteTitle,
      siteDescription,
      siteUrl,
      headerDisabled,
      headerFixed,
      headerBrandText,
      headerBrandDisabled,
      footerDisabled,
      footerFixed,
      footerModules
    ]
  );
  const draftSaveImageUrl = useMemo(() => {
    if (siteImage) return draftImageUrl || DEFAULT_OG_IMAGE_URL;
    return siteImagePreview || draftImageUrl || DEFAULT_OG_IMAGE_URL;
  }, [siteImage, siteImagePreview, draftImageUrl]);
  const currentDraftSignature = useMemo(() => {
    if (!draftState) return "";
    return buildDraftSaveSignature({
      draftId: draftState.id,
      settingsInput: siteSettingsInput,
      imageUrl: draftSaveImageUrl,
      tokensCss,
      pagesSnapshot: pages,
      draftImages
    });
  }, [draftImages, draftSaveImageUrl, draftState, pages, siteSettingsInput, tokensCss]);
  const hasUnsavedChanges =
    Boolean(draftState) && !isDraftLoading && currentDraftSignature !== lastSavedDraftSignature;

  const { startPublishStatusTracking, cancelPublishStatusTracking } = usePublishStatusTracking({
    onPublishFeedback: setPublishFeedback,
    onPublishError: (message) => {
      setNotice(message);
      setNoticeKind("error");
    },
    onPublishSuccess: (message) => {
      setNotice(message);
      setNoticeKind("notice");
    }
  });

  useEffect(() => {
    if (publishFeedback?.kind !== "success") return;
    if (!draftState?.id) return;
    if (cleanedPublishedDraftIdRef.current === draftState.id) return;

    (async () => {
      const normalizedPublishedBaseUrl = (publishedSiteBaseUrl ?? "").trim().replace(/\/+$/, "");
      if (!normalizedPublishedBaseUrl) {
        setNotice("Site is live, but image cleanup skipped: missing published site URL.");
        setNoticeKind("error");
        return;
      }

      const accessToken = session?.access_token?.trim() ?? "";
      const response = await fetch("/.netlify/functions/cleanup-draft-images", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          draftId: draftState.id,
          publishedSiteBaseUrl: normalizedPublishedBaseUrl
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : "Cleanup request failed.";
        setNotice(`Site is live, but image cleanup failed: ${errorMessage}`);
        setNoticeKind("error");
        return;
      }

      cleanedPublishedDraftIdRef.current = draftState.id;

      const updatedRows = Array.isArray(payload?.updated) ? payload.updated : [];
      if (!updatedRows.length) return;

      const byId = new Map<string, { publicUrl: string; sitePath: string }>();
      updatedRows.forEach((row: unknown) => {
        if (!row || typeof row !== "object") return;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : "";
        const publicUrl = typeof record.publicUrl === "string" ? record.publicUrl.trim() : "";
        const sitePath =
          typeof record.sitePath === "string" ? normalizeSitePath(record.sitePath) : "";
        if (!id || !publicUrl || !sitePath) return;
        byId.set(id, { publicUrl, sitePath });
      });

      if (!byId.size) return;

      setDraftImages((current) =>
        current.map((image) => {
          const imageId = typeof image.id === "string" ? image.id : "";
          const updated = imageId ? byId.get(imageId) : null;
          if (!updated) return image;
          return {
            ...image,
            publicUrl: updated.publicUrl,
            sitePath: updated.sitePath
          };
        })
      );
    })();
  }, [draftState?.id, publishFeedback?.kind, publishedSiteBaseUrl, session?.access_token]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setSessionResolved(true);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setSessionResolved(true);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!siteImage) {
      setSiteImagePreview(null);
      return;
    }

    const url = URL.createObjectURL(siteImage);
    setSiteImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [siteImage]);

  useEffect(() => {
    if (!draftId) {
      setIsDraftLoading(false);
      setDraftLoadError(null);
      setDraftImages([]);
      setSiteAccessRole(null);
      setActivePresenceMembers([]);
      setLastSavedDraftSignature("");
      setSectionLocks({});
      cleanedPublishedDraftIdRef.current = null;
      shouldCaptureLoadedDraftSignature.current = false;
      return;
    }

    if (!sessionResolved) {
      setIsDraftLoading(true);
      setDraftLoadError(null);
      return;
    }

    if (!sessionUserId) {
      setIsDraftLoading(false);
      setDraftLoadError("Sign in to load this draft.");
      return;
    }

    let mounted = true;
    shouldCaptureLoadedDraftSignature.current = false;
    setIsDraftLoading(true);
    setDraftLoadError(null);
    (async () => {
      try {
        const loaded = await loadDraftById({
          draftId,
          defaultHomeContent,
          userId: sessionUserId
        });

        if (!mounted) return;

        const loadedDraftImages = loaded.draftImages ?? [];
        setDraftState(loaded.draftState);
        setSiteAccessRole(loaded.accessRole);
        setDraftImages(loadedDraftImages);
        setPages(
          loaded.pages.map((page) => ({
            ...page,
            body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", loadedDraftImages)
          }))
        );
        setDraftPageSlugs(loaded.draftPageSlugs);
        if (loaded.initialActivePreviewSlug) {
          setActivePreviewSlug(loaded.initialActivePreviewSlug);
        }

        if (loaded.siteTitle) {
          setSiteTitle(loaded.siteTitle);
        }
        if (loaded.header) {
          setHeaderDisabled(loaded.header.disabled);
          setHeaderFixed(loaded.header.fixed);
          setHeaderBrandDisabled(loaded.header.disableBrand);
          setHeaderBrandText(
            loaded.header.brandText?.trim() || loaded.siteTitle?.trim() || "New Astro Site"
          );
          hasInitializedHeaderBrand.current = true;
        } else if (!hasInitializedHeaderBrand.current) {
          setHeaderBrandText(loaded.siteTitle?.trim() || "New Astro Site");
          hasInitializedHeaderBrand.current = true;
        }

        if (typeof loaded.siteDescription === "string") setSiteDescription(loaded.siteDescription);
        if (typeof loaded.siteUrl === "string") setSiteUrl(loaded.siteUrl);
        if (typeof loaded.tokensCss === "string") setTokensCss(loaded.tokensCss);
        if (typeof loaded.siteImagePreview === "string") setSiteImagePreview(loaded.siteImagePreview);
        if (typeof loaded.draftImageUrl === "string") setDraftImageUrl(loaded.draftImageUrl);
        if (loaded.footer) {
          setFooterDisabled(loaded.footer.disabled);
          setFooterFixed(loaded.footer.fixed);
          setFooterModules(normalizeFooterModules(loaded.footer.modules));
        } else {
          setFooterModules([...DEFAULT_FOOTER_MODULES]);
        }
        shouldCaptureLoadedDraftSignature.current = true;
      } catch (caught) {
        if (!mounted) return;
        const message = caught instanceof Error ? caught.message : "Failed to load draft.";
        setSiteAccessRole(null);
        setSectionLocks({});
        setDraftLoadError(message);
      } finally {
        if (mounted) {
          setIsDraftLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [draftId, sessionResolved, sessionUserId]);

  useEffect(() => {
    if (!shouldCaptureLoadedDraftSignature.current) return;
    if (isDraftLoading || !draftState) return;
    setLastSavedDraftSignature(currentDraftSignature);
    shouldCaptureLoadedDraftSignature.current = false;
  }, [currentDraftSignature, draftState, isDraftLoading]);

  useEffect(() => {
    if (!draftState?.id || !sessionUserId || !siteAccessRole) {
      void draftPresenceChannelRef.current?.unsubscribe();
      draftPresenceChannelRef.current = null;
      setActivePresenceMembers([]);
      return;
    }

    const channel = supabase.channel(`draft-presence:${draftState.id}`, {
      config: {
        presence: {
          key: sessionUserId
        }
      }
    });
    draftPresenceChannelRef.current = channel;

    const syncPresence = () => {
      const state = channel.presenceState<PresencePayload>();
      const membersByUserId = new Map<string, DraftPresenceMember>();

      Object.values(state)
        .flat()
        .forEach((payload) => {
          const userId = typeof payload.user_id === "string" ? payload.user_id.trim() : "";
          if (!userId) return;
          const roleValue =
            payload.role === "owner" ||
            payload.role === "admin" ||
            payload.role === "editor" ||
            payload.role === "viewer"
              ? payload.role
              : null;
          const existing = membersByUserId.get(userId);
          if (existing) return;
          membersByUserId.set(userId, {
            userId,
            role: roleValue,
            name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Unknown",
            activePageSlug:
              typeof payload.active_page_slug === "string" && payload.active_page_slug.trim()
                ? payload.active_page_slug
                : null
          });
        });

      setActivePresenceMembers(
        Array.from(membersByUserId.values()).sort((left, right) => left.name.localeCompare(right.name))
      );
    };

    channel.on("presence", { event: "sync" }, syncPresence);

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        user_id: sessionUserId,
        name: sessionDisplayName,
        role: siteAccessRole,
        active_page_slug: null,
        at: new Date().toISOString()
      } satisfies PresencePayload);
    });

    return () => {
      setActivePresenceMembers([]);
      if (draftPresenceChannelRef.current === channel) {
        draftPresenceChannelRef.current = null;
      }
      void channel.unsubscribe();
    };
  }, [draftState?.id, sessionDisplayName, sessionUserId, siteAccessRole]);

  useEffect(() => {
    const channel = draftPresenceChannelRef.current;
    if (!channel || !sessionUserId || !siteAccessRole) return;
    void channel.track({
      user_id: sessionUserId,
      name: sessionDisplayName,
      role: siteAccessRole,
      active_page_slug: activePreviewSlug,
      at: new Date().toISOString()
    } satisfies PresencePayload);
  }, [activePreviewSlug, sessionDisplayName, sessionUserId, siteAccessRole]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!canEditDraft) {
      if (draftState?.id && sessionUserId) {
        void (async () => {
          try {
            await supabase.rpc("site_draft_release_all_section_locks", {
              p_draft_id: draftState.id
            });
          } catch {
            // Ignore lock-release failures when losing edit access.
          }
        })();
      }
      if (activeSection !== "content" && activeSection !== "settings") return;
      setActiveSection("menu");
      return;
    }
    if (isOwner || activeSection !== "content") return;
    setActiveSection("menu");
  }, [activeSection, canEditDraft, draftState?.id, isOwner, sessionUserId]);

  const handleGitHubLogin = async () => {
    setNotice(null);
    setNoticeKind(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
        scopes: "repo delete_repo workflow"
      }
    });

    if (error) {
      setNotice(error.message);
      setNoticeKind("error");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const resetNotices = () => {
    setNotice(null);
    setNoticeKind(null);
  };

  const addPage = () => {
    const slug = makeUniquePageSlug("new-page", pages);
    setPages((items) => [
      ...items,
      {
        id: `new-${crypto.randomUUID()}`,
        title: "New page",
        slug,
        body: "<p>Write your page content here.</p>",
        showInNav: true,
        position: items.length
      }
    ]);
    setActivePreviewSlug(slug);
    setActiveSection("settings");
    setActiveSettingsSection("pages");
    requestAnimationFrame(() => pageTitleRef.current?.focus());
  };

  const updatePage = (index: number, updates: Partial<BuilderPage>) => {
    const existing = pages[index];
    if (existing && !existing.isHome) {
      const previousSlug = getPageSafeSlug(existing, index);
      const nextSlug = getPageSafeSlug({ ...existing, ...updates }, index);
      if (previousSlug !== nextSlug && activePreviewSlug === previousSlug) {
        setActivePreviewSlug(nextSlug);
      }
    }
    setPages((items) => items.map((item, idx) => (idx === index ? { ...item, ...updates } : item)));
  };

  const removePage = (index: number) => {
    const page = pages[index];
    if (!page || page.isHome) return;

    const removedSlug = getPageSafeSlug(page, index);
    setPages((items) => items.filter((_, idx) => idx !== index || items[idx]?.isHome));
    if (activePreviewSlug === removedSlug) {
      setActivePreviewSlug("home");
    }
  };

  const updatePageBody = (safeSlug: string, body: string) => {
    setPages((items) =>
      items.map((item, index) =>
        getPageSafeSlug(item, index) === safeSlug ? { ...item, body } : item
      )
    );
  };

  const updateDraftSolidaryFile = (solidaryFile: string) => {
    setDraftState((current) =>
      current
        ? {
            ...current,
            files: {
              [FILE_KEYS.solidary]: solidaryFile
            }
          }
        : current
    );
  };

  const applyDraftRevisionRow = (draftRow: DraftRevisionRow | null | undefined) => {
    if (!draftRow) return;
    setDraftState((current) =>
      current
        ? {
            ...current,
            revision: typeof draftRow.revision === "number" ? draftRow.revision : current.revision,
            lastEditedAt:
              typeof draftRow.last_edited_at === "string"
                ? draftRow.last_edited_at
                : (current.lastEditedAt ?? null),
            lastEditedByUserId:
              typeof draftRow.last_edited_by_user_id === "string"
                ? draftRow.last_edited_by_user_id
                : (current.lastEditedByUserId ?? null)
          }
        : current
    );
  };

  const saveDraftState = async (
    repoInfo: DraftState,
    solidaryFile: string,
    imageUrl: string,
    pagesSnapshot: BuilderPage[] = pages
  ) => {
    if (!canEditDraft) {
      throw new Error("Your current role is read-only for this draft.");
    }

    const nowIso = new Date().toISOString();
    const editorUserId = session?.user.id ?? null;
    const { data: draftRow, error: draftUpdateError } = await supabase
      .from("site_drafts")
      .update({
        branch: repoInfo.branch,
        commit_sha: "",
        files: {
          [FILE_KEYS.solidary]: solidaryFile
        },
        last_edited_by_user_id: editorUserId,
        last_edited_at: nowIso
      })
      .eq("id", repoInfo.id)
      .eq("revision", repoInfo.revision)
      .select("owner_user_id, revision, last_edited_at, last_edited_by_user_id")
      .maybeSingle();

    if (draftUpdateError) {
      throw new Error(draftUpdateError.message);
    }
    if (!draftRow) {
      throw new DraftConflictError();
    }

    applyDraftRevisionRow(draftRow);

    const { error: settingsError } = await supabase.from("site_draft_settings").upsert({
      draft_id: repoInfo.id,
      settings: buildSettingsPayload(siteSettingsInput, imageUrl),
      styles: {
        tokensCss
      }
    });

    if (settingsError) {
      throw new Error(settingsError.message);
    }

    const pageRows = buildDraftPageRows(repoInfo.id, pagesSnapshot, draftImages);
    const currentSlugs = pageRows.map((page) => page.slug);
    const deletedSlugs = draftPageSlugs.filter((slug) => !currentSlugs.includes(slug));

    if (deletedSlugs.length) {
      const { error: deleteError } = await supabase
        .from("site_draft_pages")
        .delete()
        .eq("draft_id", repoInfo.id)
        .in("slug", deletedSlugs);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    const { error: pagesError } = await supabase
      .from("site_draft_pages")
      .upsert(pageRows, { onConflict: "draft_id,slug" });

    if (pagesError) {
      throw new Error(pagesError.message);
    }

    setDraftPageSlugs(pageRows.map((page) => page.slug));
  };

  const buildDraftSignatureForState = ({
    pagesSnapshot = pages,
    imageUrl = draftSaveImageUrl
  }: {
    pagesSnapshot?: BuilderPage[];
    imageUrl?: string;
  } = {}) => {
    if (!draftState) return "";
    return buildDraftSaveSignature({
      draftId: draftState.id,
      settingsInput: siteSettingsInput,
      imageUrl,
      tokensCss,
      pagesSnapshot,
      draftImages
    });
  };

  const saveMetadataSection = async () => {
    if (!draftState) {
      throw new Error("Missing draft data.");
    }

    const imageUrl = siteImage
      ? draftImageUrl || DEFAULT_OG_IMAGE_URL
      : siteImagePreview || draftImageUrl || DEFAULT_OG_IMAGE_URL;
    const solidaryFile = buildSolidaryFile({
      templateSolidary,
      siteId: draftState.id,
      imageUrl,
      settingsInput: siteSettingsInput,
      urlOverride: siteUrl
    });
    const nowIso = new Date().toISOString();
    const editorUserId = session?.user.id ?? null;
    const { data: draftRow, error: draftError } = await supabase
      .from("site_drafts")
      .update({
        branch: draftState.branch,
        commit_sha: "",
        files: {
          [FILE_KEYS.solidary]: solidaryFile
        },
        last_edited_by_user_id: editorUserId,
        last_edited_at: nowIso
      })
      .eq("id", draftState.id)
      .select("revision, last_edited_at, last_edited_by_user_id")
      .maybeSingle();
    if (draftError) {
      throw new Error(draftError.message);
    }
    if (!draftRow) {
      throw new Error("Failed to save draft metadata.");
    }
    applyDraftRevisionRow(draftRow);
    updateDraftSolidaryFile(solidaryFile);

    const { error: settingsError } = await supabase.rpc("site_draft_upsert_settings_metadata", {
      p_draft_id: draftState.id,
      p_title: siteSettingsInput.siteTitle,
      p_description: siteSettingsInput.siteDescription,
      p_site_url: siteSettingsInput.siteUrl,
      p_og_image: imageUrl
    });
    if (settingsError) {
      throw new Error(settingsError.message);
    }

    return buildDraftSignatureForState({ imageUrl });
  };

  const savePagesSection = async () => {
    if (!draftState) {
      throw new Error("Missing draft data.");
    }

    const normalizedPages = pages.map((page) => ({
      ...page,
      body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImages)
    }));
    const pageRows = buildDraftPageRows(draftState.id, normalizedPages, draftImages);
    const currentSlugs = pageRows.map((page) => page.slug);
    const deletedSlugs = draftPageSlugs.filter((slug) => !currentSlugs.includes(slug));

    if (deletedSlugs.length) {
      const { error: deleteError } = await supabase
        .from("site_draft_pages")
        .delete()
        .eq("draft_id", draftState.id)
        .in("slug", deletedSlugs);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    const { error: upsertError } = await supabase
      .from("site_draft_pages")
      .upsert(pageRows, { onConflict: "draft_id,slug" });
    if (upsertError) {
      throw new Error(upsertError.message);
    }

    setPages(normalizedPages);
    setDraftPageSlugs(pageRows.map((page) => page.slug));

    return buildDraftSignatureForState({ pagesSnapshot: normalizedPages });
  };

  const saveHeaderSection = async () => {
    if (!draftState) {
      throw new Error("Missing draft data.");
    }
    const { error } = await supabase.rpc("site_draft_upsert_settings_header", {
      p_draft_id: draftState.id,
      p_header: siteSettingsInput.header
    });
    if (error) {
      throw new Error(error.message);
    }

    return buildDraftSignatureForState();
  };

  const saveFooterSection = async () => {
    if (!draftState) {
      throw new Error("Missing draft data.");
    }
    const { error } = await supabase.rpc("site_draft_upsert_settings_footer", {
      p_draft_id: draftState.id,
      p_footer: {
        ...siteSettingsInput.footer,
        modules: normalizeFooterModules(siteSettingsInput.footer.modules)
      }
    });
    if (error) {
      throw new Error(error.message);
    }

    return buildDraftSignatureForState();
  };

  const saveStylesSection = async () => {
    if (!draftState) {
      throw new Error("Missing draft data.");
    }
    const { error } = await supabase.rpc("site_draft_upsert_settings_styles", {
      p_draft_id: draftState.id,
      p_tokens_css: tokensCss
    });
    if (error) {
      throw new Error(error.message);
    }

    return buildDraftSignatureForState();
  };

  const saveSectionByKey = async (sectionKey: BuilderEditableSectionKey) => {
    if (!canEditDraft) return;
    if (!draftState) return;
    const lock = sectionLocks[sectionKey];
    if (lock && lock.userId !== sessionUserId) {
      throw new Error(`${lock.holderName} is editing ${EDITABLE_SECTION_LABELS[sectionKey]}.`);
    }

    if (sectionKey === "metadata") {
      return saveMetadataSection();
    } else if (sectionKey === "pages") {
      return savePagesSection();
    } else if (sectionKey === "header") {
      return saveHeaderSection();
    } else if (sectionKey === "footer") {
      return saveFooterSection();
    } else if (sectionKey === "styles") {
      return saveStylesSection();
    }

    return "";
  };

  const loadSectionLocks = useCallback(async (targetDraftId: string): Promise<SectionLockRecord> => {
    const { data, error } = await supabase
      .from("site_draft_section_locks")
      .select("section_key, locked_by_user_id, locked_by_name, expires_at")
      .eq("draft_id", targetDraftId);

    if (error) {
      throw new Error(error.message);
    }

    const nextLocks: SectionLockRecord = {};
    const nowTime = Date.now();
    (data ?? []).forEach((row) => {
      const sectionKey =
        typeof row.section_key === "string" && isBuilderEditableSectionKey(row.section_key)
          ? row.section_key
          : null;
      if (!sectionKey) return;
      const userId = typeof row.locked_by_user_id === "string" ? row.locked_by_user_id.trim() : "";
      const holderName =
        typeof row.locked_by_name === "string" && row.locked_by_name.trim()
          ? row.locked_by_name.trim()
          : "Unknown";
      const expiresAt = typeof row.expires_at === "string" ? row.expires_at : "";
      const expiresAtTime = Date.parse(expiresAt);
      if (!userId || !expiresAt || Number.isNaN(expiresAtTime) || expiresAtTime <= nowTime) return;

      nextLocks[sectionKey] = {
        sectionKey,
        userId,
        holderName,
        expiresAt
      };
    });
    setSectionLocks(nextLocks);
    return nextLocks;
  }, []);

  const acquireSectionLock = useCallback(async (sectionKey: BuilderEditableSectionKey) => {
    if (!draftState?.id || !canEditDraft || !sessionUserId) return false;
    const { data, error } = await supabase.rpc("site_draft_acquire_section_lock", {
      p_draft_id: draftState.id,
      p_section_key: sectionKey,
      p_holder_name: sessionDisplayName,
      p_ttl_seconds: 45
    });
    if (error) {
      throw new Error(error.message);
    }

    const response = (Array.isArray(data) ? data[0] : data) as SectionLockAcquireResult | null | undefined;
    const lockUserId =
      typeof response?.lock_user_id === "string" && response.lock_user_id.trim()
        ? response.lock_user_id.trim()
        : "";
    const lockName =
      typeof response?.lock_name === "string" && response.lock_name.trim()
        ? response.lock_name.trim()
        : "Unknown";
    const expiresAt =
      typeof response?.expires_at === "string" && response.expires_at.trim()
        ? response.expires_at
        : new Date(Date.now() + 45_000).toISOString();

    setSectionLocks((current) => {
      const next = { ...current };
      if (!lockUserId) {
        delete next[sectionKey];
        return next;
      }
      next[sectionKey] = {
        sectionKey,
        userId: lockUserId,
        holderName: lockName,
        expiresAt
      };
      return next;
    });

    return Boolean(response?.acquired && lockUserId === sessionUserId);
  }, [canEditDraft, draftState?.id, sessionDisplayName, sessionUserId]);

  const releaseSectionLock = useCallback(async (sectionKey: BuilderEditableSectionKey) => {
    if (!draftState?.id || !sessionUserId) return;
    const { error } = await supabase.rpc("site_draft_release_section_lock", {
      p_draft_id: draftState.id,
      p_section_key: sectionKey
    });
    if (error) {
      throw new Error(error.message);
    }
    setSectionLocks((current) => {
      const next = { ...current };
      delete next[sectionKey];
      return next;
    });
  }, [draftState?.id, sessionUserId]);

  useEffect(() => {
    if (!draftState?.id || !sessionUserId) {
      setSectionLocks({});
      return;
    }

    void loadSectionLocks(draftState.id).catch(() => undefined);
    const intervalId = window.setInterval(() => {
      void loadSectionLocks(draftState.id).catch(() => undefined);
    }, 8_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [draftState?.id, loadSectionLocks, sessionUserId]);

  useEffect(() => {
    if (!draftState?.id || !sessionUserId || !canEditDraft || !activeEditableSection) return;
    void acquireSectionLock(activeEditableSection)
      .then((acquired) => {
        if (!acquired) {
          void loadSectionLocks(draftState.id).catch(() => undefined);
        }
      })
      .catch(() => undefined);

    const intervalId = window.setInterval(() => {
      void acquireSectionLock(activeEditableSection)
        .then((acquired) => {
          if (!acquired) {
            void loadSectionLocks(draftState.id).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }, 15_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    acquireSectionLock,
    activeEditableSection,
    canEditDraft,
    draftState?.id,
    loadSectionLocks,
    sessionUserId
  ]);

  useEffect(() => {
    if (!draftState?.id || !sessionUserId) return;

    const releaseLocks = () => {
      void supabase.rpc("site_draft_release_all_section_locks", {
        p_draft_id: draftState.id
      });
    };

    window.addEventListener("pagehide", releaseLocks);
    return () => {
      window.removeEventListener("pagehide", releaseLocks);
      releaseLocks();
    };
  }, [draftState?.id, sessionUserId]);

  const loadDraftImagesForDraft = async (targetDraftId: string): Promise<DraftImageAsset[]> => {
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

  const uploadDraftImagesToGitHub = async ({
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
      await githubRequest("/.netlify/functions/github-contents-write", {
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        path: repoPath,
        message: `Upload draft image ${sitePath}`,
        content,
        branch
      });
    }
  };

  const handlePublish = async () => {
    resetNotices();
    setPublishFeedback(null);
    cancelPublishStatusTracking();
    cleanedPublishedDraftIdRef.current = null;

    if (!canPublishByRole) {
      setNotice("Only owners or admins can publish this site.");
      setNoticeKind("error");
      return;
    }

    if (hasForeignSectionLocks) {
      setNotice("Wait for collaborators to finish their current section edits before publishing.");
      setNoticeKind("error");
      return;
    }

    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    const providerToken = (session as { provider_token?: string }).provider_token;
    if (!providerToken) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    if (!siteTitle.trim() || !siteDescription.trim()) {
      setNotice("Title and description are required.");
      setNoticeKind("error");
      return;
    }

    setIsProvisioning(true);
    const publishStartedAt = new Date().toISOString();

    try {
      if (!draftState) {
        throw new Error("Missing site draft. Create a site first.");
      }

      const normalizedTitle = siteTitle.trim();
      const [ownerLogin, repoName] = draftState.repoFullName.split("/");
      if (!ownerLogin || !repoName) {
        throw new Error("Invalid repository name.");
      }

      const slug = computedSlug || `site-${Date.now()}`;
      const imagePath = siteImage
        ? `public${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/site-image-${slug}.jpg`
        : `public${DEFAULT_OG_IMAGE_URL}`;
      const imageUrl = siteImage
        ? `/${imagePath.replace(/^public\//, "")}`
        : draftImageUrl || siteImagePreview || DEFAULT_OG_IMAGE_URL;
      const normalizedPages = pages.map((page) => ({
        ...page,
        body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImages)
      }));
      const solidaryFile = buildSolidaryFile({
        templateSolidary,
        siteId: draftState.id,
        imageUrl,
        settingsInput: siteSettingsInput,
        urlOverride: siteUrl
      });
      const draftSignatureAfterSave = buildDraftSaveSignature({
        draftId: draftState.id,
        settingsInput: siteSettingsInput,
        imageUrl,
        tokensCss,
        pagesSnapshot: normalizedPages,
        draftImages
      });

      setProvisionStep("Saving draft...");
      await saveDraftState(draftState, solidaryFile, imageUrl, normalizedPages);
      updateDraftSolidaryFile(solidaryFile);
      setPages(normalizedPages);
      setLastSavedDraftSignature(draftSignatureAfterSave);

      if (siteImage) {
        setProvisionStep("Uploading site image...");
        const imageBase64 = toBase64(await siteImage.arrayBuffer());
        await githubRequest("/.netlify/functions/github-contents-write", {
          token: providerToken,
          owner: ownerLogin,
          repo: repoName,
          path: imagePath,
          message: "Update site image",
          content: imageBase64,
          branch: draftState.branch
        });
      }

      setProvisionStep("Loading draft images...");
      const draftImagesForPublish = await loadDraftImagesForDraft(draftState.id);
      setDraftImages(draftImagesForPublish);
      const publishPages = normalizedPages.map((page) => ({
        ...page,
        body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImagesForPublish)
      }));
      setPages(publishPages);
      if (draftImagesForPublish.length) {
        setProvisionStep("Uploading draft images...");
        await uploadDraftImagesToGitHub({
          providerToken,
          ownerLogin,
          repoName,
          branch: draftState.branch,
          images: draftImagesForPublish
        });
      }

      const files = buildFiles({
        siteId: draftState.id,
        imageUrl,
        settingsInput: siteSettingsInput,
        tokensCss,
        templateSolidary,
        pages: publishPages,
        defaultHomeContent,
        urlOverride: siteUrl
      });

      setProvisionStep("Preparing content changes...");
      const repoEntries = await listDirectory(
        providerToken,
        ownerLogin,
        repoName,
        PAGE_PATH_PREFIX.replace(/\/$/, ""),
        draftState.branch
      ).catch(() => []);
      const desiredPagePaths = new Set(
        publishPages.map((page, index) => {
          const safeSlug = getPageSafeSlug(page, index);
          return `${PAGE_PATH_PREFIX}${safeSlug}${PAGE_PATH_SUFFIX}`;
        })
      );
      const deletePaths: string[] = [];
      for (const entry of repoEntries) {
        if (entry.type !== "file" || !entry.path?.endsWith(PAGE_PATH_SUFFIX)) continue;
        if (!desiredPagePaths.has(entry.path)) {
          deletePaths.push(entry.path);
        }
      }

      setProvisionStep("Publishing content files...");
      await githubRequest<BatchCommitResponse>("/.netlify/functions/github-contents-batch-commit", {
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        branch: draftState.branch,
        message: "Publish site content",
        upserts: Object.entries(files).map(([path, content]) => ({
          path,
          mode: "100644",
          content: toBase64(new TextEncoder().encode(content).buffer)
        })),
        deletes: deletePaths
      });

      setProvisionStep("Updating site metadata...");
      const { error: siteError } = await supabase.from("sites").upsert({
        id: draftState.id,
        canonical_url: siteUrl.trim(),
        title: normalizedTitle,
        description: siteDescription.trim(),
        image_url: imageUrl,
        meta: {
          completion: "complete",
          source: "studio"
        }
      });
      if (siteError) {
        throw new Error(siteError.message);
      }

      setDraftImageUrl(imageUrl);
      setProvisionStep("Starting deployment status checks...");
      const branchResult = await githubRequest<{ sha?: string }>("/.netlify/functions/github-branch", {
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        branch: draftState.branch
      });
      const publishHeadSha = branchResult.sha?.trim() ?? "";
      if (!publishHeadSha) {
        throw new Error("Failed to resolve branch head after publish.");
      }
      startPublishStatusTracking({
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        branch: draftState.branch,
        headSha: publishHeadSha,
        publishStartedAt
      });
      setNotice(null);
      setNoticeKind(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draftState || savingDraft) return;
    if (!canEditDraft) {
      setNotice("Your role is read-only for this site.");
      setNoticeKind("error");
      return;
    }
    const sectionKey = activeEditableSection;
    if (!sectionKey) {
      setNotice("Open a section to save your latest changes.");
      setNoticeKind("error");
      return;
    }
    setSavingDraft(true);
    try {
      const savedSignature = await saveSectionByKey(sectionKey);
      if (typeof savedSignature === "string" && savedSignature) {
        setLastSavedDraftSignature(savedSignature);
      } else {
        setLastSavedDraftSignature(currentDraftSignature);
      }
      setNotice(`${EDITABLE_SECTION_LABELS[sectionKey]} saved.`);
      setNoticeKind("notice");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setSavingDraft(false);
    }
  };

  const runPreviewCommand = (command: string, value?: string) => {
    if (!canEditPageContent) return;
    previewRef.current?.execCommand(command, value);
  };

  const runPreviewLink = () => {
    if (!canEditPageContent) return;
    const url = window.prompt("Link URL");
    if (!url) return;
    previewRef.current?.execCommand("createLink", url);
  };

  const capturePreviewSelection = () => {
    previewRef.current?.captureSelection();
  };

  const handleSelectedEditorImageAltChange = (value: string) => {
    setSelectedEditorImage((current) => (current ? { ...current, alt: value } : current));
    previewRef.current?.updateSelectedImageAlt(value);
  };

  const handleSelectedEditorImageCaptionChange = (value: string) => {
    setSelectedEditorImage((current) => (current ? { ...current, caption: value } : current));
    previewRef.current?.updateSelectedImageCaption(value);
  };

  const handleSelectedEditorImageSizeChange = (value: number) => {
    const clamped = Math.min(100, Math.max(1, Number.isNaN(value) ? 100 : Math.round(value)));
    setSelectedEditorImage((current) =>
      current ? { ...current, sizePercent: clamped } : current
    );
    previewRef.current?.updateSelectedImageSize(clamped);
  };

  const handleInlineImageUpload = async (file: File): Promise<void> => {
    resetNotices();

    if (!canEditPageContent) {
      const message = "Open Pages and make sure the section lock is available to edit content.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!file.type.startsWith("image/")) {
      const message = "Select an image file to insert.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      const message = "Image is too large. Max upload size is 5 MB.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!session) {
      const message = "Sign in with GitHub to upload images.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!draftState) {
      const message = "Create or load a draft before uploading images.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    const fileBaseName = slugify(file.name.replace(/\.[^/.]+$/, "")) || "image";
    const fileExtension = getImageExtension(file);
    const filename = `${Date.now()}-${fileBaseName}-${crypto.randomUUID().slice(0, 8)}.${fileExtension}`;
    const storagePath = `drafts/${draftState.id}/${filename}`;
    const sitePath = `${SOLIDARY_MEDIA_UPLOADS_BASE_PATH}/${filename}`;

    try {
      setUploadingInlineImage(true);
      const { error: uploadError } = await supabase.storage
        .from(SITE_DRAFT_IMAGES_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined
        });
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from(SITE_DRAFT_IMAGES_BUCKET)
        .getPublicUrl(storagePath);

      const imageUrl = publicUrlData.publicUrl?.trim();
      if (!imageUrl) {
        throw new Error("Failed to generate a public image URL.");
      }

      const { error: metadataError } = await supabase.from("site_draft_images").insert({
        draft_id: draftState.id,
        storage_path: storagePath,
        public_url: imageUrl,
        site_path: sitePath
      });
      if (metadataError) {
        await supabase.storage.from(SITE_DRAFT_IMAGES_BUCKET).remove([storagePath]);
        throw new Error(metadataError.message);
      }

      setDraftImages((items) => [
        ...items,
        {
          storagePath,
          publicUrl: imageUrl,
          sitePath,
          uploadedAt: new Date().toISOString()
        }
      ]);
      previewRef.current?.execCommand("insertImage", imageUrl);
      setNotice("Image uploaded and inserted.");
      setNoticeKind("notice");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to upload image.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    } finally {
      setUploadingInlineImage(false);
    }
  };

  const handlePageTitleChange = (index: number, nextTitle: string) => {
    const page = pages[index];
    if (!page) return;
    if (page.isHome) {
      updatePage(index, { title: nextTitle });
      return;
    }

    updatePage(index, {
      title: nextTitle,
      slug: makeUniquePageSlug(nextTitle || page.slug || "page", pages, index)
    });
  };

  const handlePageSlugChange = (index: number, nextSlug: string) => {
    const page = pages[index];
    if (!page || page.isHome) return;
    updatePage(index, {
      slug: makeUniquePageSlug(nextSlug || "page", pages, index)
    });
  };

  const headerNavItems = useMemo(
    () =>
      pages
        .map((page, index) => ({
          page,
          safeSlug: getPageSafeSlug(page, index)
        }))
        .filter(({ page }) => page.showInNav !== false)
        .map(({ page, safeSlug }) => ({
          slug: safeSlug,
          label: page.title.trim() || "Untitled page"
        })),
    [pages]
  );

  const moveHeaderNavItem = (slug: string, direction: -1 | 1) => {
    setPages((items) => {
      const navIndices = items
        .map((page, index) => ({
          index,
          slug: getPageSafeSlug(page, index),
          showInNav: page.showInNav !== false
        }))
        .filter((item) => item.showInNav);
      const currentNavIndex = navIndices.findIndex((item) => item.slug === slug);
      if (currentNavIndex === -1) return items;
      const targetNavIndex = currentNavIndex + direction;
      if (targetNavIndex < 0 || targetNavIndex >= navIndices.length) return items;

      const fromIndex = navIndices[currentNavIndex].index;
      const toIndex = navIndices[targetNavIndex].index;
      const next = [...items];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
  };

  const updateFooterModuleContent = (index: number, value: string) => {
    setFooterModules((items) => {
      const next = normalizeFooterModules(items);
      if (index < 0 || index >= next.length) return next;
      next[index] = {
        ...next[index],
        content: value
      };
      return next;
    });
  };

  const updateFooterModuleAlignment = (index: number, alignment: FooterModuleAlignment) => {
    setFooterModules((items) => {
      const next = normalizeFooterModules(items);
      if (index < 0 || index >= next.length) return next;
      next[index] = {
        ...next[index],
        alignment
      };
      return next;
    });
  };

  const moveFooterModule = (index: number, direction: -1 | 1) => {
    setFooterModules((items) => {
      const next = normalizeFooterModules(items);
      const target = index + direction;
      if (index < 0 || index >= next.length || target < 0 || target >= next.length) {
        return next;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const switchEditorSection = async (
    nextSection: BuilderSection,
    nextSettingsSection: BuilderSettingsSection
  ) => {
    if (sectionTransitionInFlightRef.current) return;
    sectionTransitionInFlightRef.current = true;

    const currentSectionKey = getEditableSectionFromUi(activeSection, activeSettingsSection);
    const nextSectionKey = getEditableSectionFromUi(nextSection, nextSettingsSection);
    const isSameDestination =
      nextSection === activeSection && nextSettingsSection === activeSettingsSection;
    if (isSameDestination) {
      sectionTransitionInFlightRef.current = false;
      return;
    }

    let acquiredNextLock = false;

    try {
      if (nextSectionKey && nextSectionKey !== currentSectionKey) {
        const acquired = await acquireSectionLock(nextSectionKey);
        if (!acquired) {
          const latestLocks =
            draftState?.id ? await loadSectionLocks(draftState.id).catch(() => ({} as SectionLockRecord)) : {};
          const lockHolder = latestLocks[nextSectionKey]?.holderName ?? "Another collaborator";
          setNotice(`${lockHolder} is editing ${EDITABLE_SECTION_LABELS[nextSectionKey]}.`);
          setNoticeKind("error");
          return;
        }
        acquiredNextLock = true;
      }

      if (currentSectionKey && currentSectionKey !== nextSectionKey && canEditDraft && draftState) {
        const savedSignature = await saveSectionByKey(currentSectionKey);
        if (typeof savedSignature === "string" && savedSignature) {
          setLastSavedDraftSignature(savedSignature);
        } else {
          setLastSavedDraftSignature(currentDraftSignature);
        }
        await releaseSectionLock(currentSectionKey);
      }

      if (nextSection !== activeSection) {
        setActiveSection(nextSection);
      }
      if (nextSettingsSection !== activeSettingsSection) {
        setActiveSettingsSection(nextSettingsSection);
      }
    } catch (caught) {
      if (acquiredNextLock && nextSectionKey && nextSectionKey !== currentSectionKey) {
        await releaseSectionLock(nextSectionKey).catch(() => undefined);
      }
      const message = caught instanceof Error ? caught.message : "Failed to switch sections.";
      setNotice(message);
      setNoticeKind("error");
      return;
    } finally {
      sectionTransitionInFlightRef.current = false;
    }
  };

  const handleSectionChange = async (section: BuilderSection) => {
    if (section === "menu") {
      await switchEditorSection("menu", activeSettingsSection);
      return;
    }
    if (section === "content") {
      await switchEditorSection("content", activeSettingsSection);
      return;
    }

    const settingsOrder: BuilderSettingsSection[] = ["pages", "header", "footer", "styles"];
    const preferredSettingsSections = [
      activeSettingsSection,
      ...settingsOrder.filter((entry) => entry !== activeSettingsSection)
    ];
    const nextSettingsSection =
      preferredSettingsSections.find((entry) => {
        const lock = sectionLocks[entry];
        return !lock || lock.userId === sessionUserId;
      }) ?? activeSettingsSection;

    await switchEditorSection("settings", nextSettingsSection);
  };

  const handleSettingsSectionChange = async (section: BuilderSettingsSection) => {
    await switchEditorSection("settings", section);
  };

  const canFormatText = !(shouldLoadDraft && isDraftLoading) && !draftLoadError && canEditPageContent;
  const canSaveDraft =
    Boolean(draftState) &&
    canEditDraft &&
    !savingDraft &&
    hasUnsavedChanges &&
    Boolean(activeEditableSection) &&
    !activeSectionLockedByOther;
  const canPublish =
    !isProvisioning &&
    Boolean(draftState) &&
    canPublishByRole &&
    publishFeedback?.kind !== "progress" &&
    !hasForeignSectionLocks;

  const handleSidebarBack = async () => {
    if (activeSection !== "menu") {
      await handleSectionChange("menu");
      return;
    }
    navigate("/studio");
  };

  return (
    <div className="app-shell builder-shell">
      <SiteHeader
        session={session}
        showAuthActions
        onSignIn={handleGitHubLogin}
        onSignOut={handleLogout}
      />

      <BuilderTopbar
        savingDraft={savingDraft}
        isProvisioning={isProvisioning}
        provisionStep={provisionStep}
        canSaveDraft={canSaveDraft}
        canPublish={canPublish}
        liveSiteUrl={liveSiteUrl}
        githubRepoUrl={githubRepoUrl}
        accessRole={siteAccessRole}
        activeCollaborators={collaboratorPresenceNames}
        isPreviewFullscreen={isPreviewFullscreen}
        onTogglePreviewFullscreen={() => setIsPreviewFullscreen((value) => !value)}
        publishFeedback={publishFeedback}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
      />

      <div className={`builder-body ${isPreviewFullscreen ? "is-preview-fullscreen" : ""}`}>
        {!isPreviewFullscreen && (
          <BuilderSidebar
            activeSection={activeSection}
            activeSettingsSection={activeSettingsSection}
            canEditDraft={canEditDraft}
            canEditMetadata={isOwner}
            siteTitle={siteTitle}
            siteDescription={siteDescription}
            siteImagePreview={siteImagePreview}
            pages={pages}
            activePreviewSlug={activePreviewSlug}
            pageTitleRef={pageTitleRef}
            tokensCss={tokensCss}
            siteUrl={siteUrl}
            headerDisabled={headerDisabled}
            headerFixed={headerFixed}
            headerBrandText={headerBrandText}
            headerBrandDisabled={headerBrandDisabled}
            headerNavItems={headerNavItems}
            footerDisabled={footerDisabled}
            footerFixed={footerFixed}
            footerModules={footerModules}
            sectionLocks={sidebarSectionLocks}
            onBack={() => {
              void handleSidebarBack();
            }}
            onSectionChange={(section) => {
              void handleSectionChange(section);
            }}
            onSettingsSectionChange={(section) => {
              void handleSettingsSectionChange(section);
            }}
            onSiteTitleChange={setSiteTitle}
            onSiteDescriptionChange={setSiteDescription}
            onSiteImageChange={setSiteImage}
            onAddPage={addPage}
            onActivePreviewSlugChange={setActivePreviewSlug}
            onPageTitleChange={handlePageTitleChange}
            onPageSlugChange={handlePageSlugChange}
            onPageShowInNavChange={(index, checked) => updatePage(index, { showInNav: checked })}
            onRemovePage={removePage}
            onTokensCssChange={setTokensCss}
            onSiteUrlChange={setSiteUrl}
            onHeaderDisabledChange={setHeaderDisabled}
            onHeaderFixedChange={setHeaderFixed}
            onHeaderBrandTextChange={setHeaderBrandText}
            onHeaderBrandDisabledChange={setHeaderBrandDisabled}
            onMoveHeaderNavItemUp={(slug) => moveHeaderNavItem(slug, -1)}
            onMoveHeaderNavItemDown={(slug) => moveHeaderNavItem(slug, 1)}
            onFooterDisabledChange={setFooterDisabled}
            onFooterFixedChange={setFooterFixed}
            onFooterModuleContentChange={updateFooterModuleContent}
            onFooterModuleAlignmentChange={updateFooterModuleAlignment}
            onMoveFooterModuleUp={(index) => moveFooterModule(index, -1)}
            onMoveFooterModuleDown={(index) => moveFooterModule(index, 1)}
            canFormatText={canFormatText}
            onRunFormatCommand={runPreviewCommand}
            onRunFormatLink={runPreviewLink}
            onUploadFormatImage={handleInlineImageUpload}
            onCaptureFormatSelection={capturePreviewSelection}
            isFormatImageUploading={uploadingInlineImage}
            maxFormatImageUploadBytes={MAX_IMAGE_UPLOAD_BYTES}
            selectedEditorImage={selectedEditorImage}
            onSelectedEditorImageAltChange={handleSelectedEditorImageAltChange}
            onSelectedEditorImageCaptionChange={handleSelectedEditorImageCaptionChange}
            onSelectedEditorImageSizeChange={handleSelectedEditorImageSizeChange}
          />
        )}

        <BuilderPreviewPanel
          shouldLoadDraft={shouldLoadDraft}
          isDraftLoading={isDraftLoading}
          draftLoadError={draftLoadError}
          canEditContent={canEditPageContent}
          readOnlyMessage={previewReadOnlyMessage}
          previewRef={previewRef}
          previewBrand={siteTitle}
          pages={pages}
          draftImages={draftImages}
          tokensCss={tokensCss}
          homeFallbackBody={defaultHomeContent}
          activePreviewSlug={activePreviewSlug}
          publishedSiteBaseUrl={publishedSiteBaseUrl}
          header={{
            disabled: headerDisabled,
            fixed: headerFixed,
            brandText: headerBrandText,
            disableBrand: headerBrandDisabled
          }}
          footer={{
            disabled: footerDisabled,
            fixed: footerFixed,
            modules: footerModules
          }}
          onActivePreviewSlugChange={setActivePreviewSlug}
          onPageBodyChange={updatePageBody}
          onSelectedImageChange={setSelectedEditorImage}
        />
      </div>

      <SiteFooter notice={notice} noticeKind={noticeKind} />
    </div>
  );
}
