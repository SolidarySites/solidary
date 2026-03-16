import type { IndexFinalizationSourceManifestEntry } from "../_shared/index-finalization.ts";

const SOURCE_TREE_EXCLUSIONS = [
  ".env",
  ".env.example",
  ".env.local",
  ".env.production",
  "apps/site/dist/",
  "site/.well-known/",
  "site/config/index.json",
  "site/assets/index-image.jpg",
  "supabase/migrations/",
  "supabase/.temp/",
  ".DS_Store",
] as const;

type GitTreeBlobEntry = {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
};

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const shouldExcludeSourcePath = (path: string) =>
  SOURCE_TREE_EXCLUSIONS.some((entry) =>
    entry.endsWith("/")
      ? path === entry.slice(0, -1) || path.startsWith(entry)
      : path === entry || path.endsWith(`/${entry}`)
  );

const normalizeGitTreeFileMode = (value: unknown): "100644" | "100755" | null => {
  const normalized = toTrimmedString(value);
  return normalized === "100755" ? "100755" : normalized === "100644" ? "100644" : null;
};

export const buildSourceManifestFromTreeEntries = ({
  treeEntries,
  generatedEntries
}: {
  treeEntries: GitTreeBlobEntry[];
  generatedEntries: IndexFinalizationSourceManifestEntry[];
}): IndexFinalizationSourceManifestEntry[] => {
  const sourceEntries = treeEntries
    .filter((entry) => toTrimmedString(entry.type) === "blob")
    .map((entry) => {
      const path = toTrimmedString(entry.path);
      const mode = normalizeGitTreeFileMode(entry.mode);
      const sourceSha = toTrimmedString(entry.sha);
      if (!path || !mode || !sourceSha || shouldExcludeSourcePath(path)) {
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

  return [...sourceEntries, ...generatedEntries].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
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
