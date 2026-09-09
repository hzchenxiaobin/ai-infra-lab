// util.ts —— 共享小工具：遍历、哈希、slug 化、路径换算。
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTENT_ROOT = path.resolve(KIT_ROOT, "../content");
export const DIST_DIR = path.join(KIT_ROOT, "dist");

/** 递归收集 dir 下全部 .md 文件（相对 content 根的路径，posix 风格） */
export function walkMd(dir: string, base = dir, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p, base, out);
    else if (e.name.endsWith(".md")) out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * slug 化：小写、空白/下划线转 -、剔除非常用符号（保留 CJK 与数字）、折叠连字符。
 * 用于从目录名/文件名/标题推导 ID 片段与 URL 片段。
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/['’`"]/g, "")
    .replace(/[^\p{L}\p{N}.-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** 文件 mtime → YYYY-MM-DD（本地时区） */
export function mtimeDate(abs: string): string {
  const d = fs.statSync(abs).mtime;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 驼峰目录名（cudaGraph → cuda-graph）先插横线再 slugify */
export function slugifyCamel(s: string): string {
  return slugify(s.replace(/([a-z0-9])([A-Z])/g, "$1-$2"));
}

/** 计算从 fromDir（相对 content 根的目录）到 toRel（相对 content 根的文件）的相对链接 */
export function relLink(fromDir: string, toRel: string): string {
  let r = path.posix.relative(fromDir, toRel);
  if (!r.startsWith(".")) r = "./" + r;
  return r;
}

export function dirnamePosix(rel: string): string {
  const d = path.posix.dirname(rel);
  return d === "." ? "" : d;
}
