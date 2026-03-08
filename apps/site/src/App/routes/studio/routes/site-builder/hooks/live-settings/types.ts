import type { Session } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { NoticeKind } from "../../../../../../types/notice";
import type {
  BuilderEditableSectionKey,
  DraftState,
  FooterOptions,
  HeaderOptions
} from "../../services/types";

export type SiteDeleteMode = "builder" | "github";
export type DomainActionMode = "github";
export type DomainDnsFeedbackStatus = "valid" | "invalid" | "pending";

export type DomainDnsFeedbackState = {
  domain: string;
  status: DomainDnsFeedbackStatus;
  message: string;
};

export type GitHubPagesDomainResponse = {
  domain?: string;
  status?: "connected" | "checked" | "removed";
  pagesUrl?: string;
  pages?: {
    html_url?: string;
    cname?: string;
  };
  dns?: {
    status?: DomainDnsFeedbackStatus;
    message?: string;
  };
};

export type SiteSettingsInput = {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  headHtml?: string;
  locale?: string;
  twitter?: boolean;
  openGraph?: boolean;
  structuredData?: boolean;
  indexFollow?: boolean;
  header: HeaderOptions;
  footer: FooterOptions;
};

export type UseSiteBuilderLiveSettingsActionsOptions = {
  session: Session | null;
  draftState: DraftState | null;
  canDeleteSite: boolean;
  deleteSiteRepoFullName: string;
  isOwnerOnOwnerDraft: boolean;
  canDirectPublish: boolean;
  canEditDraft: boolean;
  savingDraft: boolean;
  hasUnsavedChanges: boolean;
  isProvisioning: boolean;
  isDraftLoading: boolean;
  activeSectionLockedByOther: boolean;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  setSiteUrl: Dispatch<SetStateAction<string>>;
  siteImage: File | null;
  siteImagePreview: string | null;
  draftImageUrl: string | null;
  setDraftImageUrl: Dispatch<SetStateAction<string | null>>;
  draftSaveImageUrl: string;
  computedSlug: string;
  templateSolidary: string;
  siteSettingsInput: SiteSettingsInput;
  currentDraftSignature: string;
  saveSectionByKey: (sectionKey: BuilderEditableSectionKey) => Promise<string | undefined>;
  setLastSavedDraftSignature: Dispatch<SetStateAction<string>>;
  setSavingDraft: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
  setDraftState: Dispatch<SetStateAction<DraftState | null>>;
  navigate: NavigateFunction;
};
