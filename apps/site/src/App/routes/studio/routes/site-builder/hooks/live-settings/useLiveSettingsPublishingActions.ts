import { useState } from "react";
import { buildSolidaryMarkdown } from "../../../../../../features/site-draft/services/astro-builders";
import { requireFreshGithubAuth } from "../../../../../../features/auth/services/github-auth";
import { toBase64 } from "../../../../../../lib/base64";
import { githubRequest } from "../../../../../../services/github";
import { buildSettingsPayload, buildSolidaryFile } from "../../services/build-files";
import { FILE_KEYS } from "../../services/constants";
import { getPublishImageInfo } from "../../services/publish/shared";
import type { DraftState } from "../../services/types";
import type { UseSiteBuilderLiveSettingsActionsOptions } from "./types";
import {
  loadLatestDraftSolidaryRaw,
  resolveRepoCoordinates,
  upsertPublishedSiteRecord
} from "./shared";

type UseLiveSettingsPublishingActionsOptions = Pick<
  UseSiteBuilderLiveSettingsActionsOptions,
  | "draftState"
  | "canDirectPublish"
  | "canEditDraft"
  | "savingDraft"
  | "hasUnsavedChanges"
  | "isProvisioning"
  | "isDraftLoading"
  | "activeSectionLockedByOther"
  | "siteTitle"
  | "siteDescription"
  | "siteUrl"
  | "siteImage"
  | "siteImagePreview"
  | "draftImageUrl"
  | "setDraftImageUrl"
  | "computedSlug"
  | "templateSolidary"
  | "siteSettingsInput"
  | "currentDraftSignature"
  | "saveSectionByKey"
  | "setLastSavedDraftSignature"
  | "setSavingDraft"
  | "setNotice"
  | "setNoticeKind"
  | "setDraftState"
>;

export const useLiveSettingsPublishingActions = ({
  draftState,
  canDirectPublish,
  canEditDraft,
  savingDraft,
  hasUnsavedChanges,
  isProvisioning,
  isDraftLoading,
  activeSectionLockedByOther,
  siteTitle,
  siteDescription,
  siteUrl,
  siteImage,
  siteImagePreview,
  draftImageUrl,
  setDraftImageUrl,
  computedSlug,
  templateSolidary,
  siteSettingsInput,
  currentDraftSignature,
  saveSectionByKey,
  setLastSavedDraftSignature,
  setSavingDraft,
  setNotice,
  setNoticeKind,
  setDraftState
}: UseLiveSettingsPublishingActionsOptions) => {
  const [savingGeneralSettingsToLive, setSavingGeneralSettingsToLive] = useState(false);
  const [savingConnectionsToLive, setSavingConnectionsToLive] = useState(false);

  const canSaveGeneralSettingsToLive =
    Boolean(draftState) &&
    canDirectPublish &&
    !savingGeneralSettingsToLive &&
    !isProvisioning &&
    !isDraftLoading &&
    !activeSectionLockedByOther;
  const canSaveConnectionsSettingsToLive =
    Boolean(draftState) &&
    canDirectPublish &&
    !savingConnectionsToLive &&
    !isProvisioning &&
    !isDraftLoading &&
    !activeSectionLockedByOther;

  const saveGeneralDraftSilently = async () => {
    if (!draftState || !canEditDraft || savingDraft || !hasUnsavedChanges) {
      return false;
    }

    setSavingDraft(true);
    try {
      const savedSignature = await saveSectionByKey("metadata");
      if (typeof savedSignature === "string" && savedSignature) {
        setLastSavedDraftSignature(savedSignature);
      } else {
        setLastSavedDraftSignature(currentDraftSignature);
      }
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to save draft.";
      setNotice(message);
      setNoticeKind("error");
      return false;
    } finally {
      setSavingDraft(false);
    }
  };

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

  const saveGeneralSettingsToLive = async () => {
    if (!draftState || savingGeneralSettingsToLive) return;
    if (!canDirectPublish) {
      setNotice("Only owners, admins, and editors can save settings live.");
      setNoticeKind("error");
      return;
    }

    setSavingGeneralSettingsToLive(true);
    setNotice(null);
    setNoticeKind(null);
    try {
      await requireFreshGithubAuth();
      await loadLatestDraftSolidaryRaw({
        targetDraftId: draftState.id,
        setDraftState
      });
      if (hasUnsavedChanges) {
        const draftSaved = await saveGeneralDraftSilently();
        if (!draftSaved) {
          return;
        }
      }

      const latestSolidaryRaw = await loadLatestDraftSolidaryRaw({
        targetDraftId: draftState.id,
        setDraftState
      });
      const { imagePath, imageUrl } = getPublishImageInfo({
        siteImage,
        computedSlug,
        draftImageUrl,
        siteImagePreview,
        siteUrl
      });

      if (siteImage) {
        const { owner, repo } = resolveRepoCoordinates(draftState.repoFullName);
        await githubRequest("github-contents-write", {
          owner,
          repo,
          path: imagePath,
          message: "Update site image",
          content: toBase64(await siteImage.arrayBuffer()),
          branch: draftState.branch
        });
      }

      const nextSolidaryRaw = buildSolidaryFile({
        templateSolidary,
        siteId: draftState.siteId,
        imageUrl,
        settingsInput: siteSettingsInput,
        urlOverride: siteUrl,
        previousSolidaryRaw: latestSolidaryRaw
      });

      const settingsPayload = buildSettingsPayload(siteSettingsInput, imageUrl, siteUrl);
      const solidaryContent = buildSolidaryMarkdown(settingsPayload);
      const { owner, repo } = resolveRepoCoordinates(draftState.repoFullName);

      await githubRequest("github-contents-batch-commit", {
        owner,
        repo,
        branch: draftState.branch,
        message: "Save general settings",
        upserts: [
          {
            path: FILE_KEYS.solidary,
            mode: "100644",
            content: toBase64(new TextEncoder().encode(nextSolidaryRaw).buffer)
          },
          {
            path: FILE_KEYS.solidaryContent,
            mode: "100644",
            content: toBase64(new TextEncoder().encode(solidaryContent).buffer)
          }
        ],
        deletes: []
      });

      await upsertPublishedSiteRecord({
        siteId: draftState.siteId,
        canonicalUrl: siteUrl,
        title: siteTitle,
        description: siteDescription,
        imageUrl
      });

      setDraftImageUrl(imageUrl);
      updateCachedSolidaryFile(nextSolidaryRaw);
      setNotice("General settings saved and published.");
      setNoticeKind("notice");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to save general settings.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setSavingGeneralSettingsToLive(false);
    }
  };

  const saveConnectionsToLive = async () => {
    if (!draftState || savingConnectionsToLive) return;
    if (!canDirectPublish) {
      setNotice("Only owners, admins, and editors can save settings live.");
      setNoticeKind("error");
      return;
    }

    setSavingConnectionsToLive(true);
    setNotice(null);
    setNoticeKind(null);
    try {
      await requireFreshGithubAuth();
      const latestSolidaryRaw = await loadLatestDraftSolidaryRaw({
        targetDraftId: draftState.id,
        setDraftState
      });
      if (!latestSolidaryRaw.trim()) {
        throw new Error("No settings manifest found for this draft.");
      }

      const { owner, repo } = resolveRepoCoordinates(draftState.repoFullName);
      await githubRequest("github-contents-batch-commit", {
        owner,
        repo,
        branch: draftState.branch,
        message: "Save connection settings",
        upserts: [
          {
            path: FILE_KEYS.solidary,
            mode: "100644",
            content: toBase64(new TextEncoder().encode(latestSolidaryRaw).buffer)
          }
        ],
        deletes: []
      });
      setNotice("Connection settings saved and published.");
      setNoticeKind("notice");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to save connection settings.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setSavingConnectionsToLive(false);
    }
  };

  return {
    savingGeneralSettingsToLive,
    savingConnectionsToLive,
    canSaveGeneralSettingsToLive,
    canSaveConnectionsSettingsToLive,
    saveGeneralDraftSilently,
    saveGeneralSettingsToLive,
    saveConnectionsToLive
  };
};
