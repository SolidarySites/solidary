import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { BuilderSection, BuilderSettingsSection } from "../../../services/types";

type UsePageEditingModeResetEffectOptions = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  clearSelectedEditorImage: () => void;
  setIsPageEditingMode: Dispatch<SetStateAction<boolean>>;
};

export const usePageEditingModeResetEffect = ({
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  clearSelectedEditorImage,
  setIsPageEditingMode
}: UsePageEditingModeResetEffectOptions) => {
  useEffect(() => {
    const inPageEditingMode =
      activeSection === "settings" && activeSettingsSection === "pages" && isPageEditingMode;
    if (inPageEditingMode) return;

    clearSelectedEditorImage();
    if (activeSection !== "settings" || activeSettingsSection !== "pages") {
      setIsPageEditingMode(false);
    }
  }, [
    activeSection,
    activeSettingsSection,
    clearSelectedEditorImage,
    isPageEditingMode,
    setIsPageEditingMode
  ]);
};
