import { parseIndexFinalizationPayload } from "./index-finalization.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected, null, 2)}, received ${JSON.stringify(actual, null, 2)}`,
    );
  }
};

Deno.test("parseIndexFinalizationPayload normalizes persisted job payload state", () => {
  const payload = parseIndexFinalizationPayload({
    phase: "materialize_blobs",
    source_branch: "main",
    source_manifest: [
      {
        kind: "source",
        path: "apps/site/src/App/App.tsx",
        mode: "100644",
        sourceSha: "sha-app"
      }
    ],
    cursor: 40,
    final_tree_entries: [
      {
        path: "apps/site/src/App/App.tsx",
        mode: "100644",
        sha: "sha-final"
      }
    ],
    total_files: 449,
    processed_files: 40,
    source_repo_resolution: "child_lineage",
    target_repo_full_name: "owner/repo",
    child_project_ref: "child-ref"
  });

  assertEquals(payload, {
    phase: "materialize_blobs",
    sourceBranch: "main",
    sourceManifest: [
      {
        kind: "source",
        path: "apps/site/src/App/App.tsx",
        mode: "100644",
        sourceSha: "sha-app"
      }
    ],
    cursor: 40,
    finalTreeEntries: [
      {
        path: "apps/site/src/App/App.tsx",
        mode: "100644",
        sha: "sha-final"
      }
    ],
    totalFiles: 449,
    processedFiles: 40,
    sourceRepoResolution: "child_lineage",
    targetRepoFullName: "owner/repo",
    childProjectRef: "child-ref"
  });
});
