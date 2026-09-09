#!/usr/bin/env node
// 零依赖 tsx 启动器：在 workspace 的 pnpm store 中定位 tsx（tsx 已是
// apps/cli、apps/server 的依赖，本包不新增任何 npm 依赖、不动 pnpm-lock.yaml）。
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const storeDir = path.resolve(here, "../../../node_modules/.pnpm");
const entry = readdirSync(storeDir).find((d) => /^tsx@\d/.test(d));
if (!entry) {
  console.error("error: tsx not found in workspace pnpm store (expected tsx@*)");
  process.exit(1);
}
const cli = path.join(storeDir, entry, "node_modules", "tsx", "dist", "cli.mjs");
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
