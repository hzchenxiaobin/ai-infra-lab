// 题解数据加载器（拷自 leetcode solutions.data.ts，适配扁平 URL /algo/{num:04d}；
// 元数据取 frontmatter——04 决策：frontmatter 是唯一元数据来源，不再用 H1/加粗行正则）。
import { createContentLoader } from "vitepress";

export interface Problem {
  url: string;
  range: string;
  num: number;
  title: string;
  diff: "easy" | "medium" | "hard" | "";
  tags: string;
}

declare const data: Problem[];
export { data };

const pad4 = (n: number) => String(n).padStart(4, "0");

export default createContentLoader("algo/*.md", {
  includeSrc: false,
  transform(raw): Problem[] {
    return raw
      .map((page) => {
        const m = page.url.match(/\/algo\/(\d{4})\/?$/);
        const lcof = page.url.match(/\/algo\/lcof-(\d+)\/?$/);
        if (!m && !lcof) return null;
        const fm = page.frontmatter as Record<string, unknown>;
        const num = m ? parseInt(m[1]) : 9000 + parseInt(lcof![1]);
        const lo = m ? Math.floor((num - 1) / 100) * 100 + 1 : 0;
        const hi = m ? lo + 99 : 0;
        return {
          url: page.url,
          range: m ? `${pad4(lo)}-${pad4(hi)}` : "剑指 Offer",
          num,
          title: typeof fm.title === "string" ? fm.title : page.url,
          diff: (fm.difficulty as Problem["diff"]) ?? "",
          tags: Array.isArray(fm.tags) ? (fm.tags as string[]).join(", ") : "",
        };
      })
      .filter((p): p is Problem => p !== null)
      .sort((a, b) => a.num - b.num);
  },
});
