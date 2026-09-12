// algo 分区配置（dev/content-site.md：leetcode 站拷入适配，4100+ 页分批构建纪律全部保留）。
//
// 大规模构建纪律（§3，血泪经验逐条保留）：
// - 分批并行构建：BATCH_TOTAL/BATCH_INDEX 按题号连续切批（切片在 sync-algo.mts 完成，
//   各批独立 outDir=dist_{N} 再合并）
// - 共享页只在第 0 批（sync 侧控制）
// - SSR 并发上限 buildConcurrency 8；Node 堆 6GB（NODE_OPTIONS 由 npm script/CI 设置）
// - 分批时关本地搜索（每批只索引本批页面，合并后残缺）；全站搜索走 web /search
// - ignoreDeadLinks（正文有指向仓库内非页面文件的相对链接）
//
// URL 布局（base /problems/）：/algo/{num:04d}、/algo/lcof-{n}、/algo/topics/{slug}、
// /contest/{n}/q{q}、/lists/{slug}——对齐 ids.ts 的 contents.url。
import { defineConfig } from "vitepress";
import katex from "@traptitech/markdown-it-katex";

const batchTotal = Math.max(1, parseInt(process.env.BATCH_TOTAL || "1", 10));
const batchIndex = Math.max(0, parseInt(process.env.BATCH_INDEX || "0", 10));
const batching = batchTotal > 1;

export default defineConfig({
  title: "算法题解",
  description: "LeetCode 题解 · 面试高频 · 周赛实战",
  lang: "zh-CN",
  base: "/problems/",
  srcDir: "src",
  srcExclude: ["**/SKILL.md", "**/INDEX.md"],
  outDir: batching ? `./dist_${batchIndex}` : "./dist",
  ignoreDeadLinks: true,
  lastUpdated: false,
  appearance: "dark", // 默认暗色（对齐主站），用户仍可切换
  buildConcurrency: 8,

  head: [
    [
      "link",
      {
        rel: "icon",
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>📝</text></svg>",
      },
    ],
  ],

  markdown: {
    config: (md) => {
      // ↓↓↓ 转义规则整套拷自 leetcode config.mts（content-site.md §4） ↓↓↓
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

  // 无侧边栏（leetcode 原布局）：正文 + 右侧目录 + BackLink 返回列表；
  // 上一题/下一题由 data loader 的 prev/next 数据注入见下
  themeConfig: {
    nav: [
      { text: "首页", link: "/" },
      { text: "题解", link: "/solutions.html" },
      { text: "周赛", link: "/contests.html" },
      { text: "题单", link: "/lists.html" },
      { text: "专题", link: "/algo/topics/" },
    ],

    sidebar: false,

    outline: { level: [2, 3], label: "本页目录" },

    // 不开本地搜索（4100+ 页 miniSearch 索引把 12GB 堆打爆；且与架构决策一致：
    // 全站搜索走 content-kit 静态索引 + web /search 页，见 content-site.md §3）

    docFooter: { prev: "上一题", next: "下一题" },
    darkModeSwitchLabel: "外观",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "回到顶部",
  },
});
