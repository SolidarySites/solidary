const formatFrontmatterValue = (value: unknown) => JSON.stringify(value);

const renderFrontmatter = (updates: Record<string, unknown>) =>
  Object.entries(updates)
    .map(([key, value]) => `${key}: ${formatFrontmatterValue(value)}`)
    .join("\n");

export const replaceFrontmatterFields = (
  content: string,
  updates: Record<string, unknown>
) => {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
  if (!match) {
    const normalizedBody = content.trim().length ? `\n${content}` : "\n";
    return `---\n${renderFrontmatter(updates)}\n---${normalizedBody}`;
  }

  const body = match[2] ?? "\n";
  const normalizedBody = body.startsWith("\n") || body.startsWith("\r\n") ? body : `\n${body}`;

  return `---\n${renderFrontmatter(updates)}\n---${normalizedBody}`;
};

export const renderMarkdownWithFrontmatter = ({
  updates,
  body
}: {
  updates: Record<string, unknown>;
  body: string;
}) => {
  const trimmedBody = body.trim();
  const normalizedBody = trimmedBody ? `\n${trimmedBody}\n` : "\n";
  return `---\n${renderFrontmatter(updates)}\n---${normalizedBody}`;
};
