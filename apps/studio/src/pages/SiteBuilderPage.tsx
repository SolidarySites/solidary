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
import BuilderContentSection from "../components/studio/site-builder/BuilderContentSection";
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
import { loadDraftById, type LoadedDraftResult } from "../components/studio/site-builder/load-draft";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  CollaboratorRole,
  CollaboratorSearchResult,
  DraftImageAsset,
  DraftState,
  FooterModule,
  FooterModuleAlignment,
  ManagedCollaborator,
  PublishFeedback,
  SiteAccessRole
} from "../components/studio/site-builder/types";
import { usePublishStatusTracking } from "../components/studio/site-builder/usePublishStatusTracking";
import {
  getPageSafeSlug,
  makeUniquePageSlug,
  normalizePageSlug,
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
  lockKey: string;
  userId: string;
  holderName: string;
  expiresAt: string;
};

type SectionLockRecord = Record<string, SectionLockEntry>;

type SectionLockAcquireResult = {
  acquired?: boolean;
  lock_user_id?: string | null;
  lock_name?: string | null;
  expires_at?: string | null;
};

type CollaboratorSearchRpcRow = {
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  github_login: string | null;
};

type ManagedCollaboratorApiRow = {
  userId: string | null;
  role: CollaboratorRole | null;
  email: string | null;
  displayName: string | null;
  githubLogin: string | null;
  syncState: "synced" | "pending_invite" | "unknown" | null;
};

const normalizeCollaboratorIdentifier = (value: string) =>
  value.startsWith("@") ? value.slice(1).trim() : value.trim();

const mapCollaboratorSearchRows = (rows: CollaboratorSearchRpcRow[] | null | undefined) =>
  (rows ?? [])
    .map((row) => {
      const userId = typeof row.user_id === "string" ? row.user_id.trim() : "";
      const email = typeof row.email === "string" ? row.email.trim() : "";
      const displayName =
        typeof row.display_name === "string" && row.display_name.trim()
          ? row.display_name.trim()
          : email;
      const githubLogin =
        typeof row.github_login === "string" && row.github_login.trim()
          ? row.github_login.trim()
          : null;
      if (!userId || !email) return null;
      return {
        userId,
        email,
        displayName,
        githubLogin
      } satisfies CollaboratorSearchResult;
    })
    .filter((entry): entry is CollaboratorSearchResult => Boolean(entry));

const mapManagedCollaboratorRows = (rows: ManagedCollaboratorApiRow[] | null | undefined) =>
  (rows ?? [])
    .map((row) => {
      const userId = typeof row.userId === "string" ? row.userId.trim() : "";
      const email = typeof row.email === "string" ? row.email.trim() : "";
      const displayName =
        typeof row.displayName === "string" && row.displayName.trim()
          ? row.displayName.trim()
          : email || userId;
      const githubLogin =
        typeof row.githubLogin === "string" && row.githubLogin.trim()
          ? row.githubLogin.trim()
          : null;
      const role =
        row.role === "admin" || row.role === "editor" || row.role === "viewer"
          ? row.role
          : null;
      const syncState =
        row.syncState === "synced" ||
        row.syncState === "pending_invite" ||
        row.syncState === "unknown"
          ? row.syncState
          : "unknown";
      if (!userId || !role) return null;
      return {
        userId,
        role,
        email,
        displayName,
        githubLogin,
        syncState
      } satisfies ManagedCollaborator;
    })
    .filter((entry): entry is ManagedCollaborator => Boolean(entry));

const EDITABLE_SECTION_LABELS: Record<BuilderEditableSectionKey, string> = {
  metadata: "Solidary Metadata",
  pages: "Pages",
  header: "Header",
  footer: "Footer",
  styles: "Styles"
};

const getEditableSectionFromUi = (
  section: BuilderSection,
  settingsSection: BuilderSettingsSection,
  pageEditingMode: boolean
): BuilderEditableSectionKey | null => {
  if (section === "content") return "metadata";
  if (section !== "settings") return null;
  if (settingsSection === "pages" && !pageEditingMode) return null;
  return settingsSection;
};

const isBuilderEditableSectionKey = (value: string): value is BuilderEditableSectionKey =>
  value === "metadata" ||
  value === "pages" ||
  value === "header" ||
  value === "footer" ||
  value === "styles";

const normalizePageLockValue = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

const getPageLockKey = (value: string) => `page:${normalizePageLockValue(value) || "home"}`;

const getPageLockKeyForPage = (page: BuilderPage, index: number) =>
  getPageLockKey(
    typeof page.id === "string" && page.id.trim() ? page.id.trim() : getPageSafeSlug(page, index)
  );

const getPageLockKeyForSlug = (pages: BuilderPage[], activePageSlug: string) => {
  const normalizedSlug = normalizePageSlug(activePageSlug) || "home";
  const matchedIndex = pages.findIndex(
    (page, index) => getPageSafeSlug(page, index) === normalizedSlug
  );
  if (matchedIndex === -1) {
    return getPageLockKey(normalizedSlug);
  }
  return getPageLockKeyForPage(pages[matchedIndex], matchedIndex);
};

const isPageLockKey = (value: string) => /^page:[a-z0-9][a-z0-9_-]*$/.test(value);

const isSupportedLockKey = (value: string) =>
  isBuilderEditableSectionKey(value) || isPageLockKey(value);

const getLockKeyFromUi = (
  section: BuilderSection,
  settingsSection: BuilderSettingsSection,
  activePageSlug: string,
  pages: BuilderPage[],
  pageEditingMode: boolean
) => {
  if (section === "content") return "metadata";
  if (section !== "settings") return null;
  if (settingsSection === "pages" && !pageEditingMode) return null;
  if (settingsSection === "pages") return getPageLockKeyForSlug(pages, activePageSlug);
  return settingsSection;
};

const getLockLabel = (lockKey: string) => {
  if (isPageLockKey(lockKey)) {
    return "this page";
  }
  if (isBuilderEditableSectionKey(lockKey)) {
    return EDITABLE_SECTION_LABELS[lockKey];
  }
  return "this section";
};

class DraftConflictError extends Error {
  constructor() {
    super("This draft was updated by another collaborator.");
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
  const [isPageEditingMode, setIsPageEditingMode] = useState(false);
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
  const [collaboratorQuery, setCollaboratorQuery] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState<CollaboratorRole>("editor");
  const [collaboratorSuggestions, setCollaboratorSuggestions] = useState<CollaboratorSearchResult[]>([]);
  const [collaboratorSearchLoading, setCollaboratorSearchLoading] = useState(false);
  const [invitingCollaborator, setInvitingCollaborator] = useState(false);
  const [selectedCollaboratorSuggestion, setSelectedCollaboratorSuggestion] =
    useState<CollaboratorSearchResult | null>(null);
  const [managedCollaborators, setManagedCollaborators] = useState<ManagedCollaborator[]>([]);
  const [managedCollaboratorsLoading, setManagedCollaboratorsLoading] = useState(false);
  const [updatingCollaboratorUserId, setUpdatingCollaboratorUserId] = useState<string | null>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  const pageTitleRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<AstroTemplatePreviewHandle | null>(null);
  const draftPresenceChannelRef = useRef<RealtimeChannel | null>(null);
  const hasInitializedHeaderBrand = useRef(false);
  const cleanedPublishedDraftIdRef = useRef<string | null>(null);
  const shouldCaptureLoadedDraftSignature = useRef(false);
  const sectionTransitionInFlightRef = useRef(false);
  const touchedPageSlugsRef = useRef<Set<string>>(new Set());
  const deletedPageSlugsRef = useRef<Set<string>>(new Set());

  const draftId = useMemo(
    () => searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId ?? null,
    [location.state, searchParams]
  );
  const computedSlug = useMemo(() => slugify(siteTitle), [siteTitle]);
  const shouldLoadDraft = Boolean(draftId);
  const sessionUserId = session?.user.id ?? null;
  const isOwner = siteAccessRole === "owner";
  const isOwnerOnOwnerDraft = isOwner && draftState?.draftType === "owner";
  const isEditorWorkingDraft =
    draftState?.draftType === "editor" && siteAccessRole === "editor" && draftState.ownerUserId === sessionUserId;
  const isOwnerOrAdminOnOwnerDraft =
    draftState?.draftType === "owner" &&
    (siteAccessRole === "owner" || siteAccessRole === "admin");
  const canEditDraft = Boolean(isOwnerOrAdminOnOwnerDraft || isEditorWorkingDraft);
  const canDirectPublish = Boolean(isOwnerOrAdminOnOwnerDraft);
  const canSubmitPullRequest = Boolean(isEditorWorkingDraft);
  const canPublishByRole = canDirectPublish || canSubmitPullRequest;
  const activeEditableSection = useMemo(
    () => getEditableSectionFromUi(activeSection, activeSettingsSection, isPageEditingMode),
    [activeSection, activeSettingsSection, isPageEditingMode]
  );
  const activeLockKey = useMemo(
    () =>
      getLockKeyFromUi(
        activeSection,
        activeSettingsSection,
        activePreviewSlug,
        pages,
        isPageEditingMode
      ),
    [activePreviewSlug, activeSection, activeSettingsSection, isPageEditingMode, pages]
  );
  const activeSectionLock = activeLockKey ? sectionLocks[activeLockKey] : null;
  const activeSectionLockedByOther = Boolean(
    activeSectionLock && activeSectionLock.userId !== sessionUserId
  );
  const sidebarSectionLocks = useMemo(
    () =>
      Object.entries(sectionLocks).reduce(
        (accumulator, [sectionKey, lock]) => {
          if (!lock || !isBuilderEditableSectionKey(sectionKey)) return accumulator;
          accumulator[sectionKey] = {
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
  const pageLocksBySlug = useMemo(
    () => {
      const pageSlugByLockKey = new Map<string, string>();
      pages.forEach((page, index) => {
        pageSlugByLockKey.set(getPageLockKeyForPage(page, index), getPageSafeSlug(page, index));
      });

      return Object.entries(sectionLocks).reduce(
        (accumulator, [lockKey, lock]) => {
          if (!lock || !isPageLockKey(lockKey)) return accumulator;
          const fallbackSlug = lockKey.slice("page:".length);
          const slug = pageSlugByLockKey.get(lockKey) ?? normalizePageSlug(fallbackSlug);
          if (!slug) return accumulator;
          accumulator[slug] = {
            holderName: lock.holderName,
            isSelf: lock.userId === sessionUserId
          };
          return accumulator;
        },
        {} as Record<
          string,
          {
            holderName: string;
            isSelf: boolean;
          }
        >
      );
    },
    [pages, sectionLocks, sessionUserId]
  );
  const activePageLockKey = useMemo(
    () => getPageLockKeyForSlug(pages, activePreviewSlug),
    [activePreviewSlug, pages]
  );
  const activePageLock = sectionLocks[activePageLockKey] ?? sectionLocks.pages;
  const activePageLockedByOther = Boolean(activePageLock && activePageLock.userId !== sessionUserId);
  const hasForeignSectionLocks = useMemo(
    () => Object.values(sectionLocks).some((lock) => Boolean(lock && lock.userId !== sessionUserId)),
    [sectionLocks, sessionUserId]
  );
  const canEditPageContent =
    canEditDraft &&
    activeSection === "settings" &&
    activeSettingsSection === "pages" &&
    isPageEditingMode &&
    !activePageLockedByOther;
  const metadataLock = sectionLocks.metadata ?? null;
  const metadataLockedByOther = Boolean(metadataLock && metadataLock.userId !== sessionUserId);
  const showMetadataFullView = activeSection === "content" && Boolean(isOwnerOnOwnerDraft);
  const previewReadOnlyMessage = useMemo(() => {
    if (shouldLoadDraft && isDraftLoading) return null;
    if (draftLoadError) return null;
    if (!canEditDraft) return "This draft is read-only for your current role.";
    if (activeSection !== "settings" || activeSettingsSection !== "pages") {
      return "Open Pages to edit content in the live preview.";
    }
    if (!isPageEditingMode) {
      return "Select a page in the sidebar to start editing content.";
    }
    if (activePageLockedByOther) {
      return `${
        activePageLock?.holderName ?? "Another collaborator"
      } is editing page "${normalizePageSlug(activePreviewSlug) || "home"}" right now.`;
    }
    return null;
  }, [
    activePageLock?.holderName,
    activePageLockedByOther,
    activePreviewSlug,
    activeSection,
    activeSettingsSection,
    isPageEditingMode,
    canEditDraft,
    draftLoadError,
    isDraftLoading,
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
    if (!canDirectPublish) return null;
    const candidate = publishFeedback.pagesUrl?.trim() || siteUrl.trim();
    return candidate || null;
  }, [canDirectPublish, publishFeedback, siteUrl]);
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
    if (draftState.draftType !== "owner") return;
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
  }, [draftState?.draftType, draftState?.id, publishFeedback?.kind, publishedSiteBaseUrl, session?.access_token]);

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

  const applyLoadedDraft = useCallback((
    loaded: LoadedDraftResult,
    options: {
      preserveActivePreviewSlug?: boolean;
      preservedPreviewSlug?: string;
    } = {}
  ) => {
    const { preserveActivePreviewSlug = false, preservedPreviewSlug } = options;
    const loadedDraftImages = loaded.draftImages ?? [];
    const loadedPages = loaded.pages.map((page) => ({
      ...page,
      body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", loadedDraftImages)
    }));
    touchedPageSlugsRef.current.clear();
    deletedPageSlugsRef.current.clear();
    setDraftState(loaded.draftState);
    setSiteAccessRole(loaded.accessRole);
    setDraftImages(loadedDraftImages);
    setPages(loadedPages);
    setDraftPageSlugs(loaded.draftPageSlugs);
    if (preserveActivePreviewSlug) {
      const normalizedActiveSlug = normalizePageSlug(preservedPreviewSlug ?? "") || "home";
      const hasActiveSlug = loadedPages.some(
        (page, index) => getPageSafeSlug(page, index) === normalizedActiveSlug
      );
      if (!hasActiveSlug && loaded.initialActivePreviewSlug) {
        setActivePreviewSlug(loaded.initialActivePreviewSlug);
      }
    } else if (loaded.initialActivePreviewSlug) {
      setActivePreviewSlug(loaded.initialActivePreviewSlug);
    }

    if (loaded.siteTitle) {
      setSiteTitle(loaded.siteTitle);
    }
    if (loaded.header) {
      setHeaderDisabled(loaded.header.disabled);
      setHeaderFixed(loaded.header.fixed);
      setHeaderBrandDisabled(loaded.header.disableBrand);
      setHeaderBrandText(loaded.header.brandText?.trim() || loaded.siteTitle?.trim() || "New Astro Site");
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
  }, []);

  useEffect(() => {
    if (!draftId) {
      setIsDraftLoading(false);
      setDraftLoadError(null);
      setDraftImages([]);
      setSiteAccessRole(null);
      setActivePresenceMembers([]);
      setIsPageEditingMode(false);
      setLastSavedDraftSignature("");
      setSectionLocks({});
      setCollaboratorQuery("");
      setCollaboratorSuggestions([]);
      setSelectedCollaboratorSuggestion(null);
      setManagedCollaborators([]);
      setManagedCollaboratorsLoading(false);
      setUpdatingCollaboratorUserId(null);
      cleanedPublishedDraftIdRef.current = null;
      shouldCaptureLoadedDraftSignature.current = false;
      touchedPageSlugsRef.current.clear();
      deletedPageSlugsRef.current.clear();
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
        applyLoadedDraft(loaded);
        if (loaded.resolvedDraftId && loaded.resolvedDraftId !== draftId) {
          navigate(`/site-builder?draftId=${loaded.resolvedDraftId}`, { replace: true });
        }
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
  }, [applyLoadedDraft, draftId, navigate, sessionResolved, sessionUserId]);

  const reloadLatestDraftAfterConflict = useCallback(async () => {
    if (!draftId || !sessionUserId) return;
    setIsDraftLoading(true);
    setDraftLoadError(null);
    shouldCaptureLoadedDraftSignature.current = false;
    try {
      const loaded = await loadDraftById({
        draftId,
        defaultHomeContent,
        userId: sessionUserId
      });
      applyLoadedDraft(loaded);
      if (loaded.resolvedDraftId && loaded.resolvedDraftId !== draftId) {
        navigate(`/site-builder?draftId=${loaded.resolvedDraftId}`, { replace: true });
      }
      setNotice("Draft changed by another collaborator. Loaded the latest version.");
      setNoticeKind("error");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to reload draft.";
      setDraftLoadError(message);
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsDraftLoading(false);
    }
  }, [applyLoadedDraft, draftId, navigate, sessionUserId]);

  const refreshDraftAfterSectionChange = useCallback(async (
    options: {
      preservedPreviewSlug?: string;
    } = {}
  ) => {
    if (!draftState?.id || !sessionUserId) return;
    setIsDraftLoading(true);
    setDraftLoadError(null);
    shouldCaptureLoadedDraftSignature.current = false;
    const preservedPreviewSlug =
      normalizePageSlug(options.preservedPreviewSlug ?? activePreviewSlug) || "home";
    try {
      const loaded = await loadDraftById({
        draftId: draftState.id,
        defaultHomeContent,
        userId: sessionUserId
      });
      applyLoadedDraft(loaded, {
        preserveActivePreviewSlug: true,
        preservedPreviewSlug
      });
      if (loaded.resolvedDraftId && loaded.resolvedDraftId !== draftState.id) {
        navigate(`/site-builder?draftId=${loaded.resolvedDraftId}`, { replace: true });
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to refresh draft state.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsDraftLoading(false);
    }
  }, [activePreviewSlug, applyLoadedDraft, draftState?.id, navigate, sessionUserId]);

  const loadManagedCollaborators = useCallback(async (options?: { syncRoles?: boolean }) => {
    if (!draftState?.id || !isOwnerOnOwnerDraft) {
      setManagedCollaborators([]);
      setManagedCollaboratorsLoading(false);
      return;
    }

    const providerToken = (session as { provider_token?: string } | null)?.provider_token?.trim() ?? "";
    if (!providerToken || !session?.access_token) {
      setManagedCollaborators([]);
      setManagedCollaboratorsLoading(false);
      return;
    }

    const syncRoles = options?.syncRoles !== false;

    setManagedCollaboratorsLoading(true);
    try {
      const response = await fetch("/.netlify/functions/github-list-collaborators", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          draftId: draftState.id,
          githubToken: providerToken,
          syncRoles
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        collaborators?: ManagedCollaboratorApiRow[];
        error?: string;
      };
      if (!response.ok) {
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to load collaborators.";
        throw new Error(message);
      }

      setManagedCollaborators(mapManagedCollaboratorRows(payload.collaborators));
    } catch (caught) {
      setManagedCollaborators([]);
      const message =
        caught instanceof Error ? caught.message : "Failed to load collaborators.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setManagedCollaboratorsLoading(false);
    }
  }, [draftState?.id, isOwnerOnOwnerDraft, session, session?.access_token]);

  useEffect(() => {
    if (!isOwnerOnOwnerDraft || !draftState?.id) {
      setManagedCollaborators([]);
      setManagedCollaboratorsLoading(false);
      return;
    }
    void loadManagedCollaborators();
  }, [draftState?.id, isOwnerOnOwnerDraft, loadManagedCollaborators]);

  useEffect(() => {
    if (!isOwnerOnOwnerDraft || !draftState?.id) {
      setCollaboratorSuggestions([]);
      setCollaboratorSearchLoading(false);
      return;
    }

    const query = collaboratorQuery.trim();
    if (query.length < 2) {
      setCollaboratorSuggestions([]);
      setCollaboratorSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setCollaboratorSearchLoading(true);
      void (async () => {
        try {
          const { data, error } = await supabase.rpc("site_search_collaborator_candidates", {
          p_draft_id: draftState.id,
          p_query: query,
          p_limit: 10
          });

          if (cancelled) return;
          if (error) {
            setCollaboratorSuggestions([]);
            return;
          }

          const suggestions = mapCollaboratorSearchRows((data ?? []) as CollaboratorSearchRpcRow[]);

          setCollaboratorSuggestions(suggestions.slice(0, 10));
        } finally {
          if (!cancelled) {
            setCollaboratorSearchLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [collaboratorQuery, draftState?.id, isOwnerOnOwnerDraft]);

  const handleCollaboratorQueryChange = (value: string) => {
    setCollaboratorQuery(value);
    setSelectedCollaboratorSuggestion(null);
  };

  const handleCollaboratorSuggestionSelect = (suggestion: CollaboratorSearchResult) => {
    setSelectedCollaboratorSuggestion(suggestion);
    setCollaboratorQuery(suggestion.githubLogin ? `@${suggestion.githubLogin}` : suggestion.email);
    setCollaboratorSuggestions([]);
  };

  const handleInviteCollaborator = async () => {
    if (!draftState?.id) return;
    if (!isOwnerOnOwnerDraft) {
      setNotice("Only owners can invite collaborators.");
      setNoticeKind("error");
      return;
    }

    const providerToken = (session as { provider_token?: string } | null)?.provider_token;
    if (!providerToken) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    const identifierInput = collaboratorQuery.trim();
    if (!identifierInput) {
      setNotice("Enter a GitHub username or email.");
      setNoticeKind("error");
      return;
    }

    const normalizedIdentifier = normalizeCollaboratorIdentifier(identifierInput);
    if (!normalizedIdentifier) {
      setNotice("Enter a valid GitHub username or email.");
      setNoticeKind("error");
      return;
    }

    let selectedSuggestion =
      selectedCollaboratorSuggestion &&
      (normalizedIdentifier.toLowerCase() === selectedCollaboratorSuggestion.email.toLowerCase() ||
        normalizedIdentifier.toLowerCase() ===
          (selectedCollaboratorSuggestion.githubLogin ?? "").toLowerCase())
        ? selectedCollaboratorSuggestion
        : (collaboratorSuggestions.find(
            (suggestion) =>
              normalizedIdentifier.toLowerCase() === suggestion.email.toLowerCase() ||
              normalizedIdentifier.toLowerCase() === (suggestion.githubLogin ?? "").toLowerCase()
          ) ?? null);

    setInvitingCollaborator(true);
    try {
      if (!selectedSuggestion && normalizedIdentifier.includes("@")) {
        const { data, error } = await supabase.rpc("site_search_collaborator_candidates", {
          p_draft_id: draftState.id,
          p_query: normalizedIdentifier,
          p_limit: 10
        });

        if (!error) {
          const exactEmailMatch = mapCollaboratorSearchRows((data ?? []) as CollaboratorSearchRpcRow[]).find(
            (suggestion) => suggestion.email.toLowerCase() === normalizedIdentifier.toLowerCase()
          );
          if (exactEmailMatch) {
            selectedSuggestion = exactEmailMatch;
            setSelectedCollaboratorSuggestion(exactEmailMatch);
          }
        }
      }

      const response = await fetch("/.netlify/functions/github-invite-collaborator", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          draftId: draftState.id,
          githubToken: providerToken,
          identifier: normalizedIdentifier,
          role: collaboratorRole,
          solidaryUserId: selectedSuggestion?.userId ?? null,
          solidaryGithubLogin: selectedSuggestion?.githubLogin ?? null
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to send collaborator invite.";
        throw new Error(message);
      }

      const invitedLabel =
        typeof payload?.target === "string" && payload.target.trim()
          ? payload.target.trim()
          : normalizedIdentifier;
      setNotice(`Invite sent to ${invitedLabel}.`);
      setNoticeKind("notice");
      setCollaboratorQuery("");
      setCollaboratorSuggestions([]);
      setSelectedCollaboratorSuggestion(null);
      await loadManagedCollaborators({ syncRoles: false });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to invite collaborator.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setInvitingCollaborator(false);
    }
  };

  const handleCollaboratorRoleUpdate = async (
    collaboratorUserId: string,
    role: CollaboratorRole
  ) => {
    if (!draftState?.id || !isOwnerOnOwnerDraft) return;
    const providerToken = (session as { provider_token?: string } | null)?.provider_token?.trim() ?? "";
    if (!providerToken || !session?.access_token) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    const collaborator = managedCollaborators.find((entry) => entry.userId === collaboratorUserId);
    if (!collaborator || collaborator.role === role) return;

    setUpdatingCollaboratorUserId(collaboratorUserId);
    try {
      const response = await fetch("/.netlify/functions/github-manage-collaborator", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: "update_role",
          draftId: draftState.id,
          githubToken: providerToken,
          collaboratorUserId,
          role
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to update collaborator role.";
        throw new Error(message);
      }

      setManagedCollaborators((current) =>
        current.map((entry) =>
          entry.userId === collaboratorUserId
            ? {
                ...entry,
                role,
                syncState: "unknown"
              }
            : entry
        )
      );
      setNotice(`Updated ${collaborator.displayName}'s role to ${role}.`);
      setNoticeKind("notice");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to update collaborator role.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  const handleCollaboratorRemove = async (collaboratorUserId: string) => {
    if (!draftState?.id || !isOwnerOnOwnerDraft) return;
    const providerToken = (session as { provider_token?: string } | null)?.provider_token?.trim() ?? "";
    if (!providerToken || !session?.access_token) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    const collaborator = managedCollaborators.find((entry) => entry.userId === collaboratorUserId);
    if (!collaborator) return;

    setUpdatingCollaboratorUserId(collaboratorUserId);
    try {
      const response = await fetch("/.netlify/functions/github-manage-collaborator", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: "remove",
          draftId: draftState.id,
          githubToken: providerToken,
          collaboratorUserId
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to remove collaborator.";
        throw new Error(message);
      }

      setManagedCollaborators((current) =>
        current.filter((entry) => entry.userId !== collaboratorUserId)
      );
      setNotice(`Removed ${collaborator.displayName} from this site.`);
      setNoticeKind("notice");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to remove collaborator.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

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
    if (isOwnerOnOwnerDraft || activeSection !== "content") return;
    setActiveSection("menu");
  }, [activeSection, canEditDraft, draftState?.id, isOwnerOnOwnerDraft, sessionUserId]);

  useEffect(() => {
    const inPageEditingMode =
      activeSection === "settings" && activeSettingsSection === "pages" && isPageEditingMode;
    if (inPageEditingMode) return;
    setSelectedEditorImage(null);
    if (activeSection !== "settings" || activeSettingsSection !== "pages") {
      setIsPageEditingMode(false);
    }
  }, [activeSection, activeSettingsSection, isPageEditingMode]);

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

  const normalizeTouchedSlug = (value: string | null | undefined) =>
    value?.trim().toLowerCase() ?? "";

  const markPageSlugTouched = (slug: string | null | undefined) => {
    const normalized = normalizeTouchedSlug(slug);
    if (!normalized) return;
    touchedPageSlugsRef.current.add(normalized);
    deletedPageSlugsRef.current.delete(normalized);
  };

  const markPageSlugDeleted = (slug: string | null | undefined) => {
    const normalized = normalizeTouchedSlug(slug);
    if (!normalized) return;
    touchedPageSlugsRef.current.delete(normalized);
    deletedPageSlugsRef.current.add(normalized);
  };

  const addPage = () => {
    const slug = makeUniquePageSlug("new-page", pages);
    setPages((items) => [
      ...items,
      {
        id: slug,
        title: "New page",
        slug,
        body: "<p>Write your page content here.</p>",
        showInNav: true,
        position: items.length
      }
    ]);
    markPageSlugTouched(slug);
    setActivePreviewSlug(slug);
    void switchEditorSection("settings", "pages", {
      nextPageEditingMode: true,
      nextPreviewSlug: slug
    });
    requestAnimationFrame(() => pageTitleRef.current?.focus());
  };

  const updatePage = (index: number, updates: Partial<BuilderPage>) => {
    const existing = pages[index];
    if (existing) {
      const previousSlug = getPageSafeSlug(existing, index);
      const nextSlug = getPageSafeSlug({ ...existing, ...updates }, index);
      if (previousSlug !== nextSlug && activePreviewSlug === previousSlug) {
        setActivePreviewSlug(nextSlug);
      }
      if (previousSlug !== nextSlug) {
        markPageSlugDeleted(previousSlug);
        markPageSlugTouched(nextSlug);
      } else {
        markPageSlugTouched(previousSlug);
      }
    }
    setPages((items) => items.map((item, idx) => (idx === index ? { ...item, ...updates } : item)));
  };

  const removePage = (index: number) => {
    const page = pages[index];
    if (!page || page.isHome) return;

    const removedSlug = getPageSafeSlug(page, index);
    markPageSlugDeleted(removedSlug);
    setPages((items) => items.filter((_, idx) => idx !== index || items[idx]?.isHome));
    if (activePreviewSlug === removedSlug) {
      void handleActivePreviewSlugChange("home");
    }
  };

  const updatePageBody = (safeSlug: string, body: string) => {
    markPageSlugTouched(safeSlug);
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

  const syncEditorTouchedState = (
    touchedSections: string[] | null | undefined,
    touchedPageSlugs: string[] | null | undefined,
    deletedPageSlugs: string[] | null | undefined
  ) => {
    const normalizedTouchedSections = (touchedSections ?? []).filter(
      (entry): entry is BuilderEditableSectionKey =>
        entry === "metadata" ||
        entry === "pages" ||
        entry === "header" ||
        entry === "footer" ||
        entry === "styles"
    );
    const normalizedTouchedPageSlugs = (touchedPageSlugs ?? [])
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    const normalizedDeletedPageSlugs = (deletedPageSlugs ?? [])
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    setDraftState((current) =>
      current
        ? {
            ...current,
            touchedSections: normalizedTouchedSections,
            touchedPageSlugs: normalizedTouchedPageSlugs,
            deletedPageSlugs: normalizedDeletedPageSlugs
          }
        : current
    );
  };

  const markEditorDraftTouched = async (
    section: BuilderEditableSectionKey,
    touchedPageSlugs: string[] = [],
    deletedPageSlugs: string[] = []
  ) => {
    if (!draftState || draftState.draftType !== "editor") return;
    const { data, error } = await supabase.rpc("site_editor_mark_touched", {
      p_draft_id: draftState.id,
      p_section_key: section,
      p_touched_page_slugs: touchedPageSlugs,
      p_deleted_page_slugs: deletedPageSlugs
    });
    if (error) {
      throw new Error(error.message);
    }
    const row =
      Array.isArray(data) && data.length
        ? (data[0] as {
            touched_sections?: string[] | null;
            touched_page_slugs?: string[] | null;
            deleted_page_slugs?: string[] | null;
          })
        : null;
    if (row) {
      syncEditorTouchedState(
        row.touched_sections ?? null,
        row.touched_page_slugs ?? null,
        row.deleted_page_slugs ?? null
      );
    }
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
      siteId: draftState.siteId,
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

    await markEditorDraftTouched("metadata");

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
    const touchedPageSlugs = Array.from(touchedPageSlugsRef.current)
      .map((entry) => normalizePageSlug(entry))
      .filter(Boolean);
    const touchedPageSlugSet = new Set(touchedPageSlugs);
    const upsertRows = pageRows.filter((row) => touchedPageSlugSet.has(normalizePageSlug(row.slug)));

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

    if (upsertRows.length) {
      const { error: upsertError } = await supabase
        .from("site_draft_pages")
        .upsert(upsertRows, { onConflict: "draft_id,slug" });
      if (upsertError) {
        throw new Error(upsertError.message);
      }
    }

    setPages(normalizedPages);
    setDraftPageSlugs(pageRows.map((page) => page.slug));

    const deletedPageSlugs = Array.from(
      new Set([
        ...deletedSlugs.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
        ...Array.from(deletedPageSlugsRef.current)
      ])
    );
    if (touchedPageSlugs.length || deletedPageSlugs.length) {
      await markEditorDraftTouched("pages", touchedPageSlugs, deletedPageSlugs);
    }
    touchedPageSlugsRef.current.clear();
    deletedPageSlugsRef.current.clear();

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

    await markEditorDraftTouched("header");

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

    await markEditorDraftTouched("footer");

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

    await markEditorDraftTouched("styles");

    return buildDraftSignatureForState();
  };

  const saveSectionByKey = async (sectionKey: BuilderEditableSectionKey) => {
    if (!canEditDraft) return;
    if (!draftState) return;
    const lockKey = sectionKey === "pages" ? getPageLockKeyForSlug(pages, activePreviewSlug) : sectionKey;
    const lock = sectionLocks[lockKey] ?? (sectionKey === "pages" ? sectionLocks.pages : null);
    if (lock && lock.userId !== sessionUserId) {
      if (sectionKey === "pages") {
        throw new Error(
          `${lock.holderName} is editing page "${normalizePageSlug(activePreviewSlug) || "home"}".`
        );
      }
      throw new Error(`${lock.holderName} is editing ${getLockLabel(lockKey)}.`);
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
      const lockKey =
        typeof row.section_key === "string" && isSupportedLockKey(row.section_key)
          ? row.section_key
          : null;
      if (!lockKey) return;
      const userId = typeof row.locked_by_user_id === "string" ? row.locked_by_user_id.trim() : "";
      const holderName =
        typeof row.locked_by_name === "string" && row.locked_by_name.trim()
          ? row.locked_by_name.trim()
          : "Unknown";
      const expiresAt = typeof row.expires_at === "string" ? row.expires_at : "";
      const expiresAtTime = Date.parse(expiresAt);
      if (!userId || !expiresAt || Number.isNaN(expiresAtTime) || expiresAtTime <= nowTime) return;

      nextLocks[lockKey] = {
        lockKey,
        userId,
        holderName,
        expiresAt
      };
    });
    setSectionLocks(nextLocks);
    return nextLocks;
  }, []);

  const acquireSectionLock = useCallback(async (lockKey: string) => {
    if (!draftState?.id || !canEditDraft || !sessionUserId) return false;
    const { data, error } = await supabase.rpc("site_draft_acquire_section_lock", {
      p_draft_id: draftState.id,
      p_section_key: lockKey,
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
        delete next[lockKey];
        return next;
      }
      next[lockKey] = {
        lockKey,
        userId: lockUserId,
        holderName: lockName,
        expiresAt
      };
      return next;
    });

    return Boolean(response?.acquired && lockUserId === sessionUserId);
  }, [canEditDraft, draftState?.id, sessionDisplayName, sessionUserId]);

  const releaseSectionLock = useCallback(async (lockKey: string) => {
    if (!draftState?.id || !sessionUserId) return;
    const { error } = await supabase.rpc("site_draft_release_section_lock", {
      p_draft_id: draftState.id,
      p_section_key: lockKey
    });
    if (error) {
      throw new Error(error.message);
    }
    setSectionLocks((current) => {
      const next = { ...current };
      delete next[lockKey];
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
    if (!draftState?.id || !sessionUserId || !canEditDraft || !activeLockKey) return;
    void acquireSectionLock(activeLockKey)
      .then((acquired) => {
        if (!acquired) {
          void loadSectionLocks(draftState.id).catch(() => undefined);
        }
      })
      .catch(() => undefined);

    const intervalId = window.setInterval(() => {
      void acquireSectionLock(activeLockKey)
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
    activeLockKey,
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

  const publishOwnerDraft = async ({
    providerToken,
    publishStartedAt
  }: {
    providerToken: string;
    publishStartedAt: string;
  }) => {
    if (!draftState || draftState.draftType !== "owner") {
      throw new Error("Owner draft is required for direct publish.");
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
      siteId: draftState.siteId,
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
      siteId: draftState.siteId,
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
      id: draftState.siteId,
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
  };

  const publishEditorDraft = async ({
    providerToken
  }: {
    providerToken: string;
  }) => {
    if (!draftState || draftState.draftType !== "editor") {
      throw new Error("Editor draft is required for pull request publish.");
    }

    const [ownerLogin, repoName] = draftState.repoFullName.split("/");
    if (!ownerLogin || !repoName) {
      throw new Error("Invalid repository name.");
    }

    const { data: ownerDraft, error: ownerDraftError } = await supabase
      .from("site_drafts")
      .select("id, branch")
      .eq("site_id", draftState.siteId)
      .eq("draft_type", "owner")
      .limit(1)
      .maybeSingle();
    if (ownerDraftError) {
      throw new Error(ownerDraftError.message);
    }
    if (!ownerDraft) {
      throw new Error("Owner draft not found for this site.");
    }

    const headBranch = (draftState.editorBranch ?? draftState.branch).trim();
    const baseBranch = ownerDraft.branch.trim();
    if (!headBranch || !baseBranch) {
      throw new Error("Draft is missing branch settings.");
    }

    setProvisionStep("Ensuring collaboration branch...");
    await githubRequest("/.netlify/functions/github-ensure-branch", {
      token: providerToken,
      owner: ownerLogin,
      repo: repoName,
      branch: headBranch,
      baseBranch
    });

    const { data: latestDraftState, error: latestDraftStateError } = await supabase
      .from("site_drafts")
      .select("touched_sections, touched_page_slugs, deleted_page_slugs")
      .eq("id", draftState.id)
      .maybeSingle();
    if (latestDraftStateError) {
      throw new Error(latestDraftStateError.message);
    }

    const touchedSections = new Set(
      ((latestDraftState?.touched_sections as string[] | null) ?? []).filter(
        (entry): entry is BuilderEditableSectionKey =>
          entry === "metadata" ||
          entry === "pages" ||
          entry === "header" ||
          entry === "footer" ||
          entry === "styles"
      )
    );
    const touchedPageSlugs = new Set(
      ((latestDraftState?.touched_page_slugs as string[] | null) ?? [])
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    );
    const deletedPageSlugs = new Set(
      ((latestDraftState?.deleted_page_slugs as string[] | null) ?? [])
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    );

    if (!touchedSections.size && !touchedPageSlugs.size && !deletedPageSlugs.size) {
      throw new Error("No saved editor changes to submit. Save a section first.");
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
    const files = buildFiles({
      siteId: draftState.siteId,
      imageUrl,
      settingsInput: siteSettingsInput,
      tokensCss,
      templateSolidary,
      pages: normalizedPages,
      defaultHomeContent,
      urlOverride: siteUrl
    });

    const upsertsByPath = new Map<string, string>();
    if (touchedSections.has("metadata")) {
      const solidaryFile = files[FILE_KEYS.solidary];
      const siteFile = files[FILE_KEYS.site];
      if (solidaryFile) upsertsByPath.set(FILE_KEYS.solidary, solidaryFile);
      if (siteFile) upsertsByPath.set(FILE_KEYS.site, siteFile);
    }
    if (touchedSections.has("header") || touchedSections.has("footer")) {
      const siteFile = files[FILE_KEYS.site];
      if (siteFile) upsertsByPath.set(FILE_KEYS.site, siteFile);
    }
    if (touchedSections.has("styles")) {
      const tokensFile = files[FILE_KEYS.tokens];
      if (tokensFile) upsertsByPath.set(FILE_KEYS.tokens, tokensFile);
    }
    if (touchedSections.has("pages") || touchedPageSlugs.size || deletedPageSlugs.size) {
      normalizedPages.forEach((page, index) => {
        const safeSlug = getPageSafeSlug(page, index).trim().toLowerCase();
        if (!safeSlug) return;
        if (touchedPageSlugs.size && !touchedPageSlugs.has(safeSlug)) return;
        const path = `${PAGE_PATH_PREFIX}${safeSlug}${PAGE_PATH_SUFFIX}`;
        const content = files[path];
        if (content) {
          upsertsByPath.set(path, content);
        }
      });
    }

    const deletePaths = Array.from(deletedPageSlugs).map(
      (slugValue) => `${PAGE_PATH_PREFIX}${slugValue}${PAGE_PATH_SUFFIX}`
    );

    if (!upsertsByPath.size && !deletePaths.length) {
      throw new Error("No touched files were detected for this pull request.");
    }

    if (siteImage && touchedSections.has("metadata")) {
      setProvisionStep("Uploading site image...");
      const imageBase64 = toBase64(await siteImage.arrayBuffer());
      await githubRequest("/.netlify/functions/github-contents-write", {
        token: providerToken,
        owner: ownerLogin,
        repo: repoName,
        path: imagePath,
        message: "Update site image",
        content: imageBase64,
        branch: headBranch
      });
      setDraftImageUrl(imageUrl);
    }

    if (touchedSections.has("pages")) {
      setProvisionStep("Uploading touched draft images...");
      const draftImagesForPublish = await loadDraftImagesForDraft(draftState.id);
      if (draftImagesForPublish.length) {
        await uploadDraftImagesToGitHub({
          providerToken,
          ownerLogin,
          repoName,
          branch: headBranch,
          images: draftImagesForPublish
        });
      }
    }

    setProvisionStep("Committing editor changes...");
    await githubRequest<BatchCommitResponse>("/.netlify/functions/github-contents-batch-commit", {
      token: providerToken,
      owner: ownerLogin,
      repo: repoName,
      branch: headBranch,
      message: "Apply collaboration draft updates",
      upserts: Array.from(upsertsByPath.entries()).map(([path, content]) => ({
        path,
        mode: "100644",
        content: toBase64(new TextEncoder().encode(content).buffer)
      })),
      deletes: deletePaths
    });

    setProvisionStep("Creating pull request...");
    const prResponse = await fetch("/.netlify/functions/github-upsert-collaboration-pr", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`
      },
      body: JSON.stringify({
        draftId: draftState.id,
        githubToken: providerToken,
        title: `Studio changes by ${sessionDisplayName}`,
        body: `Touched sections: ${Array.from(touchedSections).join(", ") || "n/a"}`
      })
    });
    const prPayload = (await prResponse.json().catch(() => ({}))) as {
      error?: string;
      pullRequest?: {
        number?: number;
        url?: string;
        state?: string;
      };
    };
    if (!prResponse.ok) {
      throw new Error(prPayload.error ?? "Failed to create pull request.");
    }

    const prNumber = Number(prPayload.pullRequest?.number ?? 0);
    const prUrl = typeof prPayload.pullRequest?.url === "string" ? prPayload.pullRequest.url : "";
    if (!prNumber || !prUrl) {
      throw new Error("Pull request was created but no URL was returned.");
    }

    const { error: clearTouchedError } = await supabase.rpc("site_editor_clear_touched", {
      p_draft_id: draftState.id
    });
    if (clearTouchedError) {
      throw new Error(clearTouchedError.message);
    }
    touchedPageSlugsRef.current.clear();
    deletedPageSlugsRef.current.clear();
    setDraftState((current) =>
      current
        ? {
            ...current,
            touchedSections: [],
            touchedPageSlugs: [],
            deletedPageSlugs: [],
            lastPullRequestNumber: prNumber,
            lastPullRequestUrl: prUrl,
            lastPullRequestState:
              typeof prPayload.pullRequest?.state === "string" ? prPayload.pullRequest.state : "open"
          }
        : current
    );
    setLastSavedDraftSignature(buildDraftSignatureForState({ pagesSnapshot: normalizedPages, imageUrl }));
    setPublishFeedback({
      kind: "success",
      text: `PR #${prNumber} is ready for review.`,
      runUrl: prUrl
    });
    setNotice("Pull request submitted for owner/admin review.");
    setNoticeKind("notice");
  };

  const handlePublish = async () => {
    resetNotices();
    setPublishFeedback(null);
    cancelPublishStatusTracking();
    cleanedPublishedDraftIdRef.current = null;

    if (!canPublishByRole) {
      setNotice("You do not have publish access for this draft.");
      setNoticeKind("error");
      return;
    }

    if (canDirectPublish && hasForeignSectionLocks) {
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

      if (hasUnsavedChanges && activeEditableSection && !activeSectionLockedByOther) {
        const savedSignature = await saveSectionByKey(activeEditableSection);
        if (typeof savedSignature === "string" && savedSignature) {
          setLastSavedDraftSignature(savedSignature);
        }
      }

      if (canDirectPublish) {
        await publishOwnerDraft({
          providerToken,
          publishStartedAt
        });
        setNotice(null);
        setNoticeKind(null);
      } else {
        await publishEditorDraft({
          providerToken
        });
      }
    } catch (caught) {
      if (caught instanceof DraftConflictError) {
        await reloadLatestDraftAfterConflict();
      } else {
        const message = caught instanceof Error ? caught.message : "Something went wrong.";
        setNotice(message);
        setNoticeKind("error");
      }
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
      if (error instanceof DraftConflictError) {
        await reloadLatestDraftAfterConflict();
      } else {
        const message = error instanceof Error ? error.message : "Failed to save draft.";
        setNotice(message);
        setNoticeKind("error");
      }
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
      markPageSlugTouched(navIndices[currentNavIndex].slug);
      markPageSlugTouched(navIndices[targetNavIndex].slug);
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
    nextSettingsSection: BuilderSettingsSection,
    options: {
      nextPageEditingMode?: boolean;
      nextPreviewSlug?: string;
    } = {}
  ) => {
    if (sectionTransitionInFlightRef.current) return;
    sectionTransitionInFlightRef.current = true;

    const normalizedCurrentSlug = normalizePageSlug(activePreviewSlug) || "home";
    const normalizedNextSlug = normalizePageSlug(options.nextPreviewSlug ?? activePreviewSlug) || "home";
    const nextPageEditingMode =
      nextSection === "settings" && nextSettingsSection === "pages"
        ? Boolean(options.nextPageEditingMode)
        : false;
    const currentSectionKey = getEditableSectionFromUi(
      activeSection,
      activeSettingsSection,
      isPageEditingMode
    );
    const nextSectionKey = getEditableSectionFromUi(
      nextSection,
      nextSettingsSection,
      nextPageEditingMode
    );
    const currentLockKey = getLockKeyFromUi(
      activeSection,
      activeSettingsSection,
      normalizedCurrentSlug,
      pages,
      isPageEditingMode
    );
    const nextLockKey = getLockKeyFromUi(
      nextSection,
      nextSettingsSection,
      normalizedNextSlug,
      pages,
      nextPageEditingMode
    );
    const isSameDestination =
      nextSection === activeSection &&
      nextSettingsSection === activeSettingsSection &&
      nextPageEditingMode === isPageEditingMode &&
      normalizedNextSlug === normalizedCurrentSlug;
    if (isSameDestination) {
      sectionTransitionInFlightRef.current = false;
      return;
    }

    let acquiredNextLock = false;

    try {
      if (nextLockKey && nextLockKey !== currentLockKey) {
        const acquired = await acquireSectionLock(nextLockKey);
        if (!acquired) {
          const latestLocks =
            draftState?.id ? await loadSectionLocks(draftState.id).catch(() => ({} as SectionLockRecord)) : {};
          const lockHolder = latestLocks[nextLockKey]?.holderName ?? "Another collaborator";
          if (nextSectionKey === "pages") {
            setNotice(
              `${lockHolder} is editing page "${normalizedNextSlug}". Choose another page to edit.`
            );
            setNoticeKind("error");
            return;
          } else {
            setNotice(`${lockHolder} is editing ${getLockLabel(nextLockKey)}.`);
            setNoticeKind("error");
            return;
          }
        } else {
          acquiredNextLock = true;
        }
      }

      if (
        currentSectionKey &&
        currentLockKey &&
        currentLockKey !== nextLockKey &&
        canEditDraft &&
        draftState
      ) {
        if (hasUnsavedChanges) {
          const savedSignature = await saveSectionByKey(currentSectionKey);
          if (typeof savedSignature === "string" && savedSignature) {
            setLastSavedDraftSignature(savedSignature);
          } else {
            setLastSavedDraftSignature(currentDraftSignature);
          }
        }
        await releaseSectionLock(currentLockKey);
      }

      if (nextSection !== activeSection) {
        setActiveSection(nextSection);
      }
      if (nextSettingsSection !== activeSettingsSection) {
        setActiveSettingsSection(nextSettingsSection);
      }
      if (normalizedNextSlug !== normalizedCurrentSlug) {
        setActivePreviewSlug(normalizedNextSlug);
      }
      if (nextPageEditingMode !== isPageEditingMode) {
        setIsPageEditingMode(nextPageEditingMode);
      }
      if (!nextPageEditingMode) {
        setSelectedEditorImage(null);
      }
      await refreshDraftAfterSectionChange({
        preservedPreviewSlug: normalizedNextSlug
      });
    } catch (caught) {
      if (acquiredNextLock && nextLockKey && nextLockKey !== currentLockKey) {
        await releaseSectionLock(nextLockKey).catch(() => undefined);
      }
      if (caught instanceof DraftConflictError) {
        await reloadLatestDraftAfterConflict();
      } else {
        const message = caught instanceof Error ? caught.message : "Failed to switch sections.";
        setNotice(message);
        setNoticeKind("error");
      }
      return;
    } finally {
      sectionTransitionInFlightRef.current = false;
    }
  };

  const handleActivePreviewSlugChange = async (nextSlug: string) => {
    const normalizedNextSlug = normalizePageSlug(nextSlug) || "home";
    const normalizedCurrentSlug = normalizePageSlug(activePreviewSlug) || "home";
    if (normalizedNextSlug === normalizedCurrentSlug) {
      setActivePreviewSlug(normalizedNextSlug);
      return;
    }

    if (
      !draftState?.id ||
      !sessionUserId ||
      !canEditDraft ||
      activeSection !== "settings" ||
      activeSettingsSection !== "pages" ||
      !isPageEditingMode
    ) {
      setActivePreviewSlug(normalizedNextSlug);
      return;
    }

    const currentPageLockKey = getPageLockKeyForSlug(pages, normalizedCurrentSlug);
    const nextPageLockKey = getPageLockKeyForSlug(pages, normalizedNextSlug);
    if (currentPageLockKey === nextPageLockKey) {
      setActivePreviewSlug(normalizedNextSlug);
      return;
    }
    let acquiredNextLock = false;

    try {
      const acquired = await acquireSectionLock(nextPageLockKey);
      if (!acquired) {
        const latestLocks =
          draftState?.id ? await loadSectionLocks(draftState.id).catch(() => ({} as SectionLockRecord)) : {};
        const lockHolder = latestLocks[nextPageLockKey]?.holderName ?? "Another collaborator";
        setNotice(`${lockHolder} is editing page "${normalizedNextSlug}".`);
        setNoticeKind("error");
        return;
      }
      acquiredNextLock = true;

      if (hasUnsavedChanges) {
        const savedSignature = await saveSectionByKey("pages");
        if (typeof savedSignature === "string" && savedSignature) {
          setLastSavedDraftSignature(savedSignature);
        } else {
          setLastSavedDraftSignature(currentDraftSignature);
        }
      }

      await releaseSectionLock(currentPageLockKey).catch(() => undefined);
      setActivePreviewSlug(normalizedNextSlug);
    } catch (caught) {
      if (acquiredNextLock) {
        await releaseSectionLock(nextPageLockKey).catch(() => undefined);
      }
      if (caught instanceof DraftConflictError) {
        await reloadLatestDraftAfterConflict();
      } else {
        const message = caught instanceof Error ? caught.message : "Failed to switch pages.";
        setNotice(message);
        setNoticeKind("error");
      }
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
        if (entry === "pages") return true;
        const lock = sectionLocks[entry];
        return !lock || lock.userId === sessionUserId;
      }) ?? activeSettingsSection;

    await switchEditorSection("settings", nextSettingsSection, {
      nextPageEditingMode: nextSettingsSection === "pages" ? false : undefined
    });
  };

  const handleSettingsSectionChange = async (section: BuilderSettingsSection) => {
    await switchEditorSection("settings", section, {
      nextPageEditingMode: section === "pages" ? false : undefined
    });
  };

  const handleEnterPageEditingMode = async (slug: string) => {
    await switchEditorSection("settings", "pages", {
      nextPageEditingMode: true,
      nextPreviewSlug: slug
    });
    requestAnimationFrame(() => pageTitleRef.current?.focus());
  };

  const handleExitPageEditingMode = async () => {
    await switchEditorSection("settings", "pages", {
      nextPageEditingMode: false
    });
  };

  const canFormatText = !(shouldLoadDraft && isDraftLoading) && !draftLoadError && canEditPageContent;
  const canSaveDraft =
    Boolean(draftState) &&
    canEditDraft &&
    !savingDraft &&
    hasUnsavedChanges &&
    Boolean(activeEditableSection) &&
    !activeSectionLockedByOther;
  const hasEditorPublishableChanges =
    draftState?.draftType === "editor" &&
    (
      hasUnsavedChanges ||
      (draftState.touchedSections?.length ?? 0) > 0 ||
      (draftState.touchedPageSlugs?.length ?? 0) > 0 ||
      (draftState.deletedPageSlugs?.length ?? 0) > 0
    );
  const canPublish =
    !isProvisioning &&
    Boolean(draftState) &&
    canPublishByRole &&
    publishFeedback?.kind !== "progress" &&
    (!canDirectPublish || !hasForeignSectionLocks) &&
    (canDirectPublish || hasEditorPublishableChanges);

  const handleSidebarBack = async () => {
    if (activeSection === "settings" && activeSettingsSection === "pages" && isPageEditingMode) {
      await handleExitPageEditingMode();
      return;
    }
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
        publishLabel={canDirectPublish ? "Publish" : "Create PR"}
        liveSiteUrl={liveSiteUrl}
        githubRepoUrl={githubRepoUrl}
        accessRole={siteAccessRole}
        activeCollaborators={collaboratorPresenceNames}
        canOpenMetadataSettings={Boolean(isOwnerOnOwnerDraft)}
        metadataSettingsActive={showMetadataFullView}
        isPreviewFullscreen={isPreviewFullscreen}
        onOpenMetadataSettings={() => {
          if (showMetadataFullView) {
            if (canEditDraft) {
              void handleSettingsSectionChange("pages");
            } else {
              void handleSectionChange("menu");
            }
            return;
          }
          void handleSectionChange("content");
        }}
        onTogglePreviewFullscreen={() => setIsPreviewFullscreen((value) => !value)}
        publishFeedback={publishFeedback}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
      />

      <div
        className={`builder-body ${isPreviewFullscreen ? "is-preview-fullscreen" : ""} ${
          showMetadataFullView ? "is-settings-full" : ""
        }`.trim()}
      >
        {showMetadataFullView ? (
          <section className="builder-settings-full">
            <div className={`builder-section-lock-shell ${metadataLockedByOther ? "is-locked" : ""}`.trim()}>
              {metadataLockedByOther && (
                <p className="builder-section-lock-note">
                  {metadataLock?.holderName ?? "Another user"} is editing this section.
                </p>
              )}
              <fieldset className="builder-locked-fieldset" disabled={metadataLockedByOther}>
                <BuilderContentSection
                  siteTitle={siteTitle}
                  siteDescription={siteDescription}
                  siteUrl={siteUrl}
                  siteImagePreview={siteImagePreview}
                  collaboratorQuery={collaboratorQuery}
                  collaboratorRole={collaboratorRole}
                  collaboratorSuggestions={collaboratorSuggestions}
                  selectedCollaboratorSuggestion={selectedCollaboratorSuggestion}
                  collaboratorSearchLoading={collaboratorSearchLoading}
                  invitingCollaborator={invitingCollaborator}
                  collaborators={managedCollaborators}
                  collaboratorsLoading={managedCollaboratorsLoading}
                  updatingCollaboratorUserId={updatingCollaboratorUserId}
                  onSiteTitleChange={setSiteTitle}
                  onSiteDescriptionChange={setSiteDescription}
                  onSiteUrlChange={setSiteUrl}
                  onSiteImageChange={setSiteImage}
                  onCollaboratorQueryChange={handleCollaboratorQueryChange}
                  onCollaboratorRoleChange={setCollaboratorRole}
                  onCollaboratorSuggestionSelect={handleCollaboratorSuggestionSelect}
                  onInviteCollaborator={() => {
                    void handleInviteCollaborator();
                  }}
                  onCollaboratorRoleUpdate={(collaboratorUserId, role) => {
                    void handleCollaboratorRoleUpdate(collaboratorUserId, role);
                  }}
                  onCollaboratorRemove={(collaboratorUserId) => {
                    void handleCollaboratorRemove(collaboratorUserId);
                  }}
                />
              </fieldset>
            </div>
          </section>
        ) : (
          <>
            {!isPreviewFullscreen && (
              <BuilderSidebar
                activeSection={activeSection}
                activeSettingsSection={activeSettingsSection}
                isPageEditingMode={isPageEditingMode}
                canEditDraft={canEditDraft}
                canEditMetadata={Boolean(isOwnerOnOwnerDraft)}
                siteTitle={siteTitle}
                siteDescription={siteDescription}
                siteImagePreview={siteImagePreview}
                collaboratorQuery={collaboratorQuery}
                collaboratorRole={collaboratorRole}
                collaboratorSuggestions={collaboratorSuggestions}
                selectedCollaboratorSuggestion={selectedCollaboratorSuggestion}
                collaboratorSearchLoading={collaboratorSearchLoading}
                invitingCollaborator={invitingCollaborator}
                collaborators={managedCollaborators}
                collaboratorsLoading={managedCollaboratorsLoading}
                updatingCollaboratorUserId={updatingCollaboratorUserId}
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
                pageLocksBySlug={pageLocksBySlug}
                sectionLocks={sidebarSectionLocks}
                onBack={() => {
                  void handleSidebarBack();
                }}
                onSettingsSectionChange={(section) => {
                  void handleSettingsSectionChange(section);
                }}
                onSiteTitleChange={setSiteTitle}
                onSiteDescriptionChange={setSiteDescription}
                onSiteImageChange={setSiteImage}
                onCollaboratorQueryChange={handleCollaboratorQueryChange}
                onCollaboratorRoleChange={setCollaboratorRole}
                onCollaboratorSuggestionSelect={handleCollaboratorSuggestionSelect}
                onInviteCollaborator={() => {
                  void handleInviteCollaborator();
                }}
                onCollaboratorRoleUpdate={(collaboratorUserId, role) => {
                  void handleCollaboratorRoleUpdate(collaboratorUserId, role);
                }}
                onCollaboratorRemove={(collaboratorUserId) => {
                  void handleCollaboratorRemove(collaboratorUserId);
                }}
                onAddPage={addPage}
                onEnterPageEditingMode={(slug) => {
                  void handleEnterPageEditingMode(slug);
                }}
                onExitPageEditingMode={() => {
                  void handleExitPageEditingMode();
                }}
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
              showFormattingToolbar={canFormatText}
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
              onActivePreviewSlugChange={(slug) => {
                void handleActivePreviewSlugChange(slug);
              }}
              onPageBodyChange={updatePageBody}
              onSelectedImageChange={setSelectedEditorImage}
              onRunFormatCommand={runPreviewCommand}
              onRunFormatLink={runPreviewLink}
              onUploadFormatImage={handleInlineImageUpload}
              onCaptureFormatSelection={capturePreviewSelection}
              isFormatImageUploading={uploadingInlineImage}
              maxFormatImageUploadBytes={MAX_IMAGE_UPLOAD_BYTES}
            />
          </>
        )}
      </div>

      <SiteFooter notice={notice} noticeKind={noticeKind} />
    </div>
  );
}
