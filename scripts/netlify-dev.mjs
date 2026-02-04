#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const cwd = process.cwd();
const viteBin = resolve(cwd, "apps/studio/node_modules/vite/bin/vite.js");

const child = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "5173"], {
  stdio: "inherit",
  cwd: resolve(cwd, "apps/studio")
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
