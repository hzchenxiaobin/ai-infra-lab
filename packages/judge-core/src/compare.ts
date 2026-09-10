// compare.ts —— 输出比对：JSON 深比较（数值容差 1e-5）；失败再试无序数组规范化；
// 兜底字符串。server 与 judge-worker（Docker 执行器回收结果后比对）必须同源，
// 故比对逻辑收敛在本包（02 架构：输出比对规则两端一致）。

export function outputsEqual(actual: string, expected: string): boolean {
  if (actual.trim() === expected.trim()) return true;
  const a = tryJson(actual);
  const e = tryJson(expected);
  if (a.ok && e.ok) {
    if (deepEqual(a.v, e.v)) return true;
    // 无序兜底仅用于二维数组（如字母异位词分组），一维数组顺序敏感
    if (Array.isArray(a.v) && Array.isArray(e.v) && a.v.every(Array.isArray) && e.v.every(Array.isArray)) {
      return canonical(a.v) === canonical(e.v);
    }
  }
  return false;
}

function tryJson(s: string): { ok: true; v: unknown } | { ok: false } {
  try {
    return { ok: true, v: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

/** 无序比较兜底：递归排序数组（如字母异位词分组答案顺序不限） */
function canonical(v: unknown): string {
  if (Array.isArray(v)) {
    const items = v.map(canonical).sort();
    return `[${items.join(",")}]`;
  }
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
      .sort();
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(v) ?? "";
}
