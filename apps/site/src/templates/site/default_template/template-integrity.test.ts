import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");

describe("default site template integrity", () => {
  const scaffoldRoot = path.join(
    workspaceRoot,
    "apps/site/src/templates/site/default_template/scaffold"
  );
  const deployWorkflowPath = path.join(scaffoldRoot, ".github/workflows/deploy.yml");

  it("uses the expected scaffold package name", () => {
    const scaffoldPackage = JSON.parse(
      readFileSync(
        path.join(scaffoldRoot, "package.json"),
        "utf8"
      )
    ) as { name?: string };

    expect(scaffoldPackage.name).toBe("solidary-site-default");
  });

  it("keeps the runtime ts adapters synced with the canonical scaffold files", () => {
    const runtimePairs = [
      [
        "src/content.config.ts",
        "apps/site/src/templates/site/default_template/runtime/content-config.ts.txt"
      ],
      [
        "src/solidary-config/site.ts",
        "apps/site/src/templates/site/default_template/runtime/solidary-config-site.ts.txt"
      ],
      [
        "src/solidary-config/solidary.ts",
        "apps/site/src/templates/site/default_template/runtime/solidary-config-solidary.ts.txt"
      ]
    ] as const;

    runtimePairs.forEach(([scaffoldPath, adapterPath]) => {
      const scaffold = readFileSync(path.join(scaffoldRoot, scaffoldPath), "utf8");
      const adapter = readFileSync(path.join(workspaceRoot, adapterPath), "utf8");
      expect(adapter).toBe(scaffold);
    });
  });

  it("pins the deploy workflow to the expected GitHub Actions versions", () => {
    const deployWorkflow = readFileSync(deployWorkflowPath, "utf8");

    expect(deployWorkflow).toContain("uses: actions/checkout@v5");
    expect(deployWorkflow).toContain("uses: actions/setup-node@v6");
    expect(deployWorkflow).toContain('node-version: "24"');
    expect(deployWorkflow).toContain("uses: actions/cache@v5");
    expect(deployWorkflow).toContain("uses: actions/upload-pages-artifact@v4");
    expect(deployWorkflow).toContain("uses: actions/deploy-pages@v4");
  });

  it("keeps the generated Supabase template bundle wired to the canonical solidary files", () => {
    const bundledTemplateFile = readFileSync(
      path.join(
        workspaceRoot,
        "supabase/functions/github-create-repo-worker-background/template-files.ts"
      ),
      "utf8"
    );

    expect(bundledTemplateFile).toContain('relPath: "public/.well-known/solidary.json"');
    expect(bundledTemplateFile).toContain('relPath: "public/.well-known/solidary-links.json"');
  });

  it("keeps the bundled deploy workflow synced with the scaffold source", () => {
    const deployWorkflow = readFileSync(deployWorkflowPath, "utf8");
    const bundledTemplateFile = readFileSync(
      path.join(
        workspaceRoot,
        "supabase/functions/github-create-repo-worker-background/template-files.ts"
      ),
      "utf8"
    );

    expect(bundledTemplateFile).toContain('relPath: ".github/workflows/deploy.yml"');
    expect(bundledTemplateFile).toContain(
      `contentB64: ${JSON.stringify(Buffer.from(deployWorkflow, "utf8").toString("base64"))}`
    );
  });
});
