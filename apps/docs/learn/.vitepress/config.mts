// learn 分区配置（dev/content-site.md）。
// - base /learn/：与 contents.url（/learn/...）对齐，web/docs 内不手拼路径
// - 无左侧边栏（2026-09 起移除，正文加宽）；周内 day 顺序仍从 src 目录扫描，供 prev/next 用
// - markdown 转义规则整套拷自 leetcode config.mts（content-site.md §4，少一条都会有页面编译失败）
// - 顶栏搜索已移除（2026-09）：docs 内搜索统一走主站 /search，顶栏改放主站入口（theme/NavActions.vue）
import { defineConfig } from "vitepress";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import katex from "@traptitech/markdown-it-katex";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(root, "../src");

/** 读 md 的 frontmatter title */
function fmTitle(abs: string): string | null {
  const m = fs.readFileSync(abs, "utf8").match(/^title:\s*"?([^"\n]+)"?/m);
  return m?.[1] ?? null;
}

/** weekN/dayM/index.md → 周内页面顺序（prev/next 用；无 index.md 的目录跳过） */
function sidebarForWeeks() {
  if (!fs.existsSync(src)) return [];
  const weeks = fs
    .readdirSync(src, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^week\d+$/.test(e.name))
    .sort((a, b) => parseInt(a.name.slice(4)) - parseInt(b.name.slice(4)));
  return weeks.map((w) => {
    const weekDir = path.join(src, w.name);
    const weekTitle = fmTitle(path.join(weekDir, "index.md")) ?? w.name;
    const days = fs
      .readdirSync(weekDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^day\d+$/.test(e.name))
      .sort((a, b) => parseInt(a.name.slice(3)) - parseInt(b.name.slice(3)))
      .map((d) => {
        const abs = path.join(weekDir, d.name, "index.md");
        return {
          text: fmTitle(abs) ?? d.name,
          link: `/${w.name}/${d.name}/`,
        };
      });
    return { text: weekTitle, collapsed: true, items: [{ text: "本周概览", link: `/${w.name}/` }, ...days] };
  });
}

// 上一页/下一页：daily 全局顺序（本周概览 → day1..day7 → 下一周概览）
const dailyOrder: Array<{ text: string; link: string }> = [];
for (const week of sidebarForWeeks()) {
  for (const item of week.items) dailyOrder.push(item);
}
/** 导航链接 → 对应 relativePath（"/week1/day1/" → "week1/day1/index.md"） */
const linkToRel = (link: string) => link.slice(1) + (link.endsWith("/") ? "index.md" : ".md");

/**
 * topics/{slug}/ 下的直接 md 文档清单（TopicNav 组件「顶栏专题导航」用）：
 * index.md 作「专题概览」置顶，dayN 按数字序，其余按文件名字典序；仅 1 篇的专题不收录。
 * 标题取 frontmatter title，无则取首个 H1（topics 文档普遍无 frontmatter）；
 * short 为顶栏紧凑标签（概览 / Day N / 文件名），完整标题放 tooltip。
 */
function topicDocs(): Record<string, Array<{ text: string; short: string; link: string }>> {
  const dir = path.join(src, "topics");
  const result: Record<string, Array<{ text: string; short: string; link: string }>> = {};
  if (!fs.existsSync(dir)) return result;
  const pageTitle = (abs: string, fallback: string): string => {
    const md = fs.readFileSync(abs, "utf8");
    return fmTitle(abs) ?? md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;
  };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const topicDir = path.join(dir, e.name);
    const docs = fs
      .readdirSync(topicDir)
      .filter((f) => f.endsWith(".md") && f !== "INDEX.md")
      .sort((a, b) => {
        const rank = (f: string) => (f === "index.md" ? -1 : /^day(\d+)\.md$/.test(f) ? Number(f.match(/\d+/)![0]) : 1000);
        return rank(a) - rank(b) || a.localeCompare(b);
      })
      .map((f) => {
        const stem = f.replace(/\.md$/, "");
        const day = /^day(\d+)$/.exec(stem);
        return {
          text: f === "index.md" ? "专题概览" : pageTitle(path.join(topicDir, f), stem),
          short: f === "index.md" ? "概览" : day ? `Day ${day[1]}` : stem,
          link: f === "index.md" ? `/topics/${e.name}/` : `/topics/${e.name}/${stem}.html`,
        };
      });
    if (docs.length > 1) result[e.name] = docs;
  }
  return result;
}

export default defineConfig({
  title: "AI Infra Lab",
  description: "AI Infra Lab · 10 周主线 · 专题 · 论文精读 · Profiling 实战",
  lang: "zh-CN",
  base: "/learn/",
  srcDir: "src",
  // INDEX.md 为题解/面经手工索引页，URL 与 README 转成的 index.md 冲突（leetcode 原配置同款排除）
  srcExclude: ["**/SKILL.md", "**/INDEX.md"],
  outDir: "./dist",
  ignoreDeadLinks: true, // 正文里有指向仓库内非页面文件（.cu/.py 等）的相对链接
  lastUpdated: false,
  appearance: "dark", // 默认暗色（对齐主站），用户仍可切换
  buildConcurrency: 8,

  head: [
    [
      "link",
      {
        rel: "icon",
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>📚</text></svg>",
      },
    ],
  ],

  markdown: {
    config: (md) => {
      // ↓↓↓ 以下转义规则整套拷自 leetcode config.mts（content-site.md §4） ↓↓↓
      md.use(katex, { output: "html", strict: "ignore" });
      for (const name of ["math_inline", "math_block"]) {
        const orig = md.renderer.rules[name];
        if (orig) {
          md.renderer.rules[name] = (...args) =>
            orig(...args).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
        }
      }
      md.core.ruler.disable("curly_attributes", true);
      md.core.ruler.disable("attrs", true);
      // 正文里裸露的模板记号（如 test_<module>.py、c≈<X>）会被 Vue 当成未闭合
      // HTML 标签导致编译失败：不在白名单内的 html_inline 一律降级为纯文本转义
      // （details/summary 折叠块等真实 HTML 不受影响）
      const KNOWN_TAGS = new Set([
        "details", "summary", "br", "hr", "b", "i", "em", "strong", "kbd", "sup", "sub",
        "u", "s", "mark", "img", "a", "div", "span", "p", "center", "small", "font",
        "table", "thead", "tbody", "tr", "th", "td", "ul", "ol", "li", "dl", "dt", "dd",
        "blockquote", "video", "source", "audio", "figure", "figcaption",
      ]);
      md.core.ruler.after("inline", "escape-unknown-html", (state) => {
        for (const tok of state.tokens) {
          if (tok.type !== "inline" || !tok.children) continue;
          for (const child of tok.children) {
            if (child.type !== "html_inline") continue;
            const m = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(child.content);
            if (m && !KNOWN_TAGS.has(m[1].toLowerCase())) {
              child.type = "text";
              child.tag = "";
              child.content = child.content.replace(/&/g, "&amp;");
            }
          }
        }
      });
      md.core.ruler.after("inline", "escape-mustache", (state) => {
        for (const tok of state.tokens) {
          if (tok.type !== "inline" || !tok.children) continue;
          const children: typeof tok.children = [];
          for (const child of tok.children) {
            if (child.type === "code_inline") {
              if (child.content.includes("{{")) child.attrPush(["v-pre", ""]);
              children.push(child);
            } else if (child.type === "text" && child.content.includes("{{")) {
              child.content.split("{{").forEach((part, i) => {
                if (i > 0) {
                  const t = new state.Token("html_inline", "", 0);
                  t.content = "&#123;&#123;";
                  children.push(t);
                }
                if (part) {
                  const t = new state.Token("text", "", 0);
                  t.content = part;
                  children.push(t);
                }
              });
            } else {
              children.push(child);
            }
          }
          tok.children = children;
        }
      });
      // ↑↑↑ 转义规则结束 ↑↑↑
    },
    lineNumbers: true,
  },

  transformPageData(pageData) {
    // daily：本周概览 → day1..day7 → 下一周（content-site.md §5：顺序从 frontmatter/目录派生）
    const idx = dailyOrder.findIndex((o) => linkToRel(o.link) === pageData.relativePath);
    if (idx >= 0) {
      const prev = dailyOrder[idx - 1];
      const next = dailyOrder[idx + 1];
      pageData.frontmatter.prev = prev ? { text: prev.text, link: prev.link } : false;
      pageData.frontmatter.next = next ? { text: next.text, link: next.link } : false;
    }
  },

  themeConfig: {
    // 顶栏只留「面试速查」下拉（收纳 reference/notes/面经专题）；
    // 主线/专题/论文/Profiling 从首页与文档内链进入，不再占顶栏；
    // 主站功能入口（刷题/题库/组卷面试/搜索）在顶栏右侧 NavActions。
    nav: [
      {
        text: "面试速查",
        items: [
          { text: "面试必背数字清单", link: "/reference/key_numbers" },
          { text: "硬件参数速查", link: "/reference/hardware_specs" },
          { text: "CUDA 手撕题面经", link: "/notes/cuda-interview-notes" },
          { text: "AI Infra 面经专题", link: "/topics/interview/" },
        ],
      },
    ],

    // 无左侧边栏：正文加宽由共享 custom.css 的 :not(.has-sidebar) 规则承担
    outline: { level: [2, 3], label: "本页目录" },

    // 顶栏站点名（AI Infra Lab）指向主站首页 /，而非 docs base 首页 /learn/；
    // target=_self 让 vitepress 前端路由跳过拦截（跨分区/SPA 链接统一约定）
    logoLink: { link: "/", target: "_self" },

    // 本专题文档清单（右栏「本页目录」下方，theme/TopicSiblings.vue 渲染）
    topicDocs: topicDocs(),

    docFooter: { prev: "上一页", next: "下一页" },
    darkModeSwitchLabel: "外观",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "回到顶部",
  },
});
