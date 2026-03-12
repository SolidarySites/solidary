import { useEffect, useMemo, useState } from "react";
import { requireFreshGithubAuth } from "../../../../../../features/auth/services/github-auth";
import { githubRequest } from "../../../../../../services/github";
import { resolveSiteUrlFromRepo } from "../../../../../../lib/site-url";
import { FILE_KEYS } from "../../services/constants";
import { buildDraftSaveSignature } from "../../services/draft-utils";
import { publishLiveDomainChange } from "../../services/live-domain-publish";
import type { DraftState } from "../../services/types";
import type {
  DomainActionMode,
  DomainDnsFeedbackState,
  GitHubPagesDomainResponse,
  UseSiteBuilderLiveSettingsActionsOptions
} from "./types";
import {
  loadLatestDraftWellKnownFiles,
  mergeDraftWellKnownFiles,
  normalizeCustomDomainInput,
  resolveRepoCoordinates,
  toCanonicalSiteUrl
} from "./shared";

type UseLiveSettingsDomainActionsOptions = Pick<
  UseSiteBuilderLiveSettingsActionsOptions,
  | "draftState"
  | "sessionUserId"
  | "isOwnerOnOwnerDraft"
  | "canDirectPublish"
  | "setSiteUrl"
  | "draftSaveImageUrl"
  | "pages"
  | "draftImages"
  | "styles"
  | "templateSolidary"
  | "templateSolidaryLinks"
  | "siteSettingsInput"
  | "setLastSavedDraftSignature"
  | "setNotice"
  | "setNoticeKind"
  | "setDraftState"
>;

export const useLiveSettingsDomainActions = ({
  draftState,
  sessionUserId,
  isOwnerOnOwnerDraft,
  canDirectPublish,
  setSiteUrl,
  draftSaveImageUrl,
  pages,
  draftImages,
  styles,
  templateSolidary,
  templateSolidaryLinks,
  siteSettingsInput,
  setLastSavedDraftSignature,
  setNotice,
  setNoticeKind,
  setDraftState
}: UseLiveSettingsDomainActionsOptions) => {
  const [domainActionBusy, setDomainActionBusy] = useState<DomainActionMode | "none">("none");
  const [domainDnsFeedback, setDomainDnsFeedback] = useState<DomainDnsFeedbackState | null>(null);
  const defaultGitHubPagesUrl = useMemo(() => {
    const repoFullName = draftState?.repoFullName?.trim() ?? "";
    if (!repoFullName) return null;

    try {
      const { owner, repo } = resolveRepoCoordinates(repoFullName);
      return resolveSiteUrlFromRepo({
        ownerLogin: owner,
        repoName: repo
      });
    } catch {
      return null;
    }
  }, [draftState?.repoFullName]);
  const canResetGitHubPagesDomain = Boolean(
    defaultGitHubPagesUrl &&
      siteSettingsInput.siteUrl.trim() &&
      defaultGitHubPagesUrl !== siteSettingsInput.siteUrl.trim()
  );

  useEffect(() => {
    setDomainActionBusy("none");
    setDomainDnsFeedback(null);
  }, [draftState?.siteId]);

  const updateCachedWellKnownFiles = ({
    solidaryRaw,
    solidaryLinksRaw
  }: {
    solidaryRaw?: string;
    solidaryLinksRaw?: string;
  }) => {
    setDraftState((current: DraftState | null) =>
      mergeDraftWellKnownFiles({
        current,
        solidaryRaw,
        solidaryLinksRaw
      })
    );
  };

  const updateDraftRevisionState = (draftRevisionRow: {
    revision: number | null;
    last_edited_at: string | null;
    last_edited_by_user_id: string | null;
  }) => {
    setDraftState((current) => {
      const nextState = mergeDraftWellKnownFiles({ current });
      if (!nextState) return nextState;

      return {
        ...nextState,
        revision:
          typeof draftRevisionRow.revision === "number"
            ? draftRevisionRow.revision
            : nextState.revision,
        lastEditedAt:
          typeof draftRevisionRow.last_edited_at === "string"
            ? draftRevisionRow.last_edited_at
            : (nextState.lastEditedAt ?? null),
        lastEditedByUserId:
          typeof draftRevisionRow.last_edited_by_user_id === "string"
            ? draftRevisionRow.last_edited_by_user_id
            : (nextState.lastEditedByUserId ?? null)
      };
    });
  };

  const publishDomainChange = async ({
    nextSiteUrl,
    commitMessage,
    workflowMode = "keep"
  }: {
    nextSiteUrl: string;
    commitMessage: string;
    workflowMode?: "keep" | "remove" | "restore";
  }) => {
    if (!draftState || !canDirectPublish) {
      throw new Error("Save your draft first to manage the live domain.");
    }

    const { solidaryRaw: latestSolidaryRaw, solidaryLinksRaw: latestSolidaryLinksRaw } =
      await loadLatestDraftWellKnownFiles({
        targetDraftId: draftState.id,
        setDraftState
      });
    const draftFiles = {
      ...draftState.files,
      [FILE_KEYS.solidary]: latestSolidaryRaw,
      [FILE_KEYS.solidaryLinks]: latestSolidaryLinksRaw
    };
    const result = await publishLiveDomainChange({
      draftState,
      draftFiles,
      templateSolidary,
      templateSolidaryLinks,
      siteSettingsInput,
      nextSiteUrl,
      imageUrl: draftSaveImageUrl,
      sessionUserId,
      commitMessage,
      workflowMode
    });

    setSiteUrl(nextSiteUrl);
    updateCachedWellKnownFiles({
      solidaryRaw: result.solidaryRaw,
      solidaryLinksRaw: result.solidaryLinksRaw
    });
    updateDraftRevisionState(result.draftRevisionRow);
    setLastSavedDraftSignature(
      buildDraftSaveSignature({
        draftId: draftState.id,
        settingsInput: {
          ...siteSettingsInput,
          siteUrl: nextSiteUrl
        },
        imageUrl: draftSaveImageUrl,
        styles,
        pagesSnapshot: pages,
        draftImages
      })
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
    const resolvedSiteUrl = toCanonicalSiteUrl(resolvedDomain);
    const dnsStatus = result.dns?.status ?? "pending";
    const dnsMessage = result.dns?.message?.trim() ?? "";

    if (dnsStatus === "valid") {
      setDomainDnsFeedback(null);
      const pagesUrl = result.pagesUrl?.trim() || result.pages?.html_url?.trim() || "";

      try {
        await publishDomainChange({
          nextSiteUrl: resolvedSiteUrl,
          commitMessage: "Update custom domain"
        });

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

  const handleStudioOnlyDomainUpdate = async (rawDomain: string) => {
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

    setDomainActionBusy("studio");
    try {
      const resolvedSiteUrl = toCanonicalSiteUrl(normalizedDomain);
      await publishDomainChange({
        nextSiteUrl: resolvedSiteUrl,
        commitMessage: "Update studio domain",
        workflowMode: "remove"
      });
      setDomainDnsFeedback(null);
      setNotice(
        "Studio domain updated and published. Use this only when the site is hosted outside GitHub Pages."
      );
      setNoticeKind("notice");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to update the Studio domain.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setDomainActionBusy("none");
    }
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
    action: "connect" | "check";
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

  const handleResetGithubDomain = async () => {
    if (!isOwnerOnOwnerDraft) {
      setNotice("Only the site owner can reset the site domain.");
      setNoticeKind("error");
      return;
    }

    if (!defaultGitHubPagesUrl) {
      setNotice("Could not resolve the default GitHub Pages URL for this repository.");
      setNoticeKind("error");
      return;
    }

    if (!draftState) {
      setNotice("Save your draft first to manage the site domain.");
      setNoticeKind("error");
      return;
    }

    const repoFullName = draftState.repoFullName?.trim() ?? "";
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

    setDomainActionBusy("reset");
    setDomainDnsFeedback(null);

    try {
      const freshAuth = await requireFreshGithubAuth();
      try {
        await githubRequest<GitHubPagesDomainResponse>("github-pages-set-domain", {
          owner,
          repo,
          action: "remove",
          supabase_access_token: freshAuth.supabaseAccessToken
        });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Failed to reset the custom domain.";
        if (!/No custom domain is configured yet/i.test(message)) {
          throw caught;
        }
      }

      await publishDomainChange({
        nextSiteUrl: defaultGitHubPagesUrl,
        commitMessage: "Reset domain to GitHub Pages",
        workflowMode: "restore"
      });
      setNotice(`Site domain reset to GitHub Pages: ${defaultGitHubPagesUrl}`);
      setNoticeKind("notice");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to reset to the GitHub Pages domain.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setDomainActionBusy("none");
    }
  };

  return {
    domainActionBusy,
    domainDnsFeedback,
    defaultGitHubPagesUrl,
    canResetGitHubPagesDomain,
    handleStudioOnlyDomainUpdate,
    handleConnectGithubDomain,
    handleRecheckGithubDomain,
    handleResetGithubDomain
  };
};
