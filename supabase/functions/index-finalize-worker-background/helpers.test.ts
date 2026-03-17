import {
  buildFinalizationStepLabel,
  buildSourceManifestFromTreeEntries,
  parseSourcePublishIgnoreFile,
} from "./helpers.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected, null, 2)}, received ${JSON.stringify(actual, null, 2)}`,
    );
  }
};

const assertThrows = (action: () => void, expectedMessage: string) => {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message === expectedMessage) {
      return;
    }
    throw new Error(
      `Expected error ${JSON.stringify(expectedMessage)}, received ${
        error instanceof Error ? JSON.stringify(error.message) : JSON.stringify(error)
      }`,
    );
  }

  throw new Error(`Expected error ${JSON.stringify(expectedMessage)}, but no error was thrown.`);
};

Deno.test("parseSourcePublishIgnoreFile ignores comments, normalizes paths, and rejects wildcard syntax", () => {
  assertEquals(
    parseSourcePublishIgnoreFile(
      [
        "# comment",
        "",
        "./apps/site/dist/",
        "site/config/index.json",
        "supabase/migrations",
      ].join("\n"),
    ),
    [
      "apps/site/dist",
      "site/config/index.json",
      "supabase/migrations",
    ],
  );

  assertThrows(
    () => parseSourcePublishIgnoreFile("apps/site/*"),
    'Ignore rule on line 1 in apps/site/src/templates/index/default_template/publish-ignore.txt uses unsupported wildcard syntax: apps/site/*',
  );
});

Deno.test("buildSourceManifestFromTreeEntries filters excluded paths and lets generated entries win by path", () => {
  const manifest = buildSourceManifestFromTreeEntries({
    treeEntries: [
      { path: "apps/site/src/App/App.tsx", mode: "100644", type: "blob", sha: "sha-app" },
      { path: "apps/site/dist/index.js", mode: "100644", type: "blob", sha: "sha-dist" },
      {
        path: "apps/site/src/templates/index/default_template/publish-ignore.txt",
        mode: "100644",
        type: "blob",
        sha: "sha-ignore",
      },
      {
        path: ".github/workflows/deploy.yml",
        mode: "100644",
        type: "blob",
        sha: "sha-source-workflow",
      },
      { path: "scripts/run.sh", mode: "100755", type: "blob", sha: "sha-script" },
      { path: "docs", mode: "040000", type: "tree", sha: "sha-dir" }
    ],
    exclusionRules: ["apps/site/dist"],
    generatedEntries: [
      {
        kind: "generated",
        path: ".github/workflows/deploy.yml",
        mode: "100644",
        contentB64: "Z2VuZXJhdGVkCg=="
      }
    ]
  });

  assertEquals(manifest, [
    {
      kind: "generated",
      path: ".github/workflows/deploy.yml",
      mode: "100644",
      contentB64: "Z2VuZXJhdGVkCg=="
    },
    {
      kind: "source",
      path: "apps/site/src/App/App.tsx",
      mode: "100644",
      sourceSha: "sha-app"
    },
    {
      kind: "source",
      path: "apps/site/src/templates/index/default_template/publish-ignore.txt",
      mode: "100644",
      sourceSha: "sha-ignore"
    },
    {
      kind: "source",
      path: "scripts/run.sh",
      mode: "100755",
      sourceSha: "sha-script"
    }
  ]);
});

Deno.test("buildSourceManifestFromTreeEntries excludes the ignore file when it is explicitly listed", () => {
  const manifest = buildSourceManifestFromTreeEntries({
    treeEntries: [
      {
        path: "apps/site/src/templates/index/default_template/publish-ignore.txt",
        mode: "100644",
        type: "blob",
        sha: "sha-ignore",
      },
      { path: "apps/site/src/App/App.tsx", mode: "100644", type: "blob", sha: "sha-app" },
    ],
    exclusionRules: ["apps/site/src/templates/index/default_template/publish-ignore.txt"],
    generatedEntries: [],
  });

  assertEquals(manifest, [
    {
      kind: "source",
      path: "apps/site/src/App/App.tsx",
      mode: "100644",
      sourceSha: "sha-app",
    },
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
