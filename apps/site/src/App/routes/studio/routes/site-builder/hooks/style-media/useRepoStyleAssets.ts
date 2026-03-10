import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { loadRepoStyleAssets } from "../../services/style-repo";
import { extractFontFamiliesFromFontsCss } from "../../services/style-editor";
import type {
  BuilderSection,
  BuilderSettingsSection,
  DraftState
} from "../../services/types";
import {
  FONTS_TEMPLATE as fallbackFontsTemplate,
  GLOBAL_STYLES_TEMPLATE as globalStylesTemplate,
  STRUCTURE_TEMPLATE as structureTemplate
} from "../../../../../../../templates/astro/scaffold";

export type RepoFontsCssUpdate = {
  repoFullName: string;
  branch: string;
  fontsCss: string;
  warning?: string | null;
  syncWarning?: boolean;
};

type UseRepoStyleAssetsOptions = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  draftState: DraftState | null;
  baseStructureCss: string;
  baseGlobalCss: string;
  setBaseStructureCss: Dispatch<SetStateAction<string>>;
  setBaseGlobalCss: Dispatch<SetStateAction<string>>;
  hasUnsavedChangesRef: MutableRefObject<boolean>;
  shouldCaptureLoadedDraftSignatureRef: MutableRefObject<boolean>;
};

const defaultAvailableFonts = extractFontFamiliesFromFontsCss(fallbackFontsTemplate);

export const useRepoStyleAssets = ({
  activeSection,
  activeSettingsSection,
  draftState,
  baseStructureCss,
  baseGlobalCss,
  setBaseStructureCss,
  setBaseGlobalCss,
  hasUnsavedChangesRef,
  shouldCaptureLoadedDraftSignatureRef
}: UseRepoStyleAssetsOptions) => {
  const [repoFontsCss, setRepoFontsCss] = useState(fallbackFontsTemplate);
  const [availableFonts, setAvailableFonts] = useState<string[]>(defaultAvailableFonts);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontsError, setFontsError] = useState<string | null>(null);

  const styleRepoCacheRef = useRef(
    new Map<
      string,
      {
        availableFonts: string[];
        fontsCss: string;
        baseStructureCss: string;
        baseGlobalCss: string;
        warning: string | null;
      }
    >()
  );

  const applyRepoFontsCssUpdate = useCallback(({
    repoFullName,
    branch,
    fontsCss,
    warning,
    syncWarning = false
  }: RepoFontsCssUpdate) => {
    const cacheKey = `${repoFullName}:${branch}`;
    const cached = styleRepoCacheRef.current.get(cacheKey);
    const nextFonts = extractFontFamiliesFromFontsCss(fontsCss);
    const nextAvailableFonts = nextFonts.length ? nextFonts : defaultAvailableFonts;

    styleRepoCacheRef.current.set(cacheKey, {
      availableFonts: nextAvailableFonts,
      fontsCss,
      baseStructureCss: cached?.baseStructureCss ?? baseStructureCss,
      baseGlobalCss: cached?.baseGlobalCss ?? baseGlobalCss,
      warning: warning ?? cached?.warning ?? null
    });

    setRepoFontsCss(fontsCss);
    setAvailableFonts(nextAvailableFonts);
    if (syncWarning) {
      setFontsError(warning ?? null);
    }
  }, [baseGlobalCss, baseStructureCss]);

  useEffect(() => {
    if (
      activeSection !== "settings" ||
      (activeSettingsSection !== "styles" && activeSettingsSection !== "media")
    ) {
      setFontsLoading(false);
      return;
    }

    if (!draftState?.repoFullName) {
      setFontsLoading(false);
      setFontsError(null);
      setRepoFontsCss(fallbackFontsTemplate);
      setAvailableFonts(defaultAvailableFonts);
      return;
    }

    const branch = (draftState.editorBranch ?? draftState.branch).trim();
    if (!branch) {
      setFontsLoading(false);
      setFontsError("Draft branch is missing. Unable to load repository fonts.");
      setRepoFontsCss(fallbackFontsTemplate);
      setAvailableFonts(defaultAvailableFonts);
      return;
    }

    const cacheKey = `${draftState.repoFullName}:${branch}`;
    const cachedStyles = styleRepoCacheRef.current.get(cacheKey);
    if (cachedStyles) {
      setRepoFontsCss(cachedStyles.fontsCss);
      setAvailableFonts(
        cachedStyles.availableFonts.length ? cachedStyles.availableFonts : defaultAvailableFonts
      );
      setFontsError(cachedStyles.warning);
      setFontsLoading(false);
      if (!baseStructureCss.trim() || baseStructureCss === structureTemplate) {
        setBaseStructureCss(cachedStyles.baseStructureCss);
      }
      if (!baseGlobalCss.trim() || baseGlobalCss === globalStylesTemplate) {
        setBaseGlobalCss(cachedStyles.baseGlobalCss);
      }
      return;
    }

    let cancelled = false;
    setFontsLoading(true);
    setFontsError(null);

    void (async () => {
      try {
        const repoStyles = await loadRepoStyleAssets({
          repoFullName: draftState.repoFullName,
          branch,
          fallbackFontsCss: fallbackFontsTemplate,
          fallbackStructureCss: structureTemplate,
          fallbackGlobalCss: globalStylesTemplate
        });
        if (cancelled) return;

        styleRepoCacheRef.current.set(cacheKey, {
          availableFonts: repoStyles.availableFonts,
          fontsCss: repoStyles.fontsCss,
          baseStructureCss: repoStyles.baseStructureCss,
          baseGlobalCss: repoStyles.baseGlobalCss,
          warning: repoStyles.warning
        });

        setRepoFontsCss(repoStyles.fontsCss);
        setAvailableFonts(
          repoStyles.availableFonts.length ? repoStyles.availableFonts : defaultAvailableFonts
        );
        setFontsError(repoStyles.warning);
        if (!baseStructureCss.trim() || baseStructureCss === structureTemplate) {
          setBaseStructureCss(repoStyles.baseStructureCss);
        }
        if (!baseGlobalCss.trim() || baseGlobalCss === globalStylesTemplate) {
          setBaseGlobalCss(repoStyles.baseGlobalCss);
        }
        if (!hasUnsavedChangesRef.current) {
          shouldCaptureLoadedDraftSignatureRef.current = true;
        }
      } catch (caught) {
        if (cancelled) return;
        const message =
          caught instanceof Error ? caught.message : "Unable to load style files from this repository.";
        setFontsError(message);
        setRepoFontsCss(fallbackFontsTemplate);
        setAvailableFonts(defaultAvailableFonts);
      } finally {
        if (!cancelled) {
          setFontsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    activeSettingsSection,
    baseGlobalCss,
    baseStructureCss,
    draftState?.branch,
    draftState?.editorBranch,
    draftState?.repoFullName,
    hasUnsavedChangesRef,
    setBaseGlobalCss,
    setBaseStructureCss,
    shouldCaptureLoadedDraftSignatureRef
  ]);

  return {
    repoFontsCss,
    fontsLoading,
    fontsError,
    availableFontsForControls: availableFonts.length ? availableFonts : defaultAvailableFonts,
    applyRepoFontsCssUpdate
  };
};
