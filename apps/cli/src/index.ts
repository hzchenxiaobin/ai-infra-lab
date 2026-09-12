#!/usr/bin/env node
import { Command } from "commander";
import * as readline from "node:readline/promises";
import { readFile } from "node:fs/promises";
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  MAX_QUESTIONS_PER_SESSION,
  QUOTA_KINDS,
  type Category,
  type ContentImportInput,
} from "@ailab/contracts";
import { env } from "@ailab/server/env";
import { getCaller, runSession } from "./session.js";
import { registerBankCommands } from "./bank.js";
import { banner, dimLine, errorLine, successLine, tableRow } from "./ui.js";

const program = new Command();

program
  .name("ailab")
  .description("AIInfra Lab 管理 CLI")
  .version("0.0.0");

registerBankCommands(program);

// ── start ──────────────────────────────────────────────────────────────

program
  .command("start")
  .description("开始一场新面试")
  .option("-c, --categories <cats>", "方向，逗号分隔（leetcode,cuda,knowledge）")
  .option("-s, --scope <scope>", "考察范围前缀（如 ai-infra-notes:aiinfra/daily/week1/）")
  .option("-n, --count <n>", "题量", "1")
  .action(async (opts) => {
    const caller = await getCaller();

    let categories: Category[] = [];
    let scope: string | undefined;
    let count = parseInt(opts.count, 10);
    if (isNaN(count) || count < 1) count = 1;
    if (count > MAX_QUESTIONS_PER_SESSION) count = MAX_QUESTIONS_PER_SESSION;

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
      console.log(detail.report?.report ?? "（无报告）");
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
    let listsRaw: unknown;
    try {
      [contentsRaw, problemsRaw, listsRaw] = await Promise.all([
        readFile(path.join(distDir, "contents.json"), "utf8").then(JSON.parse),
        readFile(path.join(distDir, "problems.json"), "utf8").then(JSON.parse),
        readFile(path.join(distDir, "lists.json"), "utf8").then(JSON.parse),
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
        judgeMeta:
          (p.judge_meta as ContentImportInput["problems"][number]["judgeMeta"]) ?? null,
        externalUrl: String(p.external_url ?? ""),
      })),
      lists: ((listsRaw as Array<Record<string, unknown>>) ?? []).map((l) => ({
        id: String(l.id),
        title: String(l.title),
        url: String(l.url ?? ""),
        problemIds: (l.problem_ids as string[]) ?? [],
        contentHash: String(l.contentHash),
      })),
    };
    console.log(dimLine(`导入 ${input.contents.length} 条内容元数据 / ${input.problems.length} 条题目元数据 / ${input.lists.length} 个题单…`));
    try {
      const caller = await getCaller();
      const stats = await caller.content.import(input);
      console.log(
        successLine(
          `同步完成：新增 ${stats.inserted} · 更新 ${stats.updated} · 未变 ${stats.unchanged} · 标 stale ${stats.stale} · 题目 upsert ${stats.problemsUpserted} · 题单 upsert ${stats.listsUpserted}`,
        ),
      );
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

// ── user:list / user:ban / user:unban（管理，dev/cli.md §3）──────────────

program
  .command("user:list")
  .description("列出用户（管理）")
  .option("-s, --search <keyword>", "按邮箱/昵称搜索")
  .option("-p, --page <n>", "页码", "1")
  .action(async (opts) => {
    const caller = await getCaller();
    const { items, total, page } = await caller.auth.userList({
      search: opts.search,
      page: parseInt(opts.page, 10),
      pageSize: 20,
    });
    if (items.length === 0) {
      console.log(dimLine("无匹配用户"));
      process.exit(0);
    }
    const widths = [6, 30, 16, 6, 8, 17];
    console.log(tableRow(["ID", "邮箱", "昵称", "tier", "状态", "注册时间"], widths));
    for (const u of items) {
      const date = u.createdAt.toISOString().slice(0, 16).replace("T", " ");
      console.log(tableRow([
        String(u.id),
        (u.email ?? "（遗留单用户）").slice(0, 28),
        u.name.slice(0, 14),
        u.tier,
        u.bannedAt ? "已封禁" : "正常",
        date,
      ], widths));
    }
    console.log(dimLine(`\n第 ${page} 页 · 共 ${total} 个用户`));
    process.exit(0);
  });

async function printBanTarget(caller: Awaited<ReturnType<typeof getCaller>>, email: string) {
  const user = await caller.auth.userByEmail({ email });
  console.log(dimLine(`目标：#${user.id} ${user.email}（${user.name}，tier=${user.tier}，当前${user.bannedAt ? "已封禁" : "正常"}）`));
  return user;
}

program
  .command("user:ban <email>")
  .description("封禁用户（破坏性：登录与既有会话立即失效；--yes 确认）")
  .option("--yes", "跳过影响范围确认，直接执行")
  .action(async (email: string, opts: { yes?: boolean }) => {
    const caller = await getCaller();
    try {
      await printBanTarget(caller, email);
      if (!opts.yes) {
        console.log(errorLine("封禁后该用户登录与既有会话立即失效；确认请加 --yes"));
        process.exit(1);
      }
      await caller.auth.userSetBanned({ email, banned: true });
      console.log(successLine(`已封禁：${email}`));
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

program
  .command("user:unban <email>")
  .description("解封用户")
  .action(async (email: string) => {
    const caller = await getCaller();
    try {
      await caller.auth.userSetBanned({ email, banned: false });
      console.log(successLine(`已解封：${email}`));
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

program
  .command("user:claim <userId> <email>")
  .description("认领遗留用户（email 为空的单用户时代数据）：绑定邮箱 + 初始密码，历史数据原地保留")
  .option("-p, --password <pw>", "初始密码（缺省生成随机密码，仅显示一次）")
  .action(async (userId: string, email: string, opts: { password?: string }) => {
    const caller = await getCaller();
    try {
      const result = await caller.auth.userClaim({
        userId: parseInt(userId, 10),
        email,
        password: opts.password,
      });
      console.log(
        successLine(`已认领：#${result.user.id} ${result.user.email}（${result.user.name}，历史数据已保留）`),
      );
      if (result.generatedPassword) {
        console.log(dimLine("初始密码（仅显示这一次，请立即保存）："));
        console.log(`  ${result.generatedPassword}`);
      }
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

// ── quota:get / quota:set（管理，dev/cli.md §3）─────────────────────────

program
  .command("quota:get <email>")
  .description("查看用户当前周期配额用量（管理）")
  .action(async (email: string) => {
    const caller = await getCaller();
    try {
      const data = await caller.quota.adminGet({ email });
      console.log(banner(`${email} · 周期 ${data.current[0]?.period ?? "—"}`));
      for (const u of data.current) {
        const quota = u.quota == null ? "不限" : String(u.quota);
        console.log(`  ${u.kind.padEnd(12)} 已用 ${String(u.used).padEnd(6)} 限额 ${quota}`);
      }
      if (data.history.length > 0) {
        console.log(dimLine("\n历史周期："));
        for (const h of data.history.slice(0, 10)) {
          console.log(`  ${h.period}  ${h.kind.padEnd(12)} 已用 ${h.used} / ${h.quota == null ? "不限" : h.quota}`);
        }
      }
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

program
  .command("quota:set <email> <kind> <quota>")
  .description("调整用户当前周期配额（管理）；quota 为正整数或 unlimited（=不限）")
  .action(async (email: string, kind: string, quotaStr: string) => {
    if (!QUOTA_KINDS.includes(kind as (typeof QUOTA_KINDS)[number])) {
      console.log(errorLine(`未知配额类型：${kind}`));
      console.log(dimLine(`可选：${QUOTA_KINDS.join(", ")}`));
      process.exit(1);
    }
    const unlimited = quotaStr === "unlimited" || quotaStr === "null";
    const quota = unlimited ? null : parseInt(quotaStr, 10);
    if (quota != null && (Number.isNaN(quota) || quota < 1)) {
      console.log(errorLine("quota 须为正整数或 unlimited"));
      process.exit(1);
    }
    const caller = await getCaller();
    try {
      const result = await caller.quota.adminSet({
        email,
        kind: kind as (typeof QUOTA_KINDS)[number],
        quota,
      });
      console.log(
        successLine(`已设置 ${result.email} ${result.kind} = ${result.quota == null ? "不限" : result.quota}（周期 ${result.period}）`),
      );
      process.exit(0);
    } catch (err) {
      console.log(errorLine((err as Error).message));
      process.exit(1);
    }
  });

// ── db:backup（dev/cli.md §3 / deployment.md）───────────────────────────

program
  .command("db:backup")
  .description("mysqldump 备份到 deploy/backups/")
  .option("-o, --out <dir>", "输出目录（默认 deploy/backups）")
  .action(async (opts: { out?: string }) => {
    const url = new URL(env.DATABASE_URL);
    const host = url.hostname;
    const port = url.port || "3306";
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const database = url.pathname.replace(/^\//, "");
    const outDir =
      opts.out ?? path.resolve(fileURLToPath(new URL("../../../deploy/backups", import.meta.url)));
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const file = path.join(outDir, `${database}-${stamp}.sql`);

    mkdirSync(outDir, { recursive: true });
    console.log(dimLine(`mysqldump ${user}@${host}:${port}/${database} → ${file}`));

    // 直接把已打开的 fd 给子进程写（spawn stdio 不接受未 open 的 WriteStream）
    const fd = openSync(file, "w");
    const dump = spawn("mysqldump", ["-h", host, "-P", port, "-u", user, database], {
      env: { ...process.env, ...(password ? { MYSQL_PWD: password } : {}) },
      stdio: ["ignore", fd, "pipe"],
    });
    const stderrChunks: Buffer[] = [];
    if (dump.stderr) dump.stderr.on("data", (d: Buffer) => stderrChunks.push(d));

    try {
      await new Promise<void>((resolve, reject) => {
        dump.on("error", reject);
        dump.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`mysqldump 退出码 ${code}：${Buffer.concat(stderrChunks).toString().slice(0, 500)}`));
        });
      });
      closeSync(fd);
      const size = statSync(file).size;
      console.log(successLine(`备份完成：${file}（${(size / 1024).toFixed(1)} KB）`));
      process.exit(0);
    } catch (err) {
      try {
        closeSync(fd);
        unlinkSync(file);
      } catch {
        // 清理失败忽略
      }
      console.log(errorLine(`备份失败：${(err as Error).message}`));
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

  const countStr = await rl.question(`题量（默认 1，最多 ${MAX_QUESTIONS_PER_SESSION}）：`);
  rl.close();
  const count = Math.min(parseInt(countStr, 10) || 1, MAX_QUESTIONS_PER_SESSION);

  return { scope, categories, count };
}

// ── 全局身份 option（dev/cli.md §2：--user <email> 或 AILAB_USER）────────
// 根命令与所有子命令都接受 --user（含 bank:*），preAction 统一落到 AILAB_USER，
// session.ts 的 getCaller 只读这一个变量；未指定时 getCaller 报错退出。

const USER_OPTION = "-u, --user <email>";
const USER_DESC = "操作身份（email；管理命令需该邮箱在服务端 ADMIN_EMAILS 中）";
program.option(USER_OPTION, USER_DESC);
for (const cmd of program.commands) cmd.option(USER_OPTION, USER_DESC);
program.hook("preAction", (thisCmd) => {
  const email = thisCmd.opts().user ?? program.opts().user;
  if (email) process.env.AILAB_USER = String(email);
});

program.parse();
