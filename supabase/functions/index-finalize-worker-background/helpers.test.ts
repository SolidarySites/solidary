import { buildFinalizationStepLabel, buildSourceManifestFromTreeEntries } from "./helpers.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected, null, 2)}, received ${JSON.stringify(actual, null, 2)}`,
    );
  }
};

Deno.test("buildSourceManifestFromTreeEntries filters excluded paths and appends generated files", () => {
  const manifest = buildSourceManifestFromTreeEntries({
    treeEntries: [
      { path: "apps/site/src/App/App.tsx", mode: "100644", type: "blob", sha: "sha-app" },
      { path: "apps/site/dist/index.js", mode: "100644", type: "blob", sha: "sha-dist" },
      { path: "scripts/run.sh", mode: "100755", type: "blob", sha: "sha-script" },
      { path: "docs", mode: "040000", type: "tree", sha: "sha-dir" }
    ],
    generatedEntries: [
      {
        kind: "generated",
        path: ".env.production",
        mode: "100644",
        contentB64: "ZW52Cg=="
      }
    ]
  });

  assertEquals(manifest, [
    {
      kind: "generated",
      path: ".env.production",
      mode: "100644",
      contentB64: "ZW52Cg=="
    },
    {
      kind: "source",
      path: "apps/site/src/App/App.tsx",
      mode: "100644",
      sourceSha: "sha-app"
    },
    {
      kind: "source",
      path: "scripts/run.sh",
      mode: "100755",
      sourceSha: "sha-script"
    }
  ]);
});

Deno.test("buildFinalizationStepLabel reports progress by phase", () => {
  assertEquals(
    buildFinalizationStepLabel({
      phase: "prepare_manifest"
    }),
    "Preparing parent repository manifest..."
  );
  assertEquals(
    buildFinalizationStepLabel({
      phase: "materialize_blobs",
      processedFiles: 20,
      totalFiles: 449
    }),
    "Writing finalized repository files (20/449)..."
  );
  assertEquals(
    buildFinalizationStepLabel({
      phase: "commit_finalize",
      processedFiles: 449,
      totalFiles: 449
    }),
    "Finishing child setup..."
  );
});
