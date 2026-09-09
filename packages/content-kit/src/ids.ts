// ids.ts —— 统一 ID 方案：路径 → ID 的唯一推导入口（parseId / classify / validateId）。
// 所有管线代码经 classify() 得到 ID，不手拼字符串。
//
// 规则（03-data-model.md §统一题目 ID 方案 + 对真实目录结构的落地）：
//   learn/daily/weekN/dayM/README.md            → learn:w{NN}d{MM}
//   learn/daily/weekN/README.md                 → learn:w{NN}
//   learn/daily/weekN/dayM/<sub>/<name>.md      → learn:w{NN}d{MM}:{sub}:{slug}
//   learn/daily/weekN/<sub>/<name>.md           → learn:w{NN}:{sub}:{slug}
//   learn/daily/plan/<name>.md                  → learn:plan:{slug}
//   learn/daily/reference/<name>.md             → learn:reference:{slug}
//   learn/daily/README.md                       → learn:path
//   learn/topics/<t>/README.md                  → learn:topic:{slug}
//   learn/topics/<t>/dayN.md                    → learn:topic:{slug}:d{N}
//   learn/topics/<t>/<sub>/<name>.md            → learn:topic:{slug}:{sub}:{slug}
//   learn/paper/<slug>/README.md                → paper:{slug}
//   learn/profiling/...                         → profiling:{...}（见下）
//   problems-algo/solution/<区间>/<num>_<名>.md → lc:{num:04d}
//   problems-algo/solution/<区间>/LCOF<n>_*.md  → lc:lcof:{n}（剑指 Offer 无官方数字题号）
//   problems-algo/contest/<场次>/Q<q>.*.md      → lc:contest:{场次}q{q}
//   problems-algo/topics/<名>.md                → lc:topic:{slug}
//   problems-algo/hot-interview.md 等题单       → lc:list:{slug}
//   problems-gpu/solutions/<难度>/<编号>-<名>/  → gpu:{e|m|h}:{编号:03d}
//     （目录序号是 ID 真相；同难度内序号冲突时追加 a/b 后缀消歧，见 resolveGpuCollisions）
//   problems-gpu/cuda-interview-notes.md        → learn:note:cuda-interview-notes
//
// SKILL.md（含文件名带前导空白的变体）与 packages/content/README.md 是
// 写作规范/仓库说明，不是站点内容，classify() 返回 null 排除在管线外。

import { slugify, slugifyCamel } from "./util.ts";

export type ContentType = "learn" | "problem" | "paper" | "profiling";
export type Partition = "learn" | "problems-algo" | "problems-gpu";
export type Difficulty = "easy" | "medium" | "hard";
export type ProblemSource = "leetcode" | "leetgpu" | "contest";

export interface Classification {
  id: string;
  type: ContentType;
  partition: Partition;
  url: string;
  /** type=learn 附加 */
  week?: number;
  day?: number;
  topic?: string;
  /** type=problem 附加（路径侧可确定的） */
  source?: ProblemSource;
  pathNumber?: number;
  pathDifficulty?: Difficulty;
  /** gpu 冲突消歧用 */
  gpuKey?: { diff: "e" | "m" | "h"; num: number; name: string };
}

const DIFF_LETTER: Record<string, "e" | "m" | "h"> = { easy: "e", medium: "m", hard: "h" };
const DIFF_FULL: Record<"e" | "m" | "h", Difficulty> = {
  e: "easy",
  m: "medium",
  h: "hard",
};

const pad = (n: number | string, w: number) => String(n).padStart(w, "0");

export function classify(rel: string): Classification | null {
  const base = rel.split("/").pop() ?? rel;
  if (base.trim() === "SKILL.md") return null;
  if (rel === "README.md") return null;

  let m: RegExpMatchArray | null;

  // ── learn/daily ──
  if ((m = rel.match(/^learn\/daily\/week(\d+)\/day(\d+)\/README\.md$/))) {
    const week = +m[1], day = +m[2];
    return {
      id: `learn:w${pad(week, 2)}d${pad(day, 2)}`,
      type: "learn",
      partition: "learn",
      url: `/learn/week${week}/day${day}`,
      week,
      day,
    };
  }
  if ((m = rel.match(/^learn\/daily\/week(\d+)\/README\.md$/))) {
    const week = +m[1];
    return {
      id: `learn:w${pad(week, 2)}`,
      type: "learn",
      partition: "learn",
      url: `/learn/week${week}`,
      week,
    };
  }
  if ((m = rel.match(/^learn\/daily\/week(\d+)\/day(\d+)\/(.+)\.md$/))) {
    const week = +m[1], day = +m[2];
    const sub = m[3].split("/").map(slugify).join(":");
    return {
      id: `learn:w${pad(week, 2)}d${pad(day, 2)}:${sub}`,
      type: "learn",
      partition: "learn",
      url: `/learn/week${week}/day${day}/${m[3].split("/").map(slugify).join("/")}`,
      week,
      day,
    };
  }
  if ((m = rel.match(/^learn\/daily\/week(\d+)\/(.+)\.md$/))) {
    const week = +m[1];
    const sub = m[2].split("/").map(slugify).join(":");
    return {
      id: `learn:w${pad(week, 2)}:${sub}`,
      type: "learn",
      partition: "learn",
      url: `/learn/week${week}/${m[2].split("/").map(slugify).join("/")}`,
      week,
    };
  }
  if ((m = rel.match(/^learn\/daily\/plan\/(.+)\.md$/))) {
    const sub = m[1].split("/").map(slugify).join(":");
    return {
      id: `learn:plan:${sub}`,
      type: "learn",
      partition: "learn",
      url: `/learn/plan/${m[1].split("/").map(slugify).join("/")}`,
    };
  }
  if ((m = rel.match(/^learn\/daily\/reference\/(.+)\.md$/))) {
    return {
      id: `learn:reference:${slugify(m[1])}`,
      type: "learn",
      partition: "learn",
      url: `/learn/reference/${slugify(m[1])}`,
    };
  }
  if (rel === "learn/daily/README.md") {
    return { id: "learn:path", type: "learn", partition: "learn", url: "/learn/path" };
  }

  // ── learn/topics ──
  if ((m = rel.match(/^learn\/topics\/([^/]+)\/README\.md$/))) {
    const topic = slugifyCamel(m[1]);
    return {
      id: `learn:topic:${topic}`,
      type: "learn",
      partition: "learn",
      url: `/learn/topics/${topic}`,
      topic,
    };
  }
  if ((m = rel.match(/^learn\/topics\/([^/]+)\/day(\d+)\.md$/))) {
    const topic = slugifyCamel(m[1]);
    return {
      id: `learn:topic:${topic}:d${+m[2]}`,
      type: "learn",
      partition: "learn",
      url: `/learn/topics/${topic}/day${+m[2]}`,
      topic,
      day: +m[2],
    };
  }
  if ((m = rel.match(/^learn\/topics\/([^/]+)\/(.+)\.md$/))) {
    const topic = slugifyCamel(m[1]);
    const sub = m[2].split("/").map(slugify).join(":");
    return {
      id: `learn:topic:${topic}:${sub}`,
      type: "learn",
      partition: "learn",
      url: `/learn/topics/${topic}/${m[2].split("/").map(slugify).join("/")}`,
      topic,
    };
  }

  // ── learn/paper ──
  if ((m = rel.match(/^learn\/paper\/([^/]+)\/README\.md$/))) {
    const slug = slugify(m[1]);
    return {
      id: `paper:${slug}`,
      type: "paper",
      partition: "learn",
      url: `/learn/papers/${slug}`,
    };
  }

  // ── learn/profiling ──
  if (rel === "learn/profiling/README.md") {
    return { id: "profiling:index", type: "profiling", partition: "learn", url: "/learn/profiling" };
  }
  if ((m = rel.match(/^learn\/profiling\/week(\d+)\/day(\d+)\/README\.md$/))) {
    return {
      id: `profiling:w${+m[1]}d${+m[2]}`,
      type: "profiling",
      partition: "learn",
      url: `/learn/profiling/week${+m[1]}/day${+m[2]}`,
    };
  }
  if ((m = rel.match(/^learn\/profiling\/week(\d+)\/day(\d+)\/([^/]+)\/README\.md$/))) {
    return {
      id: `profiling:w${+m[1]}d${+m[2]}:${slugify(m[3])}`,
      type: "profiling",
      partition: "learn",
      url: `/learn/profiling/week${+m[1]}/day${+m[2]}/${slugify(m[3])}`,
    };
  }
  if ((m = rel.match(/^learn\/profiling\/(?:([^/]+)\/)?([^/]+)\.md$/))) {
    const slug = m[1] ? `${slugify(m[1])}:${slugify(m[2])}` : slugify(m[2]);
    return {
      id: `profiling:${slug}`,
      type: "profiling",
      partition: "learn",
      url: `/learn/profiling/${m[1] ? slugify(m[1]) + "/" : ""}${slugify(m[2])}`,
    };
  }

  // ── problems-algo/solution ──
  if (rel === "problems-algo/solution/INDEX.md") {
    return {
      id: "lc:index",
      type: "learn",
      partition: "problems-algo",
      url: "/problems/algo",
    };
  }
  if ((m = rel.match(/^problems-algo\/solution\/\d{4}-\d{4}\/(\d+)_[^/]*\.md$/))) {
    return {
      id: `lc:${pad(+m[1], 4)}`,
      type: "problem",
      partition: "problems-algo",
      url: `/problems/algo/${pad(+m[1], 4)}`,
      source: "leetcode",
      pathNumber: +m[1],
    };
  }
  if ((m = rel.match(/^problems-algo\/solution\/\d{4}-\d{4}\/LCOF(\d+)_[^/]*\.md$/))) {
    return {
      id: `lc:lcof:${+m[1]}`,
      type: "problem",
      partition: "problems-algo",
      url: `/problems/algo/lcof-${+m[1]}`,
      source: "leetcode",
      pathNumber: +m[1],
    };
  }

  // ── problems-algo/contest ──
  if ((m = rel.match(/^problems-algo\/contest\/(\d+)\/Q(\d)\.[^/]*\.md$/))) {
    return {
      id: `lc:contest:${+m[1]}q${+m[2]}`,
      type: "problem",
      partition: "problems-algo",
      url: `/problems/contest/${+m[1]}/q${+m[2]}`,
      source: "contest",
    };
  }

  // ── problems-algo/topics、题单 ──
  if ((m = rel.match(/^problems-algo\/topics\/([^/]+)\.md$/))) {
    const slug = slugify(m[1]);
    return {
      id: `lc:topic:${slug}`,
      type: "learn",
      partition: "problems-algo",
      url: `/problems/algo/topics/${slug}`,
      topic: `algo-${slug}`,
    };
  }
  if ((m = rel.match(/^problems-algo\/(hot-interview|10-week-plan)\.md$/))) {
    return {
      id: `lc:list:${m[1]}`,
      type: "learn",
      partition: "problems-algo",
      url: `/problems/lists/${m[1]}`,
    };
  }

  // ── problems-gpu ──
  if (
    (m = rel.match(/^problems-gpu\/solutions\/(easy|medium|hard)\/(\d+)-([^/]+)\/index\.md$/))
  ) {
    const diff = DIFF_LETTER[m[1]];
    return {
      id: `gpu:${diff}:${pad(+m[2], 3)}`,
      type: "problem",
      partition: "problems-gpu",
      url: `/problems/gpu/${m[1]}/${m[2]}-${m[3]}`,
      source: "leetgpu",
      pathNumber: +m[2],
      pathDifficulty: DIFF_FULL[diff],
      gpuKey: { diff, num: +m[2], name: m[3] },
    };
  }
  if (rel === "problems-gpu/cuda-interview-notes.md") {
    return {
      id: "learn:note:cuda-interview-notes",
      type: "learn",
      partition: "problems-gpu",
      url: "/learn/notes/cuda-interview-notes",
    };
  }

  return null;
}

/** ID 形态校验：分区前缀 + 冒号分段，段内允许字母/数字/._/- 与 CJK */
export function validateId(id: string): boolean {
  return /^(learn|paper|profiling|lc|gpu|q)(:[\p{L}\p{N}][\p{L}\p{N}._-]*)+$/u.test(id);
}

export function idPrefix(id: string): string {
  return id.split(":")[0];
}
