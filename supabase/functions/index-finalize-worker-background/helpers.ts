import type { IndexFinalizationSourceManifestEntry } from "../_shared/index-finalization.ts";

export const SOURCE_PUBLISH_IGNORE_PATH =
  "apps/site/src/templates/index/default_template/publish-ignore.txt";
const UNSUPPORTED_WILDCARD_PATTERN = /[*?[\]{}!]/;

export type SourceTreeEntry = {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
};

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeRepoRelativePath = (value: string) => {
  let normalized = value.trim().replace(/\\/g, "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  normalized = normalized.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return normalized;
};

const validateRepoRelativeRule = (value: string, lineNumber: number) => {
  if (!value) {
    throw new Error(
      `Invalid empty ignore rule on line ${lineNumber} in ${SOURCE_PUBLISH_IGNORE_PATH}.`,
    );
  }
  if (value.startsWith("/")) {
    throw new Error(
      `Ignore rule on line ${lineNumber} in ${SOURCE_PUBLISH_IGNORE_PATH} must be repo-relative.`,
    );
  }
  if (value === "." || value === ".." || value.startsWith("../") || value.includes("/../")) {
    throw new Error(
      `Ignore rule on line ${lineNumber} in ${SOURCE_PUBLISH_IGNORE_PATH} must stay within the repo root.`,
    );
  }
  if (UNSUPPORTED_WILDCARD_PATTERN.test(value)) {
    throw new Error(
      `Ignore rule on line ${lineNumber} in ${SOURCE_PUBLISH_IGNORE_PATH} uses unsupported wildcard syntax: ${value}`,
    );
  }
};

export const parseSourcePublishIgnoreFile = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return null;
      }

      const normalized = normalizeRepoRelativePath(trimmed);
      validateRepoRelativeRule(normalized, index + 1);
      return normalized;
    })
    .filter((entry): entry is string => Boolean(entry));

export const shouldExcludeSourcePath = ({
  path,
  exclusionRules,
}: {
  path: string;
  exclusionRules: string[];
}) => {
  const normalizedPath = normalizeRepoRelativePath(path);
  return exclusionRules.some((rule) =>
    normalizedPath === rule || normalizedPath.startsWith(`${rule}/`)
  );
};

export const findSourceTreeBlobEntryByPath = ({
  treeEntries,
  path,
}: {
  treeEntries: SourceTreeEntry[];
  path: string;
}) =>
  treeEntries.find((entry) =>
    toTrimmedString(entry.type) === "blob" &&
    normalizeRepoRelativePath(toTrimmedString(entry.path)) === path
  ) ?? null;

const normalizeGitTreeFileMode = (value: unknown): "100644" | "100755" | null => {
  const normalized = toTrimmedString(value);
  return normalized === "100755" ? "100755" : normalized === "100644" ? "100644" : null;
};

export const buildSourceManifestFromTreeEntries = ({
  treeEntries,
  exclusionRules,
  generatedEntries
}: {
  treeEntries: SourceTreeEntry[];
  exclusionRules: string[];
  generatedEntries: IndexFinalizationSourceManifestEntry[];
}): IndexFinalizationSourceManifestEntry[] => {
  const sourceEntries = treeEntries
    .filter((entry) => toTrimmedString(entry.type) === "blob")
    .map((entry) => {
      const path = normalizeRepoRelativePath(toTrimmedString(entry.path));
      const mode = normalizeGitTreeFileMode(entry.mode);
      const sourceSha = toTrimmedString(entry.sha);
      if (
        !path ||
        !mode ||
        !sourceSha ||
        shouldExcludeSourcePath({ path, exclusionRules })
      ) {
        return null;
      }

      return {
        kind: "source" as const,
        path,
        mode,
        sourceSha
      };
    })
    .filter((entry): entry is Extract<IndexFinalizationSourceManifestEntry, { kind: "source" }> =>
      Boolean(entry)
    );

  const manifestByPath = new Map<string, IndexFinalizationSourceManifestEntry>();
  sourceEntries.forEach((entry) => {
    manifestByPath.set(entry.path, entry);
  });
  generatedEntries.forEach((entry) => {
    manifestByPath.set(normalizeRepoRelativePath(entry.path), {
      ...entry,
      path: normalizeRepoRelativePath(entry.path),
    });
  });

  return [...manifestByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
};

export const buildFinalizationStepLabel = ({
  phase,
  processedFiles,
  totalFiles
}: {
  phase: "prepare_manifest" | "materialize_blobs" | "commit_finalize";
  processedFiles?: number;
  totalFiles?: number;
}) => {
  const current = typeof processedFiles === "number" && Number.isFinite(processedFiles)
    ? Math.max(0, Math.floor(processedFiles))
    : 0;
  const total = typeof totalFiles === "number" && Number.isFinite(totalFiles)
    ? Math.max(0, Math.floor(totalFiles))
    : 0;

  if (phase === "prepare_manifest") {
    return "Preparing parent repository manifest...";
  }
  if (phase === "commit_finalize") {
    return "Finishing child setup...";
  }
  if (total > 0) {
    return `Writing finalized repository files (${current}/${total})...`;
  }
  return "Writing finalized repository files...";
};
