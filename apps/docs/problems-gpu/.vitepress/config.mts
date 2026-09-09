// GPU 分区配置（dev/content-site.md：leetgpu 站拷入适配）。
// - base /problems/gpu/：对齐 contents.url（/problems/gpu/{diff}/{num}-{slug}）
// - KaTeX/花括号/未知标签转义规则与 learn 分区同源（content-site.md §4）
// - languageAlias cuda → cpp（CUDA 代码块高亮，leetgpu 原配置）
// - 无侧边栏：题解页 正文 + 右侧目录 + BackLink 返回列表（leetgpu 原布局）
import { defineConfig } from "vitepress";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import katex from "@traptitech/markdown-it-katex";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(root, "../src");

/** 题目全局顺序：easy → medium → hard，各自按目录序号 */
function loadOrder() {
  const out: Array<{ text: string; link: string }> = [];
  for (const diff of ["easy", "medium", "hard"]) {
    const dir = path.join(src, diff);
    if (!fs.existsSync(dir)) continue;
    for (const d of fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => parseInt(a) - parseInt(b))) {
      const fm = fs.readFileSync(path.join(dir, d, "index.md"), "utf8");
      const title = (fm.match(/^title:\s*"?([^"\n]+)"?/m)?.[1] ?? d).trim();
      out.push({ text: title, link: `/${diff}/${d}/` });
    }
  }
  return out;
}

const order = loadOrder();

export default defineConfig({
  title: "LeetGPU 题解",
  description: "CUDA Kernel 编程题解合集",
  lang: "zh-CN",
  base: "/problems/gpu/",
  srcDir: "src",
  srcExclude: ["**/SKILL.md"],
  outDir: "./dist",
  ignoreDeadLinks: true, // 正文里有指向站外仓库与 .cu 源码的链接
  lastUpdated: false,
  buildConcurrency: 8,

  head: [
    [
      "link",
      {
        rel: "icon",
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>⚡</text></svg>",
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
    languageAlias: { cuda: "cpp" },
  },

  // 上一题/下一题：easy → medium → hard 按目录序号（leetgpu 原逻辑）
  transformPageData(pageData) {
    const idx = order.findIndex(
      (o) => o.link.slice(1) + "index.md" === pageData.relativePath,
    );
    if (idx >= 0) {
      const prev = order[idx - 1];
      const next = order[idx + 1];
      pageData.frontmatter.prev = prev ? { text: prev.text, link: prev.link } : false;
      pageData.frontmatter.next = next ? { text: next.text, link: next.link } : false;
    }
  },

  themeConfig: {
    nav: [
      { text: "首页", link: "/" },
      { text: "Easy", link: "/easy.html" },
      { text: "Medium", link: "/medium.html" },
      { text: "Hard", link: "/hard.html" },
    ],

    sidebar: false,

    outline: { level: [2, 3], label: "本页目录" },

    search: {
      provider: "local" as const,
      options: {
        translations: {
          button: { buttonText: "搜索", buttonAriaLabel: "搜索" },
          modal: {
            displayDetails: "显示详细列表",
            noResultsText: "无法找到相关结果",
            resetButtonTitle: "清除查询条件",
            footer: { selectText: "选择", navigateText: "切换", closeText: "关闭" },
          },
        },
      },
    },

    docFooter: { prev: "上一题", next: "下一题" },
    darkModeSwitchLabel: "外观",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "回到顶部",
  },
});
