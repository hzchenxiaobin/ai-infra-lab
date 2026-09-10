// run.ts —— 本机 exec 判题运行（server 内置 in-process worker 的过渡执行路径，
// dev/judge-worker.md §5：judge-worker 沙箱落地后从生产路径下线，保留用于开发）。
// 生产执行走 judge-worker 的 Docker runner（同一份 driver/compare/verdict）。
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCppSource, buildPythonSource } from "./driver.js";
import { outputsEqual } from "./compare.js";
import type { CaseResult, JudgeRunResult } from "./verdict.js";
import type { ExampleCase, MethodSpec } from "./parse.js";

const COMPILE_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 8_000;
const MAX_OUTPUT = 64 * 1024;

export function runJudge(opts: {
  language: "cpp" | "python";
  code: string;
  spec: MethodSpec;
  cases: ExampleCase[];
}): JudgeRunResult {
  const { language, code, spec, cases } = opts;
  if (cases.length === 0) return { status: "no_cases", cases: [], passed: 0, total: 0 };

  const workDir = mkdtempSync(path.join(tmpdir(), "judge-"));
  try {
    const bin = language === "cpp" ? compile(workDir, code, spec) : preparePython(workDir, code, spec.name);
    if (typeof bin !== "string") return bin; // compile_error

    const results = cases.map((c) => runCase(workDir, bin, language, c));
    const passed = results.filter((r) => r.pass).length;
    return { status: "ok", cases: results, passed, total: results.length };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** 编译 C++；成功返回可执行文件名，失败返回 JudgeRunResult */
function compile(workDir: string, userCode: string, spec: MethodSpec): string | JudgeRunResult {
  writeFileSync(path.join(workDir, "main.cpp"), buildCppSource(userCode, spec));
  try {
    execFileSync("g++", ["-std=c++17", "-O2", "-o", "main", "main.cpp"], {
      cwd: workDir,
      timeout: COMPILE_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "main";
  } catch (err) {
    const e = err as { stderr?: Buffer; message: string };
    return {
      status: "compile_error",
      compileError: (e.stderr?.toString() || e.message).slice(0, 4000),
      cases: [],
      passed: 0,
      total: 0,
    };
  }
}

function preparePython(workDir: string, userCode: string, methodName: string): string {
  writeFileSync(path.join(workDir, "main.py"), buildPythonSource(userCode, methodName));
  return "main.py";
}

function runCase(workDir: string, bin: string, language: "cpp" | "python", c: ExampleCase): CaseResult {
  const inputJson = buildInputJson(c);
  const base = { input: c.input, expected: c.expected };
  if (!inputJson) {
    return { ...base, actual: "", pass: false, error: "用例输入不是合法 JSON，跳过" };
  }
  const [cmd, args] =
    language === "cpp" ? [path.join(workDir, bin), []] : ["python3", [path.join(workDir, bin)]];
  try {
    const out = execFileSync(cmd, args, {
      cwd: workDir,
      input: inputJson,
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const actual = out.toString().trim();
    return { ...base, actual, pass: outputsEqual(actual, c.expected), error: null };
  } catch (err) {
    const e = err as { killed?: boolean; signal?: string; stderr?: Buffer; stdout?: Buffer; message: string };
    const actual = (e.stdout?.toString() ?? "").trim();
    const stderr = (e.stderr?.toString() ?? "").trim();
    const error = e.killed || e.signal === "SIGTERM" ? `运行超时（>${RUN_TIMEOUT_MS / 1000}s）` : stderr.slice(0, 2000) || e.message;
    return { ...base, actual, pass: false, error };
  }
}

/** 示例参数 → JSON 对象文本（参数名来自题面赋值，顺序即签名顺序） */
export function buildInputJson(c: ExampleCase): string | null {
  try {
    const obj: Record<string, unknown> = {};
    for (const a of c.args) obj[a.name] = JSON.parse(a.value);
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}
