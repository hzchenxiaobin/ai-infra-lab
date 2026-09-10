// runner.ts —— Docker-out-of-Docker 评测执行（dev/judge-worker.md §3/§5）。
// 挂宿主 docker.sock 在宿主机拉起一次性容器；容器为哑执行器（algo 镜像 run.py），
// stdin 传 task.json、stdout 收 results.json；比对/终态映射用 @ailab/judge-core
// （与 server 本机 exec 路径同源，规则一致）。
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  buildCppSource,
  buildInputJson,
  buildPythonSource,
  outputsEqual,
  type CaseResult,
  type JudgeRunResult,
  type MethodSpec,
  type ExampleCase,
} from "@ailab/judge-core";
import type { ProblemJudgeMeta, ProblemTestcase } from "@ailab/contracts";
import { env } from "./env.js";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT = 4 * 1024 * 1024; // 容器 stdout 上限（逐用例输出截断在镜像内）

interface ProcResult {
  stdout: string;
  stderr: string;
  killed: boolean;
  /** docker 进程退出异常（docker 不可用等） */
  error: string | null;
}

/** spawn docker：stdin 喂 task.json，stdout 收 results.json，超时 SIGKILL */
function runDockerProc(args: string[], input: string, timeoutMs: number): Promise<ProcResult> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const cap = (cur: string, chunk: Buffer) =>
      cur.length >= MAX_OUTPUT ? cur : (cur + chunk.toString("utf8")).slice(0, MAX_OUTPUT);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      stdout = cap(stdout, d);
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr = cap(stderr, d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, killed: false, error: err.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        killed: signal === "SIGKILL" || signal === "SIGTERM",
        error: code === 0 ? null : `docker 退出码 ${code}${stderr ? `：${stderr.slice(0, 2000)}` : ""}`,
      });
    });
    child.stdin.on("error", () => {}); // 容器早退时 EPIPE 忽略
    child.stdin.end(input);
  });
}

/** 容器 stdout 回报的原始结构（run.py 协议） */
interface RawRunResult {
  status: "ok" | "compile_error";
  compileError?: string;
  cases?: Array<{
    display: string;
    expected: string;
    stdout: string;
    error: string | null;
    timeout: boolean;
  }>;
}

export interface DockerJudgeInput {
  submissionId: number;
  language: "cpp" | "python";
  code: string;
  meta: ProblemJudgeMeta;
  testcases: ProblemTestcase[];
  cases: ExampleCase[];
}

/** 组装 task.json（源码 = judge-core 生成的完整 harness） */
function buildTask(input: DockerJudgeInput): Record<string, unknown> {
  const spec: MethodSpec = {
    name: input.meta.methodName,
    params: input.meta.cppParams.map((p) => ({ ...p, raw: `${p.type} ${p.name}` })),
    returnType: input.meta.cppReturnType,
  };
  const source =
    input.language === "cpp"
      ? buildCppSource(input.code, spec)
      : buildPythonSource(input.code, input.meta.methodName);
  return {
    language: input.language,
    source,
    compileTimeoutMs: 30_000,
    caseTimeoutMs: env.JUDGE_TIMEOUT_MS,
    cases: input.cases.map((c) => ({
      inputJson: buildInputJson(c) ?? "{}",
      expected: c.expected,
      display: c.input,
    })),
  };
}

/**
 * 拉起一次性评测容器并回收结果。安全红线（§5）：无网络 / 根 fs 只读 +
 * tmpfs /work 唯一可写 / 资源与 pids 限额 / 总时限兜底强杀 / 输出截断在镜像内。
 */
export async function runInDocker(input: DockerJudgeInput): Promise<JudgeRunResult> {
  if (input.cases.length === 0) {
    return { status: "no_cases", cases: [], passed: 0, total: 0 };
  }
  const container = `ailab-judge-${input.submissionId}-${randomUUID().slice(0, 8)}`;
  const args = [
    "run",
    "--rm",
    "-i",
    "--name", container,
    "--label", "ailab-judge=1",
    "--network", "none",
    "--memory", `${env.JUDGE_MEM_MB}m`,
    "--cpus", "1",
    "--pids-limit", "128",
    "--read-only",
    // tmpfs /work：唯一可写区；mode=1777 允许非 root 的 judge 用户写入，
    // exec 允许执行编译产物（docker tmpfs 默认 noexec + root:755 会双双失败）
    "--tmpfs", "/work:rw,exec,size=64m,mode=1777",
    env.JUDGE_IMAGE,
  ];
  const proc = await runDockerProc(args, JSON.stringify(buildTask(input)), env.submissionTimeoutMs);
  if (proc.killed || proc.error) {
    // 总时限兜底 / docker 异常：强杀容器后按全用例失败回报（不残留容器）
    await execFileAsync("docker", ["rm", "-f", container]).catch(() => {});
    const error = proc.killed
      ? `评测总时限超时（>${Math.round(env.submissionTimeoutMs / 1000)}s）`
      : proc.error;
    return {
      status: "ok",
      cases: input.cases.map((c) => ({
        input: c.input,
        expected: c.expected,
        actual: "",
        pass: false,
        error,
      })),
      passed: 0,
      total: input.cases.length,
    };
  }
  // stdout 可能带 docker run 的告警行，取最后一个完整 JSON 对象
  const raw = parseTailJson(proc.stdout);
  if (!raw) {
    await execFileAsync("docker", ["rm", "-f", container]).catch(() => {});
    return {
      status: "ok",
      cases: input.cases.map((c) => ({
        input: c.input,
        expected: c.expected,
        actual: "",
        pass: false,
        error: `评测容器输出无法解析：${proc.stdout.slice(0, 500)}`,
      })),
      passed: 0,
      total: input.cases.length,
    };
  }
  return mapResult(raw, input.cases);
}

/** 取文本末尾的完整 JSON 对象（results.json 是容器 stdout 的最后一行） */
function parseTailJson(stdout: string): RawRunResult | null {
  const trimmed = stdout.trim();
  const start = trimmed.lastIndexOf('{"status"');
  try {
    return start >= 0 ? (JSON.parse(trimmed.slice(start)) as RawRunResult) : null;
  } catch {
    return null;
  }
}

/** 容器原始结果 → JudgeRunResult（比对在 worker 侧，judge-core 同源） */
function mapResult(raw: RawRunResult, cases: ExampleCase[]): JudgeRunResult {
  if (raw.status === "compile_error") {
    return {
      status: "compile_error",
      compileError: raw.compileError,
      cases: [],
      passed: 0,
      total: cases.length,
    };
  }
  const results: CaseResult[] = (raw.cases ?? []).map((c, i) => ({
    input: cases[i]?.input ?? c.display,
    expected: c.expected,
    actual: c.stdout,
    pass: !c.timeout && !c.error && outputsEqual(c.stdout, c.expected),
    error: c.timeout ? c.error : c.error,
  }));
  return {
    status: "ok",
    cases: results,
    passed: results.filter((r) => r.pass).length,
    total: results.length,
  };
}

/** 启动检查：镜像不存在直接报错退出（预构建，不在评测路径现场 build） */
export async function ensureImageExists(): Promise<void> {
  await execFileAsync("docker", ["image", "inspect", env.JUDGE_IMAGE]);
}

/** 孤儿容器清理：崩溃恢复时强杀带 ailab-judge 标签的残留容器 */
export async function cleanupOrphanContainers(): Promise<number> {
  const { stdout } = await execFileAsync("docker", [
    "ps", "-aq", "--filter", "label=ailab-judge",
  ]);
  const ids = stdout.trim().split("\n").filter(Boolean);
  for (const id of ids) {
    await execFileAsync("docker", ["rm", "-f", id]).catch(() => {});
  }
  return ids.length;
}
