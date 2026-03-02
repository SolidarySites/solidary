import { readTextFile } from "../../../../../services/github";
import { extractFontFamiliesFromFontsCss } from "./style-editor";

const FONTS_PATH = "src/styles/partials/fonts.css";
const STRUCTURE_PATH = "src/styles/partials/structure.css";
const GLOBAL_PATH = "src/styles/global.css";

export type RepoStyleAssets = {
  fontsCss: string;
  baseStructureCss: string;
  baseGlobalCss: string;
  availableFonts: string[];
  warning: string | null;
};

type LoadRepoStyleAssetsInput = {
  repoFullName: string;
  branch: string;
  fallbackFontsCss: string;
  fallbackStructureCss: string;
  fallbackGlobalCss: string;
};

const splitRepoName = (repoFullName: string) => {
  const [owner, repo] = repoFullName.trim().split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
};

const buildWarningMessage = (missingFiles: string[]) => {
  if (!missingFiles.length) return null;
  if (missingFiles.length === 1) {
    return `${missingFiles[0]} could not be loaded from the repository. Using fallback defaults.`;
  }
  return `${missingFiles.join(", ")} could not be loaded from the repository. Using fallback defaults.`;
};

const mergeWarnings = (...warnings: Array<string | null>) => {
  const parts = warnings
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);
  if (!parts.length) return null;
  return parts.join(" ");
};

export const loadRepoStyleAssets = async ({
  repoFullName,
  branch,
  fallbackFontsCss,
  fallbackStructureCss,
  fallbackGlobalCss
}: LoadRepoStyleAssetsInput): Promise<RepoStyleAssets> => {
  const repoParts = splitRepoName(repoFullName);
  if (!repoParts) {
    const availableFonts = extractFontFamiliesFromFontsCss(fallbackFontsCss);
    return {
      fontsCss: fallbackFontsCss,
      baseStructureCss: fallbackStructureCss,
      baseGlobalCss: fallbackGlobalCss,
      availableFonts,
      warning: "Repository name is invalid. Using fallback style defaults."
    };
  }

  const { owner, repo } = repoParts;
  const [fontsCssRaw, structureCssRaw, globalCssRaw] = await Promise.all([
    readTextFile("", owner, repo, FONTS_PATH, branch, true),
    readTextFile("", owner, repo, STRUCTURE_PATH, branch, true),
    readTextFile("", owner, repo, GLOBAL_PATH, branch, true)
  ]);

  const missingFiles: string[] = [];

  const fontsCss = typeof fontsCssRaw === "string" && fontsCssRaw.trim() ? fontsCssRaw : fallbackFontsCss;
  if (!(typeof fontsCssRaw === "string" && fontsCssRaw.trim())) missingFiles.push(FONTS_PATH);

  const baseStructureCss =
    typeof structureCssRaw === "string" && structureCssRaw.trim()
      ? structureCssRaw
      : fallbackStructureCss;
  if (!(typeof structureCssRaw === "string" && structureCssRaw.trim())) missingFiles.push(STRUCTURE_PATH);

  const baseGlobalCss = typeof globalCssRaw === "string" && globalCssRaw.trim() ? globalCssRaw : fallbackGlobalCss;
  if (!(typeof globalCssRaw === "string" && globalCssRaw.trim())) missingFiles.push(GLOBAL_PATH);

  const availableFontsFromRepo = extractFontFamiliesFromFontsCss(fontsCss);
  const fallbackFonts = extractFontFamiliesFromFontsCss(fallbackFontsCss);
  const availableFonts = availableFontsFromRepo.length ? availableFontsFromRepo : fallbackFonts;
  const fontsParseWarning =
    availableFontsFromRepo.length > 0
      ? null
      : `No @font-face font-family names were found in ${FONTS_PATH}. Using fallback defaults.`;
  const missingFilesWarning = buildWarningMessage(missingFiles);

  return {
    fontsCss,
    baseStructureCss,
    baseGlobalCss,
    availableFonts,
    warning: mergeWarnings(missingFilesWarning, fontsParseWarning)
  };
};
