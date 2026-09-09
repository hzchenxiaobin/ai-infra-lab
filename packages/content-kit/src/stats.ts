// stats.ts —— 构建期统计注入：各分区内容数 / 难度分布 / 知识点覆盖。
// 手写统计的替代口径来源（04 §编号与口径修正：文案禁止手写总数）。
// 输出到 stdout，同时写 dist/stats.json 供构建期注入。
import fs from "node:fs";
import path from "node:path";
import { scanContent } from "./content.ts";
import { loadGpuSkillMap, lookupDomain } from "./gpu-skill-map.ts";
import { GPU_DOMAINS, GPU_DOMAIN_SUPPLEMENT, VOCAB } from "./knowledge-points.ts";
import { DIST_DIR } from "./util.ts";

const files = scanContent();
const skillMap = loadGpuSkillMap();

const byPartitionType = new Map<string, number>();
const byDifficulty = new Map<string, number>();
const bySource = new Map<string, number>();
const kpCount = new Map<string, number>();
const gpuDomainCount = new Map<string, number>();
const weeks = new Set<number>();
const topicDirs = new Set<string>();
let paperDone = 0;
let paperSkeleton = 0;

const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

for (const f of files) {
  inc(byPartitionType, `${f.cls.partition}/${f.cls.type}`);
  if (f.cls.type === "problem") {
    inc(byDifficulty, String(f.existing.difficulty ?? "unknown"));
    inc(bySource, String(f.existing.source ?? "unknown"));
  }
  if (f.cls.week != null && /^learn:w\d{2}d\d{2}$/.test(f.cls.id)) weeks.add(f.cls.week);
  if (f.cls.topic && f.cls.id === `learn:topic:${f.cls.topic}`) topicDirs.add(f.cls.topic);
  if (f.cls.type === "paper") {
    if (f.existing.status === "skeleton") paperSkeleton++;
    else paperDone++;
  }
  if (f.cls.gpuKey) {
    const dom = lookupDomain(skillMap, f.cls.pathDifficulty!, f.cls.gpuKey.num, f.cls.gpuKey.name);
    const letter =
      dom?.domain ?? GPU_DOMAIN_SUPPLEMENT[`${f.cls.pathDifficulty}:${f.cls.gpuKey.name}`];
    if (letter) inc(gpuDomainCount, `${letter} ${GPU_DOMAINS[letter]?.slug ?? "?"}`);
    else inc(gpuDomainCount, "? 未匹配");
  }
  const kps = f.existing.knowledge_points;
  if (Array.isArray(kps)) for (const kp of kps) inc(kpCount, String(kp));
}

const topKp = [...kpCount.entries()].sort((a, b) => b[1] - a[1]);
const unusedVocab = [...VOCAB].filter((kp) => !kpCount.has(kp));

const stats = {
  generated_at: new Date().toISOString().slice(0, 10),
  total_files: files.length,
  by_partition_type: Object.fromEntries(byPartitionType),
  problems: {
    total: files.filter((f) => f.cls.type === "problem").length,
    by_source: Object.fromEntries(bySource),
    by_difficulty: Object.fromEntries(byDifficulty),
  },
  learn: {
    course_weeks: weeks.size,
    topics: topicDirs.size,
    papers_done: paperDone,
    papers_skeleton: paperSkeleton,
  },
  gpu_domains: Object.fromEntries([...gpuDomainCount.entries()].sort()),
  knowledge_points: {
    distinct_used: kpCount.size,
    vocab_size: VOCAB.size,
    vocab_unused: unusedVocab,
    top30: topKp.slice(0, 30),
  },
};

console.log("== stats（构建期注入口径）==");
console.log(`内容文件总数: ${stats.total_files}`);
console.log("\n分区 × 类型:");
for (const [k, v] of [...byPartitionType.entries()].sort()) console.log(`  ${k}: ${v}`);
console.log(`\n题目总数: ${stats.problems.total}`);
console.log("  来源分布:", JSON.stringify(stats.problems.by_source));
console.log("  难度分布:", JSON.stringify(stats.problems.by_difficulty));
console.log(`\n课程: ${weeks.size} 周 | 专题: ${topicDirs.size} | 论文: done ${paperDone} / skeleton ${paperSkeleton}`);
console.log("\nGPU 知识领域分布:");
for (const [k, v] of [...gpuDomainCount.entries()].sort()) console.log(`  ${k}: ${v}`);
console.log(`\n知识点: 词表 ${VOCAB.size} | 实际使用 ${kpCount.size} distinct | 词表未用 ${unusedVocab.length}`);
console.log("知识点 top 30:");
for (const [kp, n] of topKp.slice(0, 30)) console.log(`  ${kp}: ${n}`);

fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, "stats.json"), JSON.stringify(stats, null, 2));
console.log(`\n已写入 dist/stats.json`);
