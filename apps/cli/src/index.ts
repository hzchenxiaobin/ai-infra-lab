#!/usr/bin/env node
import { Command } from "commander";
import * as readline from "node:readline/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type ContentImportInput,
} from "@ailab/contracts";
import { getCaller, runSession } from "./session.js";
import { banner, dimLine, errorLine, successLine, tableRow } from "./ui.js";

const program = new Command();

program
  .name("interview")
  .description("AI Infra 模拟面试 CLI")
  .version("0.0.0");

// ── start ──────────────────────────────────────────────────────────────

program
  .command("start")
  .description("开始一场新面试")
  .option("-c, --categories <cats>", "方向，逗号分隔（leetcode,cuda,knowledge）")
  .option("-s, --scope <scope>", "考察范围前缀（如 ai-infra-notes:aiinfra/daily/week1/）")
  .option("-n, --count <n>", "题量", "5")
  .action(async (opts) => {
    const caller = await getCaller();

    let categories: Category[] = [];
    let scope: string | undefined;
    let count = parseInt(opts.count, 10);
    if (isNaN(count) || count < 1) count = 5;

    if (opts.scope) {
      scope = opts.scope;
    } else if (opts.categories) {
      categories = opts.categories.split(",").map((s: string) => s.trim()).filter(Boolean) as Category[];
      const invalid = categories.filter((c) => !CATEGORIES.includes(c));
      if (invalid.length > 0) {
        console.log(errorLine(`未知方向：${invalid.join(", ")}`));
        console.log(dimLine(`可选：${CATEGORIES.join(", ")}`));
        process.exit(1);
      }
    } else {
      const result = await interactivePick(caller);
      if (result.scope) {
        scope = result.scope;
      } else {
        categories = result.categories;
      }
      count = result.count;
    }

    if (!scope && categories.length === 0) {
      categories = ["knowledge"] as Category[];
    }

    console.log(dimLine(`正在创建面试（${scope ?? categories.join("+")}，${count} 题）…`));

    try {
      const start = await caller.interview.start(
        scope ? { categories: [], count, scope } : { categories, count },
      );
      console.log(successLine(`面试已创建：场次 #${start.state.sessionId}`));
      await runSession(start.state.sessionId, caller);
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

// ── resume ─────────────────────────────────────────────────────────────

program
  .command("resume <sessionId>")
  .description("继续一场未完成的面试")
  .action(async (sessionId: string) => {
    const caller = await getCaller();
    try {
      await runSession(parseInt(sessionId, 10), caller);
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

// ── list ───────────────────────────────────────────────────────────────

program
  .command("list")
  .description("列出历史面试场次")
  .action(async () => {
    const caller = await getCaller();
    const sessions = await caller.interview.list();
    if (sessions.length === 0) {
      console.log(dimLine("暂无面试记录"));
      process.exit(0);
    }
    const widths = [6, 8, 40, 6, 20];
    console.log(tableRow(["ID", "状态", "标题", "题数", "创建时间"], widths));
    for (const s of sessions) {
      const date = s.createdAt.toISOString().slice(0, 16).replace("T", " ");
      console.log(tableRow([
        String(s.id),
        s.status === "active" ? "进行中" : "已结束",
        s.title.slice(0, 38),
        String(s.questionIds.length),
        date,
      ], widths));
    }
    process.exit(0);
  });

// ── report ─────────────────────────────────────────────────────────────

program
  .command("report <sessionId>")
  .description("查看面试评估报告")
  .action(async (sessionId: string) => {
    const caller = await getCaller();
    try {
      const detail = await caller.interview.get({ sessionId: parseInt(sessionId, 10) });
      if (detail.session.status !== "finished") {
        console.log(errorLine("该面试尚未结束，使用 resume 继续面试。"));
        process.exit(1);
      }
      console.log(banner(detail.session.title));
      console.log(detail.session.report ?? "（无报告）");
      if (detail.session.overallGrade) {
        console.log(successLine(`综合等级：${detail.session.overallGrade}`));
      }
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

// ── stats ──────────────────────────────────────────────────────────────

program
  .command("stats")
  .description("题库统计 + 面试统计")
  .action(async () => {
    const caller = await getCaller();
    const qStats = await caller.question.stats();
    console.log(banner("题库统计"));
    for (const c of CATEGORIES) {
      console.log(`  ${CATEGORY_LABELS[c].padEnd(10)} ${qStats.byCategory[c]} 题`);
    }
    console.log(`  ${"合计".padEnd(10)} ${qStats.total} 题`);

    const iStats = await caller.interview.stats();
    console.log(banner("面试统计"));
    console.log(`  已完成场次：${iStats.totalFinished}`);
    if (iStats.categoryAverages.length > 0) {
      for (const ca of iStats.categoryAverages) {
        const grade = ca.average >= 3.5 ? "A" : ca.average >= 2.5 ? "B" : ca.average >= 1.5 ? "C" : "D";
        console.log(`  ${CATEGORY_LABELS[ca.category as Category].padEnd(10)} 均分 ${ca.average.toFixed(1)}（${grade}）· ${ca.sessions} 场`);
      }
    }
    process.exit(0);
  });

// ── scopes ─────────────────────────────────────────────────────────────

program
  .command("scopes")
  .description("列出可选考察范围（按周/天/专题）")
  .action(async () => {
    const caller = await getCaller();
    const scopes = await caller.question.scopes();
    if (scopes.weeks.length > 0) {
      console.log(dimLine("按周（daily）："));
      for (const w of scopes.weeks) {
        console.log(`  ${w.name.padEnd(12)} ${w.count} 题  → ${w.scope}`);
      }
    }
    if (scopes.days.length > 0) {
      console.log(dimLine("\n按天（daily）："));
      for (const d of scopes.days) {
        console.log(`  ${d.week}/${d.day}  ${d.count} 题  → ${d.scope}`);
      }
    }
    if (scopes.topics.length > 0) {
      console.log(dimLine("\n按专题（topics）："));
      for (const t of scopes.topics) {
        console.log(`  ${t.name.padEnd(12)} ${t.count} 题  → ${t.scope}`);
      }
    }
    process.exit(0);
  });

// ── seed ───────────────────────────────────────────────────────────────

program
  .command("seed")
  .description("播种内置题库")
  .action(async () => {
    const caller = await getCaller();
    const result = await caller.question.seed();
    console.log(successLine(`播种完成：新增 ${result.seeded} 题，跳过 ${result.skipped} 题`));
    process.exit(0);
  });

// ── questions ──────────────────────────────────────────────────────────

program
  .command("questions")
  .description("列出题库（支持筛选）")
  .option("-c, --category <cat>", "方向过滤（leetcode/cuda/knowledge）")
  .option("-s, --search <keyword>", "标题搜索")
  .option("-p, --page <n>", "页码", "1")
  .action(async (opts) => {
    const caller = await getCaller();
    const { items, total } = await caller.question.list({
      category: opts.category,
      search: opts.search,
      page: parseInt(opts.page, 10),
      pageSize: 20,
    });
    if (items.length === 0) {
      console.log(dimLine("无题目，先 seed 或 sync"));
      process.exit(0);
    }
    const widths = [6, 10, 8, 50];
    console.log(tableRow(["ID", "方向", "难度", "标题"], widths));
    for (const q of items) {
      console.log(tableRow([
        String(q.id),
        CATEGORY_LABELS[q.category as Category] ?? q.category,
        q.difficulty,
        q.title.slice(0, 48),
      ], widths));
    }
    console.log(dimLine(`\n第 ${opts.page} 页 · 共 ${total} 题`));
    process.exit(0);
  });

// ── content:sync ────────────────────────────────────────────────────────

program
  .command("content:sync")
  .description("content-kit dist 产物幂等入库（先跑 pnpm --filter content-kit sync 生成）")
  .option("--dist <dir>", "content-kit dist 目录", undefined)
  .action(async (opts) => {
    const distDir =
      opts.dist ?? path.resolve(fileURLToPath(new URL("../../../packages/content-kit/dist", import.meta.url)));
    let contentsRaw: unknown;
    let problemsRaw: unknown;
    try {
      [contentsRaw, problemsRaw] = await Promise.all([
        readFile(path.join(distDir, "contents.json"), "utf8").then(JSON.parse),
        readFile(path.join(distDir, "problems.json"), "utf8").then(JSON.parse),
      ]);
    } catch (err) {
      console.log(errorLine(`读取 dist 产物失败（${distDir}）：${(err as Error).message}`));
      console.log(dimLine("先在 packages/content-kit 跑 `node scripts/tsx.mjs src/sync.ts` 生成产物"));
      process.exit(1);
    }
    // content-kit 产物为 snake_case，contracts 入参为 camelCase（dev/cli.md §5：映射收在 CLI）
    const input: ContentImportInput = {
      contents: (contentsRaw as Array<Record<string, unknown>>).map((c) => ({
        id: String(c.id),
        type: c.type as ContentImportInput["contents"][number]["type"],
        title: String(c.title),
        tags: (c.tags as string[]) ?? [],
        knowledgePoints: (c.knowledge_points as string[]) ?? [],
        url: String(c.url ?? ""),
        contentHash: String(c.contentHash),
      })),
      problems: (problemsRaw as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id),
        source: p.source as ContentImportInput["problems"][number]["source"],
        number: Number(p.number ?? 0),
        difficulty: p.difficulty as ContentImportInput["problems"][number]["difficulty"],
        languages: (p.languages as string[]) ?? [],
        judgeType: p.judge_type as ContentImportInput["problems"][number]["judgeType"],
        testcases: (p.testcases as ContentImportInput["problems"][number]["testcases"]) ?? [],
        externalUrl: String(p.external_url ?? ""),
      })),
    };
    console.log(dimLine(`导入 ${input.contents.length} 条内容元数据 / ${input.problems.length} 条题目元数据…`));
    try {
      const caller = await getCaller();
      const stats = await caller.content.import(input);
      console.log(
        successLine(
          `同步完成：新增 ${stats.inserted} · 更新 ${stats.updated} · 未变 ${stats.unchanged} · 标 stale ${stats.stale} · 题目 upsert ${stats.problemsUpserted}`,
        ),
      );
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

// ── 交互式选题 ─────────────────────────────────────────────────────────

async function interactivePick(
  caller: Awaited<ReturnType<typeof getCaller>>,
): Promise<{ scope?: string; categories: Category[]; count: number }> {
  const qStats = await caller.question.stats();
  const scopes = await caller.question.scopes();

  console.log(banner("创建面试"));
  console.log("题库：");
  for (const c of CATEGORIES) {
    console.log(`  ${CATEGORIES.indexOf(c) + 1}. ${CATEGORY_LABELS[c]}（${qStats.byCategory[c]} 题）`);
  }
  let scopeIdx = CATEGORIES.length + 1;
  if (scopes.weeks.length > 0) {
    console.log(dimLine(`  ── 按周 ──`));
    scopes.weeks.forEach((w) => {
      console.log(`  ${scopeIdx}. ${w.name.replace(/^week(\d+)$/, "Week $1")}（${w.count} 题）`);
      scopeIdx++;
    });
  }
  if (scopes.topics.length > 0) {
    console.log(dimLine(`  ── 按专题 ──`));
    scopes.topics.forEach((t) => {
      console.log(`  ${scopeIdx}. ${t.name} 专题（${t.count} 题）`);
      scopeIdx++;
    });
  }

  const rl = readline.createInterface({ input, output, terminal: false });
  const choice = await rl.question("\n选择编号：");
  const num = parseInt(choice, 10);

  let scope: string | undefined;
  let categories: Category[] = [];

  if (num >= 1 && num <= CATEGORIES.length) {
    const cat = CATEGORIES[num - 1];
    categories = [cat];
    console.log(dimLine(`已选 ${CATEGORY_LABELS[cat]}，可继续输入其他方向编号（逗号分隔），或直接回车确认`));
    const extra = await rl.question("追加方向（可选）：");
    if (extra.trim()) {
      for (const s of extra.split(",")) {
        const idx = parseInt(s.trim(), 10);
        if (idx >= 1 && idx <= CATEGORIES.length && !categories.includes(CATEGORIES[idx - 1])) {
          categories.push(CATEGORIES[idx - 1]);
        }
      }
    }
  } else {
    let offset = CATEGORIES.length + 1;
    const allScopes = [
      ...scopes.weeks.map((w) => w.scope),
      ...scopes.topics.map((t) => t.scope),
    ];
    const idx = num - offset;
    if (idx >= 0 && idx < allScopes.length) {
      scope = allScopes[idx];
    }
  }

  const countStr = await rl.question("题量（默认 5）：");
  rl.close();
  const count = parseInt(countStr, 10) || 5;

  return { scope, categories, count };
}

program.parse();
