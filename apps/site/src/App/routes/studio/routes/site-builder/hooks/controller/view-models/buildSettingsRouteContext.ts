import type { BuildSiteBuilderViewModelsOptions, SettingsRouteContext } from "./types";

type BuildSettingsRouteContextOptions = Pick<
  BuildSiteBuilderViewModelsOptions,
  | "draftId"
  | "sessionUserId"
  | "canEditDraft"
  | "sessionDisplayName"
  | "sessionAvatarUrl"
  | "siteAccessRole"
  | "hasUnsavedChanges"
  | "savingDraft"
  | "liveSettings"
>;

export const buildSettingsRouteContext = ({
  draftId,
  sessionUserId,
  canEditDraft,
  sessionDisplayName,
  sessionAvatarUrl,
  siteAccessRole,
  hasUnsavedChanges,
  savingDraft,
  liveSettings
}: BuildSettingsRouteContextOptions): SettingsRouteContext => {
  const canAccessSettingsPage = siteAccessRole === "owner" || siteAccessRole === "admin";

  return {
    draftId,
    sessionUserId,
    canEditDraft,
    sessionDisplayName,
    sessionAvatarUrl,
    siteAccessRole,
    canAccessSettingsPage,
    hasUnsavedChanges,
    savingDraft,
    saveGeneralDraftSilently: () => liveSettings.saveGeneralDraftSilently(),
    canSaveGeneralSettingsToLive: liveSettings.canSaveGeneralSettingsToLive,
    canSaveConnectionsSettingsToLive: liveSettings.canSaveConnectionsSettingsToLive,
    savingGeneralSettingsToLive: liveSettings.savingGeneralSettingsToLive,
    savingConnectionsToLive: liveSettings.savingConnectionsToLive,
    saveGeneralSettingsToLive: () => {
      void liveSettings.saveGeneralSettingsToLive();
    },
    saveConnectionsSettingsToLive: () => {
      void liveSettings.saveConnectionsToLive();
    }
  };
};
