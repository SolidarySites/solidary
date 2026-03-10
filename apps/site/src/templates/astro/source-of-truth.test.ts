import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("template source of truth", () => {
  it("removes the old root template directory", () => {
    expect(existsSync(path.join(workspaceRoot, "templates", "astro-baseline"))).toBe(false);
  });

  it("does not reference the deleted root template path in code or config", () => {
    const deletedRootTemplatePath = `templates/${"astro-baseline"}`;
    const result = spawnSync(
      "rg",
      [
        "-n",
        `(^|["'\\s])${deletedRootTemplatePath}([/\\*"'])`,
        "apps/site/src",
        "scripts",
        "supabase",
        "netlify.toml",
        "package.json"
      ],
      {
        cwd: workspaceRoot,
        encoding: "utf8"
      }
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

    expect(result.status === 0 || result.status === 1).toBe(true);
    expect(output).toBe("");
  });

  it("keeps the runtime ts adapters synced with the canonical scaffold files", () => {
    const runtimePairs = [
      ["src/content.config.ts", "apps/site/src/templates/astro/runtime/content-config.ts.txt"],
      ["src/solidary-config/site.ts", "apps/site/src/templates/astro/runtime/solidary-config-site.ts.txt"],
      [
        "src/solidary-config/solidary.ts",
        "apps/site/src/templates/astro/runtime/solidary-config-solidary.ts.txt"
      ]
    ] as const;

    runtimePairs.forEach(([scaffoldPath, adapterPath]) => {
      const scaffold = readFileSync(
        path.join(workspaceRoot, "apps/site/src/templates/astro-baseline", scaffoldPath),
        "utf8"
      );
      const adapter = readFileSync(path.join(workspaceRoot, adapterPath), "utf8");
      expect(adapter).toBe(scaffold);
    });
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
});
