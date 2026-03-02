const PREVIEW_SCOPE_SELECTOR = ".astro-preview";

const prefixSelector = (selector: string, scope: string) => {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith(scope)) return trimmed;
  if (trimmed === ":root" || trimmed === "html" || trimmed === "body") return scope;

  if (trimmed.startsWith(":root")) {
    return trimmed.replace(/^:root\b/, scope);
  }

  if (trimmed.startsWith("html")) {
    return trimmed.replace(/^html\b/, scope);
  }

  if (trimmed.startsWith("body")) {
    return trimmed.replace(/^body\b/, scope);
  }

  return `${scope} ${trimmed}`;
};

const scopeRule = (rule: CSSRule, scope: string): string => {
  if (typeof CSSStyleRule !== "undefined" && rule instanceof CSSStyleRule) {
    const scopedSelector = rule.selectorText
      .split(",")
      .map((selector) => prefixSelector(selector, scope))
      .join(", ");
    return `${scopedSelector} { ${rule.style.cssText} }`;
  }

  if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule) {
    const nested = Array.from(rule.cssRules).map((nestedRule) => scopeRule(nestedRule, scope)).join("\n");
    return `@media ${rule.conditionText} {\n${nested}\n}`;
  }

  if (typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule) {
    const nested = Array.from(rule.cssRules).map((nestedRule) => scopeRule(nestedRule, scope)).join("\n");
    return `@supports ${rule.conditionText} {\n${nested}\n}`;
  }

  if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) {
    const nested = Array.from(rule.cssRules).map((nestedRule) => scopeRule(nestedRule, scope)).join("\n");
    return `@container ${rule.conditionText} {\n${nested}\n}`;
  }

  return rule.cssText;
};

const parseCssRules = (css: string): CSSRule[] => {
  // Prefer DOM stylesheet parsing because it is more fault-tolerant than replaceSync
  // when users provide partial/invalid custom CSS.
  if (typeof document !== "undefined") {
    const styleTag = document.createElement("style");
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
    const sheetRules = Array.from(styleTag.sheet?.cssRules ?? []);
    styleTag.remove();
    return sheetRules;
  }

  if (typeof CSSStyleSheet === "undefined") return [];

  try {
    const constructableSheet = new CSSStyleSheet();
    if ("replaceSync" in constructableSheet) {
      (constructableSheet as CSSStyleSheet & { replaceSync: (content: string) => void }).replaceSync(css);
      return Array.from(constructableSheet.cssRules);
    }
  } catch {
    // Ignore parsing failures and fall back to no scoped rules.
  }

  return [];
};

export const scopePreviewCss = (css: string, scope = PREVIEW_SCOPE_SELECTOR) => {
  const normalized = css.trim();
  if (!normalized) return "";

  try {
    const rules = parseCssRules(normalized);
    // Never return unscoped CSS, otherwise rules can leak into the builder UI.
    if (!rules.length) return "";
    return rules.map((rule) => scopeRule(rule, scope)).join("\n");
  } catch {
    return "";
  }
};
