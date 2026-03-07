export const CUSTOM_CSS_START_MARKER = "/* builder-custom-css:start */";
export const CUSTOM_CSS_END_MARKER = "/* builder-custom-css:end */";

const DEFAULT_ROOT_BLOCK = ":root {\n}\n";

const TOKENS_IMPORT_LINE = '@import "./partials/tokens.css";';
const TOKENS_IMPORT_REGEX = /@import\s+["']\.\/partials\/tokens\.css["'];?/;
const TOKENS_IMPORT_COMMENTED_REGEX = /\/\*\s*@import\s+["']\.\/partials\/tokens\.css["'];?\s*\*\//;

export const PRIMARY_FONT_FALLBACK_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
export const SECONDARY_FONT_FALLBACK_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

type ParsedCssColor = {
  hex: string;
  alpha: number;
};

const clamp = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

const quoteFontName = (value: string) => {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return "";
  return `"${trimmed.replace(/"/g, '\\"')}"`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type RootBlockRange = {
  start: number;
  end: number;
  bodyStart: number;
  bodyEnd: number;
  body: string;
};

const getRootBlockRange = (source: string): RootBlockRange | null => {
  const normalized = normalizeLineEndings(source);
  const rootMatch = normalized.match(/:root\s*\{/);
  if (!rootMatch || typeof rootMatch.index !== "number") return null;
  const openBraceIndex = normalized.indexOf("{", rootMatch.index);
  if (openBraceIndex < 0) return null;

  let depth = 0;
  for (let index = openBraceIndex; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          start: rootMatch.index,
          end: index + 1,
          bodyStart: openBraceIndex + 1,
          bodyEnd: index,
          body: normalized.slice(openBraceIndex + 1, index)
        };
      }
    }
  }

  return null;
};

const ensureRootBlock = (source: string) => {
  const normalized = normalizeLineEndings(source);
  const rootRange = getRootBlockRange(normalized);
  if (rootRange) return normalized;
  const trimmed = normalized.trim();
  if (!trimmed) return DEFAULT_ROOT_BLOCK;
  return `${trimmed}\n\n${DEFAULT_ROOT_BLOCK}`;
};

const parseHexChannel = (value: string) => Number.parseInt(value, 16);

const parseHexColor = (value: string): ParsedCssColor | null => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith("#")) return null;
  const hex = trimmed.slice(1);
  if (hex.length === 3) {
    const r = hex[0] + hex[0];
    const g = hex[1] + hex[1];
    const b = hex[2] + hex[2];
    return { hex: `#${r}${g}${b}`, alpha: 1 };
  }
  if (hex.length === 4) {
    const r = hex[0] + hex[0];
    const g = hex[1] + hex[1];
    const b = hex[2] + hex[2];
    const a = parseHexChannel(hex[3] + hex[3]) / 255;
    return { hex: `#${r}${g}${b}`, alpha: clamp(Number(a.toFixed(3)), 0, 1) };
  }
  if (hex.length === 6) {
    return { hex: `#${hex}`, alpha: 1 };
  }
  if (hex.length === 8) {
    const rgb = hex.slice(0, 6);
    const a = parseHexChannel(hex.slice(6, 8)) / 255;
    return { hex: `#${rgb}`, alpha: clamp(Number(a.toFixed(3)), 0, 1) };
  }
  return null;
};

const parseRgbColor = (value: string): ParsedCssColor | null => {
  const match = value
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!match) return null;
  const red = clamp(Number.parseFloat(match[1]), 0, 255);
  const green = clamp(Number.parseFloat(match[2]), 0, 255);
  const blue = clamp(Number.parseFloat(match[3]), 0, 255);
  const alpha = match[4] == null ? 1 : clamp(Number.parseFloat(match[4]), 0, 1);
  const toHex = (channel: number) => Math.round(channel).toString(16).padStart(2, "0");
  return {
    hex: `#${toHex(red)}${toHex(green)}${toHex(blue)}`,
    alpha: Number(alpha.toFixed(3))
  };
};

export const parseCssColor = (value: string): ParsedCssColor | null =>
  parseHexColor(value) ?? parseRgbColor(value);

const stripQuotes = (value: string) => value.trim().replace(/^['"]|['"]$/g, "");

const removeExistingCustomCssBlock = (tokensCss: string) => {
  const normalized = ensureRootBlock(tokensCss);
  const startIndex = normalized.indexOf(CUSTOM_CSS_START_MARKER);
  const endIndex = normalized.indexOf(CUSTOM_CSS_END_MARKER);
  if (startIndex >= 0 && endIndex > startIndex) {
    const removalEnd = endIndex + CUSTOM_CSS_END_MARKER.length;
    return `${normalized.slice(0, startIndex).trimEnd()}\n${normalized.slice(removalEnd).trimStart()}`.trimEnd();
  }
  const rootRange = getRootBlockRange(normalized);
  if (!rootRange) return normalized.trimEnd();
  return normalized.slice(0, rootRange.end).trimEnd();
};

export const getCssVariableValue = (tokensCss: string, variableName: string, fallback = "") => {
  const normalized = ensureRootBlock(tokensCss);
  const rootRange = getRootBlockRange(normalized);
  if (!rootRange) return fallback;
  const regex = new RegExp(`${escapeRegExp(variableName)}\\s*:\\s*([^;]+);`);
  const match = rootRange.body.match(regex);
  return match?.[1]?.trim() ?? fallback;
};

export const setCssVariableValue = (tokensCss: string, variableName: string, nextValue: string) => {
  const normalized = ensureRootBlock(tokensCss);
  const rootRange = getRootBlockRange(normalized);
  if (!rootRange) return normalized;
  const declaration = `${variableName}: ${nextValue};`;
  const variableRegex = new RegExp(`(^|\\n)\\s*${escapeRegExp(variableName)}\\s*:\\s*[^;]+;`, "m");

  if (variableRegex.test(rootRange.body)) {
    const nextBody = rootRange.body.replace(
      variableRegex,
      (_match, linePrefix) => `${linePrefix ?? "\n"}  ${declaration}`
    );
    return `${normalized.slice(0, rootRange.bodyStart)}${nextBody}${normalized.slice(rootRange.bodyEnd)}`;
  }

  const bodyWithNewDeclaration = `${rootRange.body.trimEnd()}\n  ${declaration}\n`;
  return `${normalized.slice(0, rootRange.bodyStart)}${bodyWithNewDeclaration}${normalized.slice(rootRange.bodyEnd)}`;
};

export const removeCssVariable = (tokensCss: string, variableName: string) => {
  const normalized = ensureRootBlock(tokensCss);
  const rootRange = getRootBlockRange(normalized);
  if (!rootRange) return normalized;

  const variableLineRegex = new RegExp(`^\\s*${escapeRegExp(variableName)}\\s*:\\s*[^;]+;\\s*$`);
  const nextBody = rootRange.body
    .split("\n")
    .filter((line) => !variableLineRegex.test(line))
    .join("\n");

  return `${normalized.slice(0, rootRange.bodyStart)}${nextBody}${normalized.slice(rootRange.bodyEnd)}`;
};

export const extractCustomCssFromTokens = (tokensCss: string) => {
  const normalized = ensureRootBlock(tokensCss);
  const startIndex = normalized.indexOf(CUSTOM_CSS_START_MARKER);
  const endIndex = normalized.indexOf(CUSTOM_CSS_END_MARKER);
  if (startIndex >= 0 && endIndex > startIndex) {
    const blockStart = startIndex + CUSTOM_CSS_START_MARKER.length;
    return normalized.slice(blockStart, endIndex).trim();
  }

  const rootRange = getRootBlockRange(normalized);
  if (!rootRange) return "";
  return normalized.slice(rootRange.end).trim();
};

export const setCustomCssInTokens = (tokensCss: string, customCss: string) => {
  const tokensWithoutCustomCss = removeExistingCustomCssBlock(tokensCss);
  const normalizedCustomCss = normalizeLineEndings(customCss).trim();
  if (!normalizedCustomCss) {
    return `${tokensWithoutCustomCss.trimEnd()}\n`;
  }
  return `${tokensWithoutCustomCss.trimEnd()}\n\n${CUSTOM_CSS_START_MARKER}\n${normalizedCustomCss}\n${CUSTOM_CSS_END_MARKER}\n`;
};

export const extractFontFamiliesFromFontsCss = (fontsCss: string): string[] => {
  const normalized = normalizeLineEndings(fontsCss);
  const faceBlocks = normalized.match(/@font-face\s*\{[\s\S]*?\}/gi) ?? [];
  const seen = new Set<string>();
  const families: string[] = [];
  for (const block of faceBlocks) {
    const familyMatch = block.match(/font-family\s*:\s*([^;]+);/i);
    const rawFamily = familyMatch?.[1] ? stripQuotes(familyMatch[1]) : "";
    if (!rawFamily) continue;
    if (seen.has(rawFamily)) continue;
    seen.add(rawFamily);
    families.push(rawFamily);
  }
  return families;
};

export const buildPrimaryFontStack = (fontName: string) => {
  const quotedName = quoteFontName(fontName);
  if (!quotedName) return PRIMARY_FONT_FALLBACK_STACK;
  return `${quotedName}, ${PRIMARY_FONT_FALLBACK_STACK}`;
};

export const buildSecondaryFontStack = (fontName: string) => {
  const quotedName = quoteFontName(fontName);
  if (!quotedName) return SECONDARY_FONT_FALLBACK_STACK;
  return `${quotedName}, ${SECONDARY_FONT_FALLBACK_STACK}`;
};

export const extractLeadingFontName = (fontStack: string) => {
  const [leading] = fontStack.split(",");
  return stripQuotes(leading ?? "");
};

export const formatRgbaFromHex = (hex: string, alpha: number) => {
  const parsed = parseHexColor(hex);
  if (!parsed) return `rgba(0, 0, 0, ${clamp(alpha, 0, 1)})`;
  const normalizedHex = parsed.hex.slice(1);
  const red = parseHexChannel(normalizedHex.slice(0, 2));
  const green = parseHexChannel(normalizedHex.slice(2, 4));
  const blue = parseHexChannel(normalizedHex.slice(4, 6));
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
};

export const toggleTokensImportInGlobalCss = (globalCss: string, enabled: boolean) => {
  const normalized = normalizeLineEndings(globalCss);
  if (enabled) {
    if (TOKENS_IMPORT_COMMENTED_REGEX.test(normalized)) {
      return normalized.replace(TOKENS_IMPORT_COMMENTED_REGEX, TOKENS_IMPORT_LINE);
    }
    if (TOKENS_IMPORT_REGEX.test(normalized)) {
      return normalized;
    }
    return `${TOKENS_IMPORT_LINE}\n${normalized.trimStart()}`;
  }

  if (TOKENS_IMPORT_COMMENTED_REGEX.test(normalized)) return normalized;
  if (TOKENS_IMPORT_REGEX.test(normalized)) {
    return normalized.replace(TOKENS_IMPORT_REGEX, `/* ${TOKENS_IMPORT_LINE} */`);
  }
  return `/* ${TOKENS_IMPORT_LINE} */\n${normalized.trimStart()}`;
};

export const combineTokensAndStructureCss = (tokensCss: string, structureCss: string) => {
  const normalizedTokens = normalizeLineEndings(tokensCss).trimEnd();
  const normalizedStructure = normalizeLineEndings(structureCss).trimStart();
  if (!normalizedTokens) return `${normalizedStructure}\n`;
  if (!normalizedStructure) return `${normalizedTokens}\n`;
  return `${normalizedTokens}\n\n${normalizedStructure}\n`;
};

export const extractCssVariables = (sourceCss: string) => {
  const variables: Record<string, string> = {};
  const normalized = normalizeLineEndings(sourceCss);
  const rootRange = getRootBlockRange(normalized);
  const source = rootRange?.body ?? normalized;
  const pattern = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
  for (const match of source.matchAll(pattern)) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (!key || !value) continue;
    variables[key] = value;
  }
  return variables;
};
