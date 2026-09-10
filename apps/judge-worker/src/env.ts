// env.ts —— judge-worker 环境变量（部署 compose 注入，本地跑同 .env）。
// 刻意不引 zod：worker 独立进程，依赖最小化（仅 judge-core + mysql2）。

function num(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

function str(name: string, def: string): string {
  const v = process.env[name]?.trim();
  return v ? v : def;
}

function bool(name: string, def: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v == null || v === "") return def;
  return v !== "false" && v !== "0";
}

// 加载仓库根 .env（server 同款行为；部署容器内由 compose environment 注入）
try {
  const url = new URL("../../../.env", import.meta.url);
  process.loadEnvFile(url);
} catch {
  // .env 不存在时使用进程环境变量
}

export const env = {
  DATABASE_URL: str("DATABASE_URL", "mysql://root:root@localhost:3306/interview"),
  /** 评测镜像（启动时检查存在性，不存在报错退出——不在评测路径现场 build） */
  JUDGE_IMAGE: str("JUDGE_IMAGE", "ailab/judge-algo:latest"),
  /** 同时在跑的评测容器数（部署机 CPU 有限） */
  JUDGE_CONCURRENCY: num("JUDGE_CONCURRENCY", 2),
  /** 单用例超时（ms），透传给容器内执行器 */
  JUDGE_TIMEOUT_MS: num("JUDGE_TIMEOUT_MS", 8000),
  /** 评测容器内存上限（MB） */
  JUDGE_MEM_MB: num("JUDGE_MEM_MB", 256),
  /** 轮询间隔（ms） */
  POLL_INTERVAL_MS: num("JUDGE_POLL_INTERVAL_MS", 500),
  /** 单次评测总时限兜底（ms）：编译 30s + 用例数 × 单用例超时 + 余量 */
  get submissionTimeoutMs(): number {
    return num("JUDGE_SUBMISSION_TIMEOUT_MS", 0) || 30_000 + 20 * this.JUDGE_TIMEOUT_MS + 15_000;
  },
  /** 启动时清理孤儿容器（docker ps --filter label=ailab-judge） */
  JUDGE_CLEANUP_ORPHANS: bool("JUDGE_CLEANUP_ORPHANS", true),
};
