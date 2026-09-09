// merge-dist.mts —— 合并分批构建产物 dist_0..dist_{N-1} → dist（dev/content-site.md §7）。
// 各批 assets 为内容哈希命名，直接合并不冲突；共享页与 public 只在第 0 批。
// 运行：node --experimental-strip-types scripts/merge-dist.mts algo [batchTotal]
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const partition = process.argv[2];
if (!partition || !["learn", "gpu", "algo"].includes(partition)) {
  console.error("用法：merge-dist.mts <learn|gpu|algo> [batchTotal]");
  process.exit(1);
}
const batchTotal = parseInt(process.argv[3] || "4", 10);
const partDir = path.resolve(here, `../${partition}`);

const dirs: string[] = [];
for (let i = 0; i < batchTotal; i++) {
  const d = path.join(partDir, `dist_${i}`);
  if (!existsSync(d)) {
    console.error(`缺少批次产物：${d}`);
    process.exit(1);
  }
  dirs.push(d);
}

const out = path.join(partDir, `dist`);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// 第 0 批为基底（含共享页/public），后续批次覆盖合并
for (const d of dirs) {
  for (const e of await readdir(d)) {
    await cp(path.join(d, e), path.join(out, e), { recursive: true, force: true });
  }
}
const count = (await readdir(out, { recursive: true })).length;
console.log(`== merge-dist ${partition} ==\n${dirs.length} 批 → dist（${count} 个条目）`);
