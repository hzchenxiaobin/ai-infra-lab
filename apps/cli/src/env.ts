import { fileURLToPath } from "node:url";

// CLI 环境变量（与 server .env 同源：加载仓库根 .env，进程环境变量优先）。
// 刻意不引 zod（与 judge-worker env.ts 同取舍：CLI 依赖最小化），
// 只取 CLI 需要的键；键名与 server env.ts 保持一致便于对照。
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // .env 不存在时使用进程环境变量与默认值
}

function str(key: string, fallback = ""): string {
  const v = process.env[key]?.trim();
  return v ? v : fallback;
}

export const env = {
  /** server API 基地址（CLI 走 HTTP tRPC，不再进程内直连 server 代码） */
  serverUrl: str("AILAB_SERVER_URL", "http://localhost:3001"),
  /** 服务间共享密钥：与 server .env 的 CLI_TOKEN 一致（空 = 通道关闭） */
  cliToken: str("CLI_TOKEN"),
  /** db:backup 用（mysqldump 直连，不经 server） */
  databaseUrl: str("DATABASE_URL", "mysql://root:root@localhost:3306/interview"),
  /** bank:generate 用（离线批处理直调 LLM） */
  llmBaseUrl: str("LLM_BASE_URL", "https://api.moonshot.cn/v1"),
  llmApiKey: str("LLM_API_KEY"),
  llmModel: str("LLM_MODEL", "moonshot-v1-8k"),
  llmVkey: str("LLM_VKEY"),
};
