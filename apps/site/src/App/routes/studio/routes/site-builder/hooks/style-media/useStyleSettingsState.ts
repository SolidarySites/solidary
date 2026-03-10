import { useMemo, useState } from "react";
import {
  GLOBAL_STYLES_TEMPLATE as globalStylesTemplate,
  STRUCTURE_TEMPLATE as structureTemplate,
  TOKENS_TEMPLATE as tokensTemplate
} from "../../../../../../../templates/site";
import {
  combineTokensAndStructureCss
} from "../../services/style-editor";
import type {
  BuilderStyleSettings,
  BuilderStylesMode
} from "../../services/types";

export const defaultStyleMode: BuilderStylesMode = "simple";

export const useStyleSettingsState = () => {
  const [tokensCss, setTokensCss] = useState(tokensTemplate);
  const [styleMode, setStyleMode] = useState<BuilderStylesMode>(defaultStyleMode);
  const [advancedStructureCss, setAdvancedStructureCss] = useState("");
  const [baseStructureCss, setBaseStructureCss] = useState(structureTemplate);
  const [baseGlobalCss, setBaseGlobalCss] = useState(globalStylesTemplate);
  const [mobilePreviewEnabled, setMobilePreviewEnabled] = useState(false);

  const styleSettings = useMemo<BuilderStyleSettings>(
    () => ({
      tokensCss,
      styleMode,
      advancedStructureCss,
      baseStructureCss: styleMode === "simple" ? structureTemplate : baseStructureCss,
      baseGlobalCss
    }),
    [advancedStructureCss, baseGlobalCss, baseStructureCss, styleMode, tokensCss]
  );

  const previewStylesCss = useMemo(
    () =>
      styleMode === "advanced"
        ? advancedStructureCss.trim() || combineTokensAndStructureCss(tokensCss, baseStructureCss)
        : tokensCss,
    [advancedStructureCss, baseStructureCss, styleMode, tokensCss]
  );

  const handleStyleModeChange = (nextMode: BuilderStylesMode) => {
    setStyleMode(nextMode);
    if (nextMode === "advanced" && !advancedStructureCss.trim()) {
      const structureSource = baseStructureCss.trim() || structureTemplate;
      setAdvancedStructureCss(combineTokensAndStructureCss(tokensCss, structureSource));
      return;
    }
    if (nextMode === "simple") {
      setBaseStructureCss(structureTemplate);
    }
  };

  return {
    tokensCss,
    setTokensCss,
    styleMode,
    setStyleMode,
    handleStyleModeChange,
    advancedStructureCss,
    setAdvancedStructureCss,
    baseStructureCss,
    setBaseStructureCss,
    baseGlobalCss,
    setBaseGlobalCss,
    mobilePreviewEnabled,
    setMobilePreviewEnabled,
    styleSettings,
    previewStylesCss
  };
};
