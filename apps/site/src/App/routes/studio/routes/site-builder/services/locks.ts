import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection
} from "./types";
import { getPageSafeSlug, normalizePageSlug } from "./utils";

export type SectionLockEntry = {
  lockKey: string;
  userId: string;
  holderName: string;
  holderAvatarUrl: string | null;
  updatedAt: string;
};

export type SectionLockRecord = Record<string, SectionLockEntry>;

export type SectionLockAcquireResult = {
  acquired?: boolean;
  lock_user_id?: string | null;
  lock_name?: string | null;
  lock_avatar_url?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
};

export const EDITABLE_SECTION_LABELS: Record<BuilderEditableSectionKey, string> = {
  metadata: "Solidary Metadata",
  pages: "Pages",
  header: "Header",
  footer: "Footer",
  styles: "Styles"
};

export const getEditableSectionFromUi = (
  section: BuilderSection,
  settingsSection: BuilderSettingsSection,
  pageEditingMode: boolean
): BuilderEditableSectionKey | null => {
  if (section === "content") return "metadata";
  if (section !== "settings") return null;
  if (settingsSection === "pages" && !pageEditingMode) return null;
  return settingsSection;
};

export const isBuilderEditableSectionKey = (value: string): value is BuilderEditableSectionKey =>
  value === "metadata" ||
  value === "pages" ||
  value === "header" ||
  value === "footer" ||
  value === "styles";

const normalizePageLockValue = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

export const getPageLockKey = (value: string): string =>
  `page:${normalizePageLockValue(value) || "home"}`;

export const getPageLockKeyForPage = (page: BuilderPage, index: number): string =>
  getPageLockKey(
    typeof page.id === "string" && page.id.trim() ? page.id.trim() : getPageSafeSlug(page, index)
  );

export const getPageLockKeyForSlug = (pages: BuilderPage[], activePageSlug: string): string => {
  const normalizedSlug = normalizePageSlug(activePageSlug) || "home";
  const matchedIndex = pages.findIndex(
    (page, index) => getPageSafeSlug(page, index) === normalizedSlug
  );
  if (matchedIndex === -1) {
    return getPageLockKey(normalizedSlug);
  }
  return getPageLockKeyForPage(pages[matchedIndex], matchedIndex);
};

export const isPageLockKey = (value: string): boolean =>
  /^page:[a-z0-9][a-z0-9_-]*$/.test(value);

export const isStudioSettingsLockKey = (value: string): boolean =>
  value === "settings:general" ||
  value === "settings:connections" ||
  value === "settings:collaborators" ||
  value === "settings:danger";

export const isSupportedLockKey = (value: string): boolean =>
  isBuilderEditableSectionKey(value) || isPageLockKey(value) || isStudioSettingsLockKey(value);

export const getLockKeyFromUi = (
  section: BuilderSection,
  settingsSection: BuilderSettingsSection,
  activePageSlug: string,
  pages: BuilderPage[],
  pageEditingMode: boolean
): string | null => {
  if (section === "content") return "metadata";
  if (section !== "settings") return null;
  if (settingsSection === "pages" && !pageEditingMode) return null;
  if (settingsSection === "pages") return getPageLockKeyForSlug(pages, activePageSlug);
  return settingsSection;
};

export const getLockLabel = (lockKey: string): string => {
  if (isPageLockKey(lockKey)) {
    return "this page";
  }
  if (isBuilderEditableSectionKey(lockKey)) {
    return EDITABLE_SECTION_LABELS[lockKey];
  }
  if (lockKey === "settings:general") return "General";
  if (lockKey === "settings:connections") return "Connections";
  if (lockKey === "settings:collaborators") return "Collaborators";
  if (lockKey === "settings:danger") return "Advanced";
  return "this section";
};
