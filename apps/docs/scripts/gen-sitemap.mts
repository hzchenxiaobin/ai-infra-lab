// gen-sitemap.mts —— 三分区 sitemap.xml + robots.txt 生成（backlog P3 SEO 冷启动）。
//
// URL 来源：content-kit dist/contents.json 的 url 字段（4491 条全量站内 URL，
// 与 lint 的站内链接校验同一事实源），按渲染分区拆三份 sitemap.xml 放进各分区
// dist 根（nginx 静态托管自动可访问）+ 根 robots.txt。
//
// 站点域名：sitemap 的 <loc> 要求绝对 URL——SITE_ORIGIN 环境变量传入
//（部署机 export SITE_ORIGIN=https://your.domain 后构建；缺省占位
// https://ailab.example.com，可被搜索引擎识别但请务必替换）。
//
// 运行：node --experimental-strip-types scripts/gen-sitemap.mts（build:* 后）
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENTS = path.resolve(here, "../../../packages/content-kit/dist/contents.json");
const ORIGIN = (process.env.SITE_ORIGIN || "https://ailab.example.com").replace(/\/$/, "");

type C = { url: string };
const contents = JSON.parse(await readFile(CONTENTS, "utf8")) as C[];

/** url → 所属渲染分区（与 Caddyfile/nginx 挂载一致） */
function partitionOf(url: string): "learn" | "problems-gpu" | "problems-algo" | null {
  if (url.startsWith("/learn/")) return "learn";
  if (url.startsWith("/problems/gpu/")) return "problems-gpu";
  if (url.startsWith("/problems/algo/") || url.startsWith("/problems/contest/") || url.startsWith("/problems/lists/"))
    return "problems-algo";
  return null;
}

const byPartition: Record<string, string[]> = { learn: [], "problems-gpu": [], "problems-algo": [] };
for (const c of contents) {
  const p = partitionOf(c.url);
  if (p) byPartition[p].push(c.url);
}

const today = new Date().toISOString().slice(0, 10);
const sitemapXml = (urls: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`)
  .join("\n")}
</urlset>
`;

const targets: Array<{ dir: string; urls: string[] }> = [
  { dir: path.resolve(here, "../learn/dist"), urls: byPartition.learn },
  { dir: path.resolve(here, "../problems-gpu/dist"), urls: byPartition["problems-gpu"] },
  { dir: path.resolve(here, "../problems-algo/dist"), urls: byPartition["problems-algo"] },
];

for (const t of targets) {
  // 分区 dist 可能未构建（如 algo 全量构建耗时长、单独跳过时）——只写存在的分区
  if (!existsSync(t.dir)) {
    console.log(`skip: ${t.dir} 不存在（分区未构建）`);
    continue;
  }
  await writeFile(path.join(t.dir, "sitemap.xml"), sitemapXml(t.urls));
  console.log(`sitemap: ${t.dir}/sitemap.xml（${t.urls.length} url）`);
}

// robots.txt：三分区 sitemap 索引 + API 路径禁抓（写 learn 分区根）
await writeFile(
  path.join(targets[0].dir, "robots.txt"),
  `User-agent: *
Disallow: /trpc

Sitemap: ${ORIGIN}/learn/sitemap.xml
Sitemap: ${ORIGIN}/problems/gpu/sitemap.xml
Sitemap: ${ORIGIN}/problems/sitemap.xml
`,
);
console.log(`robots: ${targets[0].dir}/robots.txt（SITE_ORIGIN=${ORIGIN}）`);
