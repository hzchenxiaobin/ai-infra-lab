// judge-extract.ts —— 判题数据提取（构建期）：从题解 md 解析示例用例与参考签名，
// 产出 problems.testcases 与 problems.judge_meta（judge 数据源切换，2026-09-10 第六批）。
// 解析规则与 server/src/judge/parse.ts 保持一致（评测核心纯函数两端各持一份，
// 本文件服务构建期入库，server 侧服务运行期 harness 生成）。
import type { ProblemJudgeMeta, ProblemTestcase } from "../../contracts/src/index.ts";

/** 从题解 markdown 提取某语言的参考代码块（### C++ / ### Python 小节，标题可带后缀） */
export function extractReferenceCode(md: string, language: "cpp" | "python"): string | null {
  const heading = language === "cpp" ? /^###\s*C\+\+/m : /^###\s*Python/m;
  const h = heading.exec(md);
  if (!h) return null;
  const rest = md.slice(h.index + h[0].length);
  const end = /^#{2,3}\s/m.exec(rest);
  const section = end ? rest.slice(0, end.index) : rest;
  const fence = /```(?:cpp|c\+\+|python|py)?\s*\n([\s\S]*?)```/.exec(section);
  return fence ? fence[1].trim() : null;
}

/** 规范化 C++ 类型：去 const/&/* 与多余空白 */
function canonicalType(raw: string): string {
  return raw
    .replace(/\bconst\b/g, "")
    .replace(/[&*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*<\s*/g, "<")
    .replace(/\s*>\s*/g, ">")
    .replace(/\s*,\s*/g, ",");
}

/** 按顶层分隔符切分（考虑 <> 嵌套） */
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "<" || ch === "(" || ch === "[") depth += 1;
    else if (ch === ">" || ch === ")" || ch === "]") depth -= 1;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

interface CppSpec {
  name: string;
  params: Array<{ name: string; type: string }>;
  returnType: string;
}

function parseCppSignature(code: string): CppSpec | null {
  const cls = /class\s+Solution\s*(?::\s*public\s+\w+)?\s*\{([\s\S]*)\}\s*;/.exec(code);
  if (!cls) return null;
  // 剥离访问控制与 static，避免被吞进返回类型
  const body = cls[1].replace(/\b(public|private|protected)\s*:/g, " ").replace(/\bstatic\s+/g, "");
  const m = /([\w:<>,\s&*]+?)\s+(\w+)\s*\(([^)]*)\)\s*\{/.exec(body);
  if (!m) return null;
  const params = splitTopLevel(m[3], ",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const noDefault = p.split("=")[0].trim();
      const pm = /^(.+?)\s+(\w+)$/.exec(noDefault);
      return pm ? { name: pm[2], type: canonicalType(pm[1]) } : null;
    });
  if (params.some((p) => p == null)) return null;
  return { name: m[2], params: params as CppSpec["params"], returnType: canonicalType(m[1]) };
}

function parsePythonMethodName(code: string): string | null {
  const m = /def\s+(\w+)\s*\(\s*self/.exec(code);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// 示例用例解析（```text 块中的 输入/输出 对）
// ---------------------------------------------------------------------------

interface ExampleArg {
  name: string;
  value: string;
}

/** 从题面提取示例用例（对齐 server judge/parse.ts 的 parseExamples） */
export function parseExamples(md: string): ProblemTestcase[] {
  const cases: ProblemTestcase[] = [];
  for (const fence of md.matchAll(/```\w*\n([\s\S]*?)```/g)) {
    const block = fence[1];
    const m = /输入[:：]\s*\n?([\s\S]*?)输出[:：]\s*\n?([\s\S]*?)(?:\n\s*解释|$)/.exec(block);
    if (!m) continue;
    const input = m[1].trim();
    const expected = m[2].split("\n")[0].trim();
    const args = parseAssignments(input);
    if (args.length > 0 && expected) cases.push({ args, expected });
  }
  return cases;
}

/** 解析 `name = value` 赋值（值按括号配平支持跨行；同行逗号分隔的多赋值也会拆开） */
function parseAssignments(text: string): ExampleArg[] {
  const args: ExampleArg[] = [];
  let current: ExampleArg | null = null;
  let depth = 0;
  for (const line of text.split("\n")) {
    for (const seg of splitAssignments(line)) {
      const assign = /^\s*([\w\u4e00-\u9fa5]+)\s*=\s*(.*)$/.exec(seg);
      if (assign && depth === 0) {
        if (current) args.push(current);
        current = { name: assign[1], value: assign[2].trim() };
        depth = bracketDelta(current.value);
      } else if (current) {
        current.value += seg.trim();
        depth += bracketDelta(seg);
      }
      if (current && depth <= 0) {
        args.push(current);
        current = null;
        depth = 0;
      }
    }
  }
  if (current) args.push(current);
  return args;
}

/** 把 `a = 1, b = "x"` 拆成独立赋值段（顶层逗号 + 后随 `name =`；忽略字符串内的逗号） */
function splitAssignments(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") inStr = !inStr;
    else if (!inStr && (ch === "[" || ch === "{")) depth += 1;
    else if (!inStr && (ch === "]" || ch === "}")) depth -= 1;
    if (ch === "," && !inStr && depth === 0 && /^\s*[\w\u4e00-\u9fa5]+\s*=/.test(line.slice(i + 1))) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function bracketDelta(s: string): number {
  let d = 0;
  for (const ch of s) {
    if (ch === "[" || ch === "{") d += 1;
    else if (ch === "]" || ch === "}") d -= 1;
  }
  return d;
}

// ---------------------------------------------------------------------------
// 判题元数据组装
// ---------------------------------------------------------------------------

export interface JudgeExtract {
  testcases: ProblemTestcase[];
  judgeMeta: ProblemJudgeMeta | null;
}

/** 从题解 md 提取判题数据：示例用例 + 参考签名元数据（无任何参考签名时 meta 为 null） */
export function extractJudgeData(md: string): JudgeExtract {
  const cppReference = extractReferenceCode(md, "cpp");
  const pyReference = extractReferenceCode(md, "python");
  const cppSpec = cppReference ? parseCppSignature(cppReference) : null;
  const pyName = pyReference ? parsePythonMethodName(pyReference) : null;

  let judgeMeta: ProblemJudgeMeta | null = null;
  if (cppSpec || pyName) {
    judgeMeta = {
      methodName: cppSpec?.name ?? pyName!,
      cppAvailable: cppSpec != null,
      cppParams: cppSpec ? cppSpec.params : [],
      cppReturnType: cppSpec?.returnType ?? "",
      pythonAvailable: pyName != null,
    };
  }
  return { testcases: parseExamples(md), judgeMeta };
}

/**
 * judge_type 推导（构建期能力判定，frontmatter 的 internal/none 被实际解析能力覆盖；
 * leetgpu-com 等显式外站评测保留）：有示例用例且有参考签名 → internal，否则 none。
 */
export function deriveJudgeType(
  frontmatterJudge: string,
  { testcases, judgeMeta }: JudgeExtract,
): "internal" | "leetgpu-com" | "none" {
  if (frontmatterJudge === "leetgpu-com") return "leetgpu-com";
  return testcases.length > 0 && judgeMeta != null ? "internal" : "none";
}
