// learn 分区配置（dev/content-site.md）。
// - base /learn/：与 contents.url（/learn/...）对齐，web/docs 内不手拼路径
// - sidebar 构建期从 src 目录扫描生成（frontmatter 是唯一元数据来源，04 已决策）
// - markdown 转义规则整套拷自 leetcode config.mts（content-site.md §4，少一条都会有页面编译失败）
// - learn 区规模小（~260 页），开本地搜索：中文 bigram 分词 + 剔除代码块
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

/** weekN/dayM/index.md → sidebar 项（无 index.md 的目录跳过） */
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

function sidebarForTopics() {
  const topicsDir = path.join(src, "topics");
  if (!fs.existsSync(topicsDir)) return [];
  const slugs = fs
    .readdirSync(topicsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "images")
    .map((e) => e.name)
    .sort();
  const items = slugs.map((slug) => {
    const topicDir = path.join(topicsDir, slug);
    const days = fs
      .readdirSync(topicDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /^day\d+\.md$/.test(e.name))
      .sort((a, b) => parseInt(a.name.slice(3)) - parseInt(b.name.slice(3)))
      .map((d) => ({
        text: fmTitle(path.join(topicDir, d.name)) ?? d.name.replace(/\.md$/, ""),
        link: `/topics/${slug}/${d.name.replace(/\.md$/, "")}`,
      }));
    return {
      text: fmTitle(path.join(topicDir, "index.md")) ?? slug,
      collapsed: true,
      items: [{ text: "概览", link: `/topics/${slug}/` }, ...days],
    };
  });
  return items;
}

function sidebarForPapers() {
  const papersDir = path.join(src, "papers");
  if (!fs.existsSync(papersDir)) return [];
  return fs
    .readdirSync(papersDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "images")
    .map((e) => ({
      text: fmTitle(path.join(papersDir, e.name, "index.md")) ?? e.name,
      link: `/papers/${e.name}/`,
    }))
    .sort((a, b) => a.text.localeCompare(b.text));
}

// 上一页/下一页：daily 全局顺序（本周概览 → day1..day7 → 下一周概览）
const dailyOrder: Array<{ text: string; link: string }> = [];
for (const week of sidebarForWeeks()) {
  for (const item of week.items) dailyOrder.push(item);
}
/** sidebar 链接 → 对应 relativePath（"/week1/day1/" → "week1/day1/index.md"） */
const linkToRel = (link: string) => link.slice(1) + (link.endsWith("/") ? "index.md" : ".md");

export default defineConfig({
  title: "AI Infra 学习路径",
  description: "AI Infra 学习路径 · 10 周主线 · 专题 · 论文精读 · Profiling 实战",
  lang: "zh-CN",
  base: "/learn/",
  srcDir: "src",
  // INDEX.md 为题解/面经手工索引页，URL 与 README 转成的 index.md 冲突且被 sidebar 替代（leetcode 原配置同款排除）
  srcExclude: ["**/SKILL.md", "**/INDEX.md"],
  outDir: "./dist",
  ignoreDeadLinks: true, // 正文里有指向仓库内非页面文件（.cu/.py 等）的相对链接
  lastUpdated: false,
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
    nav: [
      { text: "首页", link: "/" },
      { text: "10 周主线", link: "/path" },
      { text: "专题", link: "/topics/" },
      { text: "论文", link: "/papers/" },
      { text: "Profiling", link: "/profiling/" },
    ],

    sidebar: {
      "/": [
        { text: "总览", items: [{ text: "学习地图", link: "/" }, { text: "课程总览", link: "/path" }] },
        ...sidebarForWeeks(),
        { text: "专题", items: sidebarForTopics() },
        { text: "论文精读", items: sidebarForPapers() },
        {
          text: "Profiling",
          items: [{ text: "ncu 训练营", link: "/profiling/" }],
        },
      ],
    },

    outline: { level: [2, 3], label: "本页目录" },

    search: {
      provider: "local" as const,
      options: {
        _render(src: string, env: any, md: any) {
          const html: string = md.render(src, env);
          if (env.frontmatter?.search === false) return "";
          return html.replace(/<pre[\s\S]*?<\/pre>/g, " ").replace(/<code>[\s\S]*?<\/code>/g, " ");
        },
        miniSearch: {
          options: {
            // 中文按二元组（bigram）切分，英文/数字整词索引（leetcode 血泪经验）
            tokenize: (str: string): string[] => {
              const tokens: string[] = [];
              for (const word of str.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
                if (!word) continue;
                if (/^[\x00-\x7f]+$/.test(word)) {
                  tokens.push(word);
                  continue;
                }
                const chars = [...word];
                if (chars.length === 1) {
                  tokens.push(chars[0]);
                  continue;
                }
                for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1]);
              }
              return tokens;
            },
          },
        },
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

    docFooter: { prev: "上一页", next: "下一页" },
    darkModeSwitchLabel: "外观",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "回到顶部",
  },
});
