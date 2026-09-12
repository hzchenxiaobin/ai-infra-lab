// bank.ts —— LLM 题库管线（dev/cli.md §3：bank:generate / bank:import）。
// 从 server scripts 收编（06 §interview 代码映射）：generate 是离线批处理
// （拉仓库 → 逐文件调 LLM 抽题 → 断点续跑落盘 JSON），import 经 createCaller
// 走 question.bankImport 幂等入库。
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  bankExtractItemSchema,
  bankImportItemSchema,
  type BankExtractItem,
  type BankImportItem,
} from "@ailab/contracts";
import { env } from "@ailab/server/env";
import { fetchRepoFiles } from "@ailab/server/sync/github";
import type { Command } from "commander";
import { getCaller } from "./session.js";
import { dimLine, errorLine, successLine } from "./ui.js";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const REPO = "ai-infra-notes";
const OWNER = "hzchenxiaobin";

// ---------------------------------------------------------------------------
// bank:generate（离线批处理，不依赖 DB）
// ---------------------------------------------------------------------------

const CONCURRENCY = 3;
// reasoning 模型耗时波动大（实测 36–161s），过短超时会误杀大量请求
const TIMEOUT_MS = 300_000;
// reasoning 先消耗思考 token，预算太小会导致 JSON 数组被截断或 content 为空
const MAX_TOKENS = 16_384;
const MAX_CONTENT_CHARS = 15_000;

type Category = "leetcode" | "cuda" | "knowledge";

interface ScopedFile {
  path: string;
  content: string;
  categoryHint: Category;
  source: string;
}

/** 与规则解析器相同的取材范围与分类映射（全部归 knowledge；cuda 仅收 leetgpu 编程题） */
const TOPIC_CATEGORY: Record<string, Category> = {
  cpp: "knowledge",
  cuda: "knowledge",
  cute: "knowledge",
  cutlass: "knowledge",
  deepgemm: "knowledge",
  triton: "knowledge",
  moe: "knowledge",
  pytorch: "knowledge",
  shengteng: "knowledge",
  transformer: "knowledge",
  vllm: "knowledge",
};

function scopeFiles(files: Array<{ path: string; content: string }>): ScopedFile[] {
  const out: ScopedFile[] = [];
  for (const f of files) {
    let m: RegExpExecArray | null;
    if (f.path === "aiinfra/topics/interview/notes/us_interview_qa.md") {
      out.push({ ...f, categoryHint: "knowledge", source: "AI Infra 面试题（北美面经篇）" });
    } else if (f.path === "aiinfra/topics/interview/notes/social_interview_qa.md") {
      out.push({ ...f, categoryHint: "knowledge", source: "AI Infra 社招面试实录" });
    } else if ((m = /^aiinfra\/topics\/([^/]+)\/[^/]+\.md$/.exec(f.path)) && TOPIC_CATEGORY[m[1]]) {
      out.push({ ...f, categoryHint: TOPIC_CATEGORY[m[1]], source: `ai-infra-notes/${m[1]}` });
    } else if ((m = /^aiinfra\/daily\/(week\d+)\/(day\d+)\/README\.md$/.exec(f.path))) {
      out.push({ ...f, categoryHint: "knowledge", source: `ai-infra-notes/daily/${m[1]}` });
    } else if (/^profiling\/week[123]\/day[^/]+\/README\.md$/.test(f.path)) {
      out.push({ ...f, categoryHint: "knowledge", source: "ai-infra-notes/profiling" });
    }
  }
  return out;
}

async function chatCompletion(
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LLM_API_KEY}`,
        ...(env.LLM_VKEY ? { "x-api-vkey": env.LLM_VKEY } : {}),
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        // 不传 temperature：reasoning 模型锁定为 1，显式传会 400
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("LLM 返回空内容");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonArray(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
  // 兼容模型包一层 {"questions": [...]} 的情况
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
    const arr = Object.values(obj).find(Array.isArray);
    if (arr) return arr;
  }
  throw new Error("响应中未找到 JSON 数组");
}

function buildMessages(
  file: ScopedFile,
  retryHint?: string,
): Array<{ role: "system" | "user"; content: string }> {
  const system = [
    "你是技术面试题库构建专家，正在为 AI Infra 岗位（CUDA/GPU、C++、算法、项目经历）的模拟面试准备题库。给你一篇学习材料，请从中抽取适合口头面试的题目。",
    "",
    "【抽取要求】",
    "1. 每道题对应一个可独立提问、可口头回答的知识点；一篇材料抽 0–5 题。",
    "2. 纯学习计划/任务清单/日程/资源链接类内容没有面试价值，直接返回 []。",
    `3. category 原则上取 "${file.categoryHint}"，仅在材料明显属于其他方向时可在 leetcode/cuda/knowledge 间调整。`,
    "4. title：简洁的题目名称（≤50 字），不带文件路径。",
    "5. content：面试时给候选人看的题面。若材料是学习笔记/实验记录/代码集合，改写为清晰的背景描述 + 明确问题（2–5 句）；不要整段粘贴代码或命令。",
    "6. difficulty：easy/medium/hard，按面试考察深度判断。",
    "7. tags：逗号分隔的 2–4 个关键词。",
    "8. followUps：3–5 个追问，由浅入深（细节澄清 → 边界/权衡 → 扩展延伸 → 实战关联），每条只含一个问题。",
    "9. keyPoints：评分要点（正确答案应覆盖的关键点，供评分对照，不向候选人展示）；以材料内容为据，不要编造材料中没有的结论。",
    `10. source：固定填 "${file.source}"。`,
    "",
    "【输出契约】只输出一个 JSON 数组（不要 markdown 代码块、不要任何解释文字），元素结构：",
    `{"category":"...","title":"...","content":"...","difficulty":"...","tags":"...","followUps":["..."],"keyPoints":"...","source":"..."}`,
    retryHint ? `\n【上次失败原因】${retryHint}，请修正后重新输出。` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const content =
    file.content.length > MAX_CONTENT_CHARS
      ? `${file.content.slice(0, MAX_CONTENT_CHARS)}\n\n（材料过长，已截断）`
      : file.content;
  return [
    { role: "system", content: system },
    { role: "user", content: `【材料路径】${file.path}\n\n【材料正文】\n${content}` },
  ];
}

async function extractFromFile(file: ScopedFile): Promise<BankExtractItem[]> {
  let retryHint: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatCompletion(buildMessages(file, retryHint));
      const arr = extractJsonArray(raw);
      if (!Array.isArray(arr)) throw new Error("响应不是 JSON 数组");
      return arr.map((i) => bankExtractItemSchema.parse(i));
    } catch (err) {
      retryHint = (err as Error).message.slice(0, 300);
      if (attempt === 1) throw new Error(`两次尝试均失败：${retryHint}`);
    }
  }
  throw new Error("unreachable");
}

async function runGenerate(outDir: string): Promise<void> {
  if (!env.LLM_API_KEY) throw new Error("未配置 LLM_API_KEY，无法生成题库");
  const checkpointFile = path.join(outDir, ".bank-checkpoint.jsonl");
  const outputFile = path.join(outDir, `question-bank.${REPO}.json`);
  await mkdir(outDir, { recursive: true });

  // 加载断点
  const done = new Map<string, BankExtractItem[]>();
  try {
    const lines = (await readFile(checkpointFile, "utf8")).split("\n").filter(Boolean);
    for (const line of lines) {
      const rec = JSON.parse(line) as { path: string; questions: BankExtractItem[] };
      done.set(rec.path, rec.questions);
    }
  } catch {
    // 无断点文件，从头开始
  }

  console.log("拉取仓库文件…");
  const { commitSha, files } = await fetchRepoFiles(OWNER, REPO);
  const scoped = scopeFiles(files);
  const todo = scoped.filter((f) => !done.has(f.path));
  console.log(
    `commit: ${commitSha || "(未知)"}；范围内文件 ${scoped.length} 个，已完成 ${done.size} 个，待生成 ${todo.length} 个`,
  );

  let finished = done.size;
  let failed = 0;
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < todo.length) {
      const file = todo[cursor++];
      const started = Date.now();
      try {
        const questions = await extractFromFile(file);
        await appendFile(checkpointFile, `${JSON.stringify({ path: file.path, questions })}\n`);
        done.set(file.path, questions);
        finished += 1;
        console.log(
          `[${finished}/${scoped.length}] ${file.path} → ${questions.length} 题（${((Date.now() - started) / 1000).toFixed(1)}s）`,
        );
      } catch (err) {
        failed += 1;
        finished += 1;
        console.warn(
          `[${finished}/${scoped.length}] ${file.path} 生成失败（跳过）：${(err as Error).message}`,
        );
      }
    }
  });
  await Promise.all(workers);

  // 聚合落盘：按路径排序，赋 sourceKey
  const all: Array<BankImportItem> = [];
  for (const p of [...done.keys()].sort()) {
    done.get(p)!.forEach((q, i) => {
      all.push({ ...q, sourceKey: `bank:${REPO}:${p}#${i}` });
    });
  }
  await writeFile(
    outputFile,
    `${JSON.stringify({ repo: REPO, commitSha, generatedAt: new Date().toISOString(), model: env.LLM_MODEL, questions: all }, null, 2)}\n`,
  );
  console.log(`\n完成：${all.length} 题（失败跳过 ${failed} 个文件）→ ${outputFile}`);
  console.log("下一步：cli bank:import");
}

// ---------------------------------------------------------------------------
// bank:import（静态 JSON → question.bankImport 幂等入库）
// ---------------------------------------------------------------------------

interface BankFile {
  repo: string;
  questions: BankImportItem[];
}

async function runImport(file: string): Promise<void> {
  const bank = JSON.parse(await readFile(file, "utf8")) as BankFile;
  // 仅 ai-infra-notes 生成产物按旧四分类（cpp/cuda/project）抽取，现行分类体系下
  // 全部归 knowledge（cuda 分类仅收 leetgpu 编程题），导入时统一改写；
  // 其他题库（如 leetcode-10w）保留文件内分类
  if (bank.repo === REPO) for (const q of bank.questions) q.category = "knowledge";
  const items = bank.questions.map((q) => bankImportItemSchema.parse(q));

  const caller = await getCaller();
  console.log(dimLine(`题库文件 ${items.length} 题，导入中…`));
  const stats = await caller.question.bankImport({
    items,
    bankSourceKeyPrefix: `bank:${bank.repo}:`,
    replaceSourceKeyPrefix: `${bank.repo}:`,
  });
  console.log(
    successLine(
      `导入完成：新增 ${stats.inserted} · 更新 ${stats.updated} · 未变 ${stats.unchanged} · bank 失效 ${stats.bankStale} · 规则题标记失效 ${stats.replacedStale}`,
    ),
  );
}

// ---------------------------------------------------------------------------

export function registerBankCommands(program: Command): void {
  program
    .command("bank:generate")
    .description("LLM 从 ai-infra-notes 抽面试题 → 静态 JSON（断点续跑，离线批处理）")
    .option("-o, --out <dir>", "产物目录", DATA_DIR)
    .action(async (opts) => {
      try {
        await runGenerate(path.resolve(opts.out));
        process.exit(0);
      } catch (err) {
        console.log(errorLine((err as Error).message));
        process.exit(1);
      }
    });

  program
    .command("bank:import [file]")
    .description("题库 JSON 幂等入库（默认 apps/cli/data/question-bank.ai-infra.json）")
    .action(async (file?: string) => {
      const target = file
        ? path.resolve(file)
        : path.join(DATA_DIR, "question-bank.ai-infra.json");
      try {
        await runImport(target);
        process.exit(0);
      } catch (err) {
        console.log(errorLine((err as Error).message));
        process.exit(1);
      }
    });
}
