import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../../../lib/supabase";
import { useSiteBuilderRouteController } from "../../site-builder/hooks/useSiteBuilderRouteController";
import { useDraftSectionLocks } from "../../site-builder/hooks/useDraftSectionLocks";
import type { SectionLockRecord } from "../../site-builder/services/locks";
import {
  getStudioSettingsLockKey,
  parseStudioSettingsSection,
  STUDIO_SETTINGS_SECTION_LABELS,
  STUDIO_SETTINGS_SECTION_ORDER,
  type StudioSettingsSection
} from "../services/settings-sections";
import { resolveSettingsLockHolderName } from "../services/settings-lock";

export const useStudioSettingsRouteController = () => {
  const [searchParams] = useSearchParams();
  const controller = useSiteBuilderRouteController({ mode: "settings" });
  const [requestedSection, setRequestedSection] = useState<StudioSettingsSection>(
    () => parseStudioSettingsSection(searchParams.get("section")) ?? "general"
  );
  const [settingsSectionLocks, setSettingsSectionLocks] = useState<SectionLockRecord>({});

  const canAccessDanger = controller.settingsRouteContext.siteAccessRole === "owner";
  const canAccessSettingsPage = controller.settingsRouteContext.canAccessSettingsPage;
  const hasUnsavedSettingsChanges = controller.settingsRouteContext.hasUnsavedChanges;
  const saveGeneralDraftSilently = controller.settingsRouteContext.saveGeneralDraftSilently;
  const sessionUserId = controller.settingsRouteContext.sessionUserId;
  const canEditDraft = controller.settingsRouteContext.canEditDraft && canAccessSettingsPage;
  const activeSection: StudioSettingsSection = requestedSection;
  const [ownerDisplayName, setOwnerDisplayName] = useState("site owner");

  const activeLockKey = useMemo(() => {
    if (!canEditDraft) return null;
    if (activeSection === "danger" && !canAccessDanger) return null;
    return getStudioSettingsLockKey(activeSection);
  }, [activeSection, canAccessDanger, canEditDraft]);

  const { releaseSectionLock } = useDraftSectionLocks({
    draftId: controller.settingsRouteContext.draftId,
    sessionUserId,
    canEditDraft,
    sessionDisplayName: controller.settingsRouteContext.sessionDisplayName,
    sessionAvatarUrl: controller.settingsRouteContext.sessionAvatarUrl,
    activeLockKey,
    scope: "settings",
    setSectionLocks: setSettingsSectionLocks
  });

  const activeSectionLock = activeLockKey ? settingsSectionLocks[activeLockKey] : null;
  const activeSectionLockedByOther = Boolean(
    activeSectionLock && activeSectionLock.userId !== sessionUserId
  );

  const sectionButtons = STUDIO_SETTINGS_SECTION_ORDER.map((section) => {
    const lock = settingsSectionLocks[getStudioSettingsLockKey(section)];
    const lockedByOther = Boolean(lock && lock.userId !== sessionUserId);
    const roleBlocked = !canAccessSettingsPage;
    return {
      section,
      label: STUDIO_SETTINGS_SECTION_LABELS[section],
      lockedByOther,
      lockHolderName: lockedByOther ? (lock?.holderName ?? null) : null,
      lockHolderAvatarUrl: lockedByOther ? (lock?.holderAvatarUrl ?? null) : null,
      disabled: roleBlocked || (lockedByOther && activeSection !== section)
    };
  });

  useEffect(() => {
    const draftId = controller.settingsRouteContext.draftId;
    if (!draftId) return;

    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("site_draft_owner_display_name", {
          p_draft_id: draftId
        });
        if (cancelled || error) return;
        if (typeof data === "string" && data.trim()) {
          setOwnerDisplayName(data.trim());
          return;
        }
        setOwnerDisplayName("site owner");
      } catch {
        if (!cancelled) setOwnerDisplayName("site owner");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [controller.settingsRouteContext.draftId]);

  useEffect(() => {
    if (!canAccessSettingsPage) return;
    if (activeSection !== "general") return;
    if (!hasUnsavedSettingsChanges) return;

    const timer = window.setInterval(() => {
      void saveGeneralDraftSilently();
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    activeSection,
    canAccessSettingsPage,
    hasUnsavedSettingsChanges,
    saveGeneralDraftSilently
  ]);

  const bodyClassName = controller.bodyClassName.includes("is-settings-full")
    ? controller.bodyClassName
    : `${controller.bodyClassName} is-settings-full`.trim();
  const showContentLoadingPlaceholder =
    controller.previewPanelProps.shouldLoadDraft && controller.previewPanelProps.isDraftLoading;
  const settingsAccessBlocked =
    !canAccessSettingsPage || (activeSection === "danger" && !canAccessDanger);
  const ownerDisplayNameForMessage =
    controller.settingsRouteContext.draftId ? ownerDisplayName : "site owner";
  const settingsAccessBlockedMessage = !canAccessSettingsPage
    ? "Your current role can edit the site builder, but cannot access this settings page."
    : activeSection === "danger" && !canAccessDanger
      ? `Only the owner ${ownerDisplayNameForMessage} can edit this page.`
      : "";

  return {
    ...controller,
    bodyClassName,
    showContentLoadingPlaceholder,
    settingsTopbarProps: {
      activeSection,
      sectionButtons,
      onSectionChange: (section: StudioSettingsSection) => {
        const target = sectionButtons.find((entry) => entry.section === section);
        if (target?.disabled) return;
        const nextLockKey = getStudioSettingsLockKey(section);
        if (activeLockKey && activeLockKey !== nextLockKey) {
          void releaseSectionLock(activeLockKey).catch(() => undefined);
        }
        if (activeSection === "general" && section !== "general") {
          void saveGeneralDraftSilently();
        }
        setRequestedSection(section);
      }
    },
    contentSectionProps: {
      ...controller.contentSectionProps,
      draftId: controller.settingsRouteContext.draftId,
      settingsAccessBlocked,
      settingsAccessBlockedMessage,
      activeSection,
      activeSectionLockedByOther,
      activeSectionLockHolderName: resolveSettingsLockHolderName(activeSectionLock?.holderName),
      ownerAccess: canAccessDanger
    }
  };
};
