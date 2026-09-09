// 周赛数据加载器（拷自 leetcode contests.data.ts，适配新 URL /contest/{n}/q{q}；
// 元数据取 frontmatter——04 决策：frontmatter 是唯一元数据来源）。
import { createContentLoader } from "vitepress";

export interface ContestProblem {
  url: string;
  contest: number;
  q: number;
  title: string;
  diff: "easy" | "medium" | "hard" | "";
  tags: string;
}

declare const data: ContestProblem[];
export { data };

export default createContentLoader("contest/*/*.md", {
  includeSrc: false,
  transform(raw): ContestProblem[] {
    return raw
      .map((page) => {
        const m = page.url.match(/\/contest\/(\d+)\/q(\d+)\/?$/);
        if (!m) return null;
        const fm = page.frontmatter as Record<string, unknown>;
        return {
          url: page.url,
          contest: parseInt(m[1]),
          q: parseInt(m[2]),
          title: typeof fm.title === "string" ? fm.title : page.url,
          diff: (fm.difficulty as ContestProblem["diff"]) ?? "",
          tags: Array.isArray(fm.tags) ? (fm.tags as string[]).join(", ") : "",
        };
      })
      .filter((p): p is ContestProblem => p !== null)
      .sort((a, b) => b.contest - a.contest || a.q - b.q); // 场次降序，最新在前
  },
});
