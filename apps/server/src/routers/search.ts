import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { searchQuerySchema } from "@ailab/contracts";
import { authedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// 全站搜索（dev/content-kit.md §7：查 content-kit 产出的静态索引 search-index.json）。
// 索引加载一次进程内缓存；匹配为大小写不敏感的子串命中（标题/标签/知识点/摘要），
// 按命中权重排序。中文分词升级（miniSearch + bigram）为后续优化项，先保接口形态稳定。
// ---------------------------------------------------------------------------

interface IndexRow {
  id: string;
  title: string;
  type: "learn" | "problem" | "paper" | "profiling";
  url: string;
  tags: string[];
  knowledge_points: string[];
  summary: string;
}

const INDEX_PATH = fileURLToPath(
  new URL("../../../../packages/content-kit/dist/search-index.json", import.meta.url),
);

let indexCache: IndexRow[] | null = null;

async function loadIndex(): Promise<IndexRow[]> {
  if (indexCache) return indexCache;
  try {
    indexCache = JSON.parse(await readFile(INDEX_PATH, "utf8")) as IndexRow[];
  } catch {
    throw new Error("搜索索引未生成（先在 packages/content-kit 跑 `node scripts/tsx.mjs src/sync.ts`）");
  }
  return indexCache;
}

export const searchRouter = router({
  query: authedProcedure
    .input(searchQuerySchema)
    .query(async ({ input }) => {
      const rows = await loadIndex();
      const q = input.q.toLowerCase();
      const scored: Array<{ row: IndexRow; score: number }> = [];
      for (const row of rows) {
        if (input.type && row.type !== input.type) continue;
        let score = 0;
        if (row.title.toLowerCase().includes(q)) score += 3;
        if (row.tags.some((t) => t.toLowerCase().includes(q))) score += 2;
        if (row.knowledge_points.some((k) => k.toLowerCase().includes(q))) score += 2;
        if (row.summary.toLowerCase().includes(q)) score += 1;
        if (score > 0) scored.push({ row, score });
      }
      scored.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
      return {
        items: scored.slice(0, input.limit).map(({ row, score }) => ({
          id: row.id,
          title: row.title,
          type: row.type,
          url: row.url,
          tags: row.tags,
          knowledgePoints: row.knowledge_points,
          summary: row.summary,
          score,
        })),
        total: scored.length,
      };
    }),
});
