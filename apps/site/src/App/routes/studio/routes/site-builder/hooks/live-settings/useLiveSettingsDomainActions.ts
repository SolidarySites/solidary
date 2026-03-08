import { useEffect, useState } from "react";
import { requireFreshGithubAuth } from "../../../../../../features/auth/services/github-auth";
import { githubRequest } from "../../../../../../services/github";
import { buildSolidaryFile } from "../../services/build-files";
import { FILE_KEYS } from "../../services/constants";
import type { DraftState } from "../../services/types";
import type {
  DomainActionMode,
  DomainDnsFeedbackState,
  GitHubPagesDomainResponse,
  UseSiteBuilderLiveSettingsActionsOptions
} from "./types";
import {
  loadLatestDraftSolidaryRaw,
  normalizeCustomDomainInput,
  publishSolidaryManifestToRepo,
  resolveRepoCoordinates,
  upsertPublishedSiteRecord
} from "./shared";

type UseLiveSettingsDomainActionsOptions = Pick<
  UseSiteBuilderLiveSettingsActionsOptions,
  | "draftState"
  | "isOwnerOnOwnerDraft"
  | "canDirectPublish"
  | "siteTitle"
  | "siteDescription"
  | "setSiteUrl"
  | "draftSaveImageUrl"
  | "templateSolidary"
  | "siteSettingsInput"
  | "setNotice"
  | "setNoticeKind"
  | "setDraftState"
>;

export const useLiveSettingsDomainActions = ({
  draftState,
  isOwnerOnOwnerDraft,
  canDirectPublish,
  siteTitle,
  siteDescription,
  setSiteUrl,
  draftSaveImageUrl,
  templateSolidary,
  siteSettingsInput,
  setNotice,
  setNoticeKind,
  setDraftState
}: UseLiveSettingsDomainActionsOptions) => {
  const [domainActionBusy, setDomainActionBusy] = useState<DomainActionMode | "none">("none");
  const [domainDnsFeedback, setDomainDnsFeedback] = useState<DomainDnsFeedbackState | null>(null);

  useEffect(() => {
    setDomainActionBusy("none");
    setDomainDnsFeedback(null);
  }, [draftState?.siteId]);

  const updateCachedSolidaryFile = (nextSolidaryRaw: string) => {
    setDraftState((current: DraftState | null) =>
      current
        ? {
            ...current,
            files: {
              [FILE_KEYS.solidary]: nextSolidaryRaw
            }
          }
        : current
    );
  };

  const applyDomainConnectResult = async ({
    requestedDomain,
    result
  }: {
    requestedDomain: string;
    result: GitHubPagesDomainResponse;
  }) => {
    const resolvedDomain = normalizeCustomDomainInput(result.domain ?? requestedDomain);
    const dnsStatus = result.dns?.status ?? "pending";
    const dnsMessage = result.dns?.message?.trim() ?? "";

    if (dnsStatus === "valid") {
      setDomainDnsFeedback(null);
      setSiteUrl(resolvedDomain);
      const pagesUrl = result.pagesUrl?.trim() || result.pages?.html_url?.trim() || "";

      try {
        if (draftState && canDirectPublish) {
          const latestSolidaryRaw = await loadLatestDraftSolidaryRaw({
            targetDraftId: draftState.id,
            setDraftState
          });
          const nextSolidaryRaw = buildSolidaryFile({
            templateSolidary,
            siteId: draftState.siteId,
            imageUrl: draftSaveImageUrl,
            settingsInput: siteSettingsInput,
            urlOverride: resolvedDomain,
            previousSolidaryRaw: latestSolidaryRaw
          });

          await publishSolidaryManifestToRepo({
            draftState,
            message: "Update custom domain",
            solidaryRaw: nextSolidaryRaw
          });
          updateCachedSolidaryFile(nextSolidaryRaw);

          await upsertPublishedSiteRecord({
            siteId: draftState.siteId,
            canonicalUrl: resolvedDomain,
            title: siteTitle,
            description: siteDescription,
            imageUrl: draftSaveImageUrl
          });
        }

        setNotice(
          pagesUrl
            ? `Custom domain connected. DNS checks passed and Studio was updated to ${resolvedDomain}. Live URL: ${pagesUrl}`
            : `Custom domain connected. DNS checks passed and Studio was updated to ${resolvedDomain}.`
        );
        setNoticeKind("notice");
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "Domain connected, but Solidary manifest update failed.";
        setNotice(message);
        setNoticeKind("error");
      }
      return;
    }

    const fallbackMessage =
      dnsStatus === "pending"
        ? `DNS records for ${resolvedDomain} were not found.`
        : `DNS records for ${resolvedDomain} do not look correct yet.`;
    const message = dnsMessage || fallbackMessage;

    setDomainDnsFeedback({
      domain: resolvedDomain,
      status: dnsStatus,
      message
    });
    setNotice(
      `${message} DNS records don't seem to be set up correctly yet. Fix your provider records, then recheck.`
    );
    setNoticeKind("error");
  };

  const handleStudioOnlyDomainUpdate = (rawDomain: string) => {
    if (!isOwnerOnOwnerDraft) {
      setNotice("Only the site owner can update the domain in advanced settings.");
      setNoticeKind("error");
      return;
    }

    const normalizedDomain = normalizeCustomDomainInput(rawDomain);
    if (!normalizedDomain) {
      setNotice("Enter a valid domain like example.com.");
      setNoticeKind("error");
      return;
    }

    setSiteUrl(normalizedDomain);
    setDomainDnsFeedback(null);
    setNotice(
      "Studio domain updated only. Do this only if the site is hosted outside GitHub Pages."
    );
    setNoticeKind("notice");
  };

  const runGithubDomainAction = async ({
    rawDomain,
    action,
    ownerErrorMessage,
    invalidDomainMessage,
    genericErrorMessage,
    clearFeedbackBeforeRequest = false
  }: {
    rawDomain: string;
    action: "connect" | "check" | "remove";
    ownerErrorMessage: string;
    invalidDomainMessage: string;
    genericErrorMessage: string;
    clearFeedbackBeforeRequest?: boolean;
  }) => {
    if (!isOwnerOnOwnerDraft) {
      setNotice(ownerErrorMessage);
      setNoticeKind("error");
      return;
    }

    const repoFullName = draftState?.repoFullName?.trim() ?? "";
    let owner: string;
    let repo: string;
    try {
      const coordinates = resolveRepoCoordinates(repoFullName);
      owner = coordinates.owner;
      repo = coordinates.repo;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Invalid repository name.";
      setNotice(message);
      setNoticeKind("error");
      return;
    }

    const normalizedDomain = normalizeCustomDomainInput(rawDomain);
    if (!normalizedDomain) {
      setNotice(invalidDomainMessage);
      setNoticeKind("error");
      return;
    }

    setDomainActionBusy("github");
    if (clearFeedbackBeforeRequest) {
      setDomainDnsFeedback(null);
    }

    try {
      const freshAuth = await requireFreshGithubAuth();
      const result = await githubRequest<GitHubPagesDomainResponse>(
        "github-pages-set-domain",
        {
          owner,
          repo,
          action,
          domain: normalizedDomain,
          supabase_access_token: freshAuth.supabaseAccessToken
        }
      );

      if (action === "remove") {
        setDomainDnsFeedback(null);
        setNotice("Removed proposed custom domain from GitHub Pages.");
        setNoticeKind("notice");
        return;
      }

      await applyDomainConnectResult({
        requestedDomain: normalizedDomain,
        result
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : genericErrorMessage;
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setDomainActionBusy("none");
    }
  };

  const handleConnectGithubDomain = async (rawDomain: string) => {
    await runGithubDomainAction({
      rawDomain,
      action: "connect",
      ownerErrorMessage: "Only the site owner can connect a GitHub Pages custom domain.",
      invalidDomainMessage: "Enter a valid domain like example.com.",
      genericErrorMessage: "Failed to connect the GitHub Pages domain.",
      clearFeedbackBeforeRequest: true
    });
  };

  const handleRecheckGithubDomain = async (rawDomain: string) => {
    await runGithubDomainAction({
      rawDomain,
      action: "check",
      ownerErrorMessage: "Only the site owner can recheck a GitHub Pages custom domain.",
      invalidDomainMessage: "Enter a valid domain like example.com.",
      genericErrorMessage: "Failed to recheck GitHub Pages DNS."
    });
  };

  const handleRemoveProposedGithubDomain = async (rawDomain: string) => {
    await runGithubDomainAction({
      rawDomain,
      action: "remove",
      ownerErrorMessage: "Only the site owner can remove a proposed GitHub Pages custom domain.",
      invalidDomainMessage: "Missing proposed domain to remove.",
      genericErrorMessage: "Failed to remove proposed custom domain."
    });
  };

  return {
    domainActionBusy,
    domainDnsFeedback,
    handleStudioOnlyDomainUpdate,
    handleConnectGithubDomain,
    handleRecheckGithubDomain,
    handleRemoveProposedGithubDomain
  };
};
