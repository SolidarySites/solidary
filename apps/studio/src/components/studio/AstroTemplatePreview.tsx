import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties
} from "react";
import { slugify } from "../../studio/utils";

type PreviewPage = {
  id?: string;
  title: string;
  slug: string;
  body: string;
  showInNav?: boolean;
  isHome?: boolean;
};

type PreviewAuthor = {
  name: string;
  email: string;
  url: string;
  github: string;
  x: string;
  linkedin: string;
};

type AstroTemplatePreviewProps = {
  previewBrand: string;
  pages: PreviewPage[];
  author: PreviewAuthor;
  tokensCss: string;
  homeFallbackBody: string;
  activePageSlug: string;
  onActivePageChange: (slug: string) => void;
  onPageBodyChange: (slug: string, body: string) => void;
};

export type AstroTemplatePreviewHandle = {
  execCommand: (command: string, value?: string) => void;
  focusEditor: () => void;
};

type ParsedPage = PreviewPage & {
  safeSlug: string;
};

const extractCssVariables = (tokensCss: string) => {
  const variables: Record<string, string> = {};
  const rootMatch = tokensCss.match(/:root\s*{([\s\S]*?)}/);
  const source = rootMatch?.[1] ?? tokensCss;

  const variablePattern = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
  for (const match of source.matchAll(variablePattern)) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (!key || !value) continue;
    variables[key] = value;
  }

  return variables;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const formatInlineMarkdown = (value: string) =>
  escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;

const markdownToHtml = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (htmlTagPattern.test(trimmed)) return trimmed;

  const lines = trimmed.replace(/\r/g, "").split("\n");
  const chunks: string[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    chunks.push(`<p>${paragraphBuffer.map(formatInlineMarkdown).join("<br />")}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) return;
    chunks.push(
      `<ul>${listBuffer.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("")}</ul>`
    );
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (codeBuffer) {
      if (line.startsWith("```")) {
        chunks.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = null;
      } else {
        codeBuffer.push(rawLine);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      codeBuffer = [];
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 3);
      const tag = `h${level}`;
      chunks.push(`<${tag}>${formatInlineMarkdown(heading[2].trim())}</${tag}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      listBuffer.push(listItem[1].trim());
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (listBuffer.length) flushList();
    paragraphBuffer.push(line.trim());
  }

  if (codeBuffer) {
    chunks.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  flushList();

  return chunks.join("\n");
};

const AstroTemplatePreview = forwardRef<AstroTemplatePreviewHandle, AstroTemplatePreviewProps>(
  function AstroTemplatePreview(
    {
      previewBrand,
      pages,
      author,
      tokensCss,
      homeFallbackBody,
      activePageSlug,
      onActivePageChange,
      onPageBodyChange
    },
    ref
  ) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  const parsedPages = useMemo<ParsedPage[]>(
    () =>
      pages.map((page, index) => {
        const safeSlug = page.isHome ? "home" : slugify(page.slug || page.title) || `page-${index + 1}`;
        return {
          ...page,
          safeSlug
        };
      }),
    [pages]
  );

  const homePage = useMemo<ParsedPage>(
    () =>
      parsedPages.find((page) => page.isHome || page.safeSlug === "home") ?? {
        title: "Home",
        slug: "home",
        body: homeFallbackBody,
        showInNav: false,
        isHome: true,
        safeSlug: "home"
      },
    [homeFallbackBody, parsedPages]
  );

  const navItems = useMemo(() => {
    const combined = parsedPages
      .filter((page) => page.showInNav !== false)
      .map((page) => ({
        label: page.title.trim() || "Untitled page",
        slug: page.safeSlug,
        href: page.safeSlug === homePage.safeSlug ? "/" : `/${page.safeSlug}`
      }));

    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });
  }, [homePage.safeSlug, parsedPages]);

  const allPageSlugs = useMemo(
    () => new Set([homePage.safeSlug, ...parsedPages.map((page) => page.safeSlug)]),
    [homePage.safeSlug, parsedPages]
  );

  const activeSlug = allPageSlugs.has(activePageSlug) ? activePageSlug : homePage.safeSlug;

  const activePage = useMemo(
    () => parsedPages.find((page) => page.safeSlug === activeSlug) ?? homePage,
    [activeSlug, homePage, parsedPages]
  );

  const activeBodyRaw =
    activePage.safeSlug === homePage.safeSlug
      ? (activePage.body || "").trim() || homeFallbackBody
      : (activePage.body || "").trim();
  const activeBodyHtml = useMemo(() => markdownToHtml(activeBodyRaw), [activeBodyRaw]);

  const socialLinks = [
    { label: "GitHub", href: author.github.trim() },
    { label: "X", href: author.x.trim() },
    { label: "LinkedIn", href: author.linkedin.trim() }
  ].filter((item) => Boolean(item.href));

  const previewStyle = useMemo(
    () => extractCssVariables(tokensCss) as CSSProperties,
    [tokensCss]
  );

  const currentYear = new Date().getFullYear();
  const authorName = author.name.trim() || "Site author";
  const authorUrl = author.url.trim();
  const authorEmail = author.email.trim();

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== activeBodyHtml) {
      editor.innerHTML = activeBodyHtml;
    }
  }, [activeBodyHtml, activeSlug]);

  const executeCommand = useCallback(
    (command: string, value?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      if (command === "clearAllFormatting") {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          return;
        }

        const range = selection.getRangeAt(0);
        const commonAncestor =
          range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? (range.commonAncestorContainer as Element)
            : range.commonAncestorContainer.parentElement;

        if (!commonAncestor || !editor.contains(commonAncestor)) {
          return;
        }

        editor.focus();
        document.execCommand("removeFormat", false);
        document.execCommand("unlink", false);
        document.execCommand("formatBlock", false, "p");
        document.execCommand("justifyLeft", false);
        onPageBodyChange(activeSlug, editor.innerHTML);
        return;
      }
      editor.focus();
      document.execCommand(command, false, value);
      onPageBodyChange(activeSlug, editor.innerHTML);
    },
    [activeSlug, onPageBodyChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      execCommand: executeCommand,
      focusEditor: () => editorRef.current?.focus()
    }),
    [executeCommand]
  );

  const handleEditorInput = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onPageBodyChange(activeSlug, editor.innerHTML);
  };

  return (
    <div className="astro-preview-shell">
      <div className="astro-preview" style={previewStyle}>
        <a
          className="skip-link"
          href="#astro-preview-main"
          onClick={(event) => event.preventDefault()}
        >
          Skip to content
        </a>

        <header className="header">
          <div className="header__inner">
            <a
              className="header__brand"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                onActivePageChange(homePage.safeSlug);
              }}
            >
              {previewBrand.trim() || "New Astro Site"}
            </a>

            <nav className="header__nav" aria-label="Primary">
              <ul className="nav">
                {navItems.map((item) => (
                  <li className="nav__item" key={item.href}>
                    <a
                      className={`nav__link ${activeSlug === item.slug ? "is-active" : ""}`}
                      href={item.href}
                      onClick={(event) => {
                        event.preventDefault();
                        onActivePageChange(item.slug);
                      }}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <main id="astro-preview-main" className="page__main">
          <article className="prose">
            <div
              ref={editorRef}
              className="astro-editor"
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
            />
          </article>
        </main>

        <footer className="footer">
          <div className="footer__inner">
            <p className="footer__meta">
              {authorUrl ? (
                <a href={authorUrl} target="_blank" rel="noopener noreferrer">
                  © {currentYear} {authorName}
                </a>
              ) : (
                `© ${currentYear} ${authorName}`
              )}
            </p>

            <div className="footer__links">
              {authorEmail && <a className="footer__link" href={`mailto:${authorEmail}`}>Email</a>}
              {socialLinks.map((link) => (
                <a
                  key={link.label}
                  className="footer__link"
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
  }
);

export default AstroTemplatePreview;
