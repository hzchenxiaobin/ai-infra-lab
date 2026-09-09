// gpu-skill-map.ts —— 运行时解析 problems-gpu/SKILL.md 的两张表：
//   §1.4 完整题目清单：编号 ↔ 平台 slug ↔ 难度（用于把正文里的
//        leetgpu.com/challenges/<slug> 链接解析回 GPU 题统一 ID）
//   §1.5 题型与知识地图：编号 → 领域字母 + 知识点行（GPU 题 knowledge_points 的来源）
// SKILL.md 是这两份映射的事实来源；本文件只负责解析，领域元数据在 knowledge-points.ts。
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT, slugify } from "./util.ts";

export interface SkillEntry {
  num: number;
  slug: string;
  name: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface DomainAssignment {
  /** 领域字母（A–L） */
  domain: string;
  /** 该题在领域表「知识点」列中匹配到的知识点（原文，调用方 slugify） */
  points: string[];
}

export interface GpuSkillMap {
  /** 平台 slug → 题目元数据 */
  bySlug: Map<string, SkillEntry>;
  /** `${difficulty}:${num}` → 领域归属（§1.5 的编号是平台编号，按难度消歧） */
  domainByNum: Map<string, DomainAssignment>;
  /** 规范化题名 → 领域归属（编号错位时的兜底匹配） */
  domainByName: Map<string, DomainAssignment>;
}

const DIFF_HEADING: [RegExp, "easy" | "medium" | "hard"][] = [
  [/简单（Easy/, "easy"],
  [/中等（Medium/, "medium"],
  [/困难（Hard/, "hard"],
];

function normName(s: string): string {
  return slugify(s.replace(/\([^)]*\)/g, ""));
}

let cache: GpuSkillMap | null = null;

/**
 * 正文链接里的平台 slug 与 §1.4 表 slug 不一致时的别名表（平台真实 URL slug →
 * 本地目录定位键 `${difficulty}:${目录序号}`）。来源：backfill 首跑未解析清单。
 */
export const PLATFORM_SLUG_ALIASES: Record<string, { difficulty: "easy" | "medium" | "hard"; num: number }> = {
  "general-matrix-multiplication-gemm": { difficulty: "medium", num: 22 },
  "fp16-batched-matrix-multiplication": { difficulty: "medium", num: 57 },
  layernorm: { difficulty: "medium", num: 115 },
  attention: { difficulty: "hard", num: 109 },
  "element-reversal": { difficulty: "easy", num: 111 },
};

export function loadGpuSkillMap(): GpuSkillMap {
  if (cache) return cache;
  const file = path.join(CONTENT_ROOT, "problems-gpu", "SKILL.md");
  const text = fs.readFileSync(file, "utf8");

  const bySlug = new Map<string, SkillEntry>();
  const domainByNum = new Map<string, DomainAssignment>();
  const domainByName = new Map<string, DomainAssignment>();

  // ── §1.4：| 编号 | slug | 题目 | 核心概念 |，按难度小节归属 ──
  const sec14 = text.match(/### 1\.4[\s\S]*?(?=\n### 1\.5)/);
  if (sec14) {
    let diff: "easy" | "medium" | "hard" | null = null;
    for (const line of sec14[0].split("\n")) {
      const h = line.match(/^####\s+(.+)$/);
      if (h) {
        diff = DIFF_HEADING.find(([re]) => re.test(h![1]))?.[1] ?? diff;
        continue;
      }
      const row = line.match(/^\|\s*(\d+)\s*\|\s*([a-z0-9-]+)\s*\|\s*([^|]+?)\s*\|/);
      if (row && diff) {
        const entry: SkillEntry = {
          num: +row[1],
          slug: row[2],
          name: row[3].trim(),
          difficulty: diff,
        };
        bySlug.set(entry.slug, entry);
      }
    }
  }

  // ── §1.5：#### X. 领域名 下的 | 知识点 | 说明 | 对应题目 | ──
  const sec15 = text.match(/### 1\.5[\s\S]*?(?=\n### 1\.6|\n## 2\.)/);
  if (sec15) {
    let domain: string | null = null;
    for (const line of sec15[0].split("\n")) {
      const h = line.match(/^####\s+([A-L])\.\s/);
      if (h) {
        domain = h[1];
        continue;
      }
      if (!domain || !line.startsWith("|")) continue;
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length < 5 || /^[-: ]+$/.test(cells[1]) || cells[1] === "知识点") continue;
      const point = cells[1];
      const refs = cells[3] ?? "";
      for (const rm of refs.matchAll(/#(\d+)\s+([^,，]+)/g)) {
        const num = +rm[1];
        const name = rm[2].trim();
        // 同一编号可能在多个知识点行出现：知识点累加
        for (const [key, map] of [
          [`num:${num}`, domainByNum],
          [`name:${normName(name)}`, domainByName],
        ] as const) {
          const prev = map.get(key);
          if (prev && prev.domain === domain) {
            if (!prev.points.includes(point)) prev.points.push(point);
          } else if (!prev) {
            map.set(key, { domain, points: [point] });
          }
        }
      }
    }
  }

  cache = { bySlug, domainByNum, domainByName };
  return cache;
}

/** 查 GPU 题的领域归属。编号与名称都查：一致则用之；冲突时信名称（编号有
 *  #109/#110/#113/#114 官方错位与跨难度同号问题）；只有一路命中时用命中那路 */
export function lookupDomain(
  map: GpuSkillMap,
  difficulty: "easy" | "medium" | "hard",
  dirNum: number,
  dirName: string,
): DomainAssignment | null {
  const byNum = map.domainByNum.get(`num:${dirNum}`);
  const byName = map.domainByName.get(`name:${normName(dirName.replace(/-/g, " "))}`);
  if (byNum && byName) return byNum.domain === byName.domain ? byNum : byName;
  return byNum ?? byName ?? null;
}
