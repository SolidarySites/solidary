import { useEffect, type Dispatch, type SetStateAction } from "react";
import { supabase } from "../../../../../../../lib/supabase";
import type { BuilderSection, DraftState } from "../../../services/types";

type UseBuilderAccessModeEffectOptions = {
  shouldLoadDraft: boolean;
  isDraftLoading: boolean;
  canEditDraft: boolean;
  draftState: DraftState | null;
  sessionUserId: string | null;
  mode: "editor" | "settings";
  activeSection: BuilderSection;
  isOwnerOnOwnerDraft: boolean;
  setActiveSection: Dispatch<SetStateAction<BuilderSection>>;
};

export const useBuilderAccessModeEffect = ({
  shouldLoadDraft,
  isDraftLoading,
  canEditDraft,
  draftState,
  sessionUserId,
  mode,
  activeSection,
  isOwnerOnOwnerDraft,
  setActiveSection
}: UseBuilderAccessModeEffectOptions) => {
  useEffect(() => {
    if (shouldLoadDraft && isDraftLoading) return;

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

      if (mode === "settings") return;
      if (activeSection !== "content" && activeSection !== "settings") return;
      setActiveSection("menu");
      return;
    }

    if (mode === "settings") return;
    if (isOwnerOnOwnerDraft || activeSection !== "content") return;
    setActiveSection("menu");
  }, [
    activeSection,
    canEditDraft,
    draftState,
    isDraftLoading,
    isOwnerOnOwnerDraft,
    mode,
    sessionUserId,
    setActiveSection,
    shouldLoadDraft
  ]);
};
