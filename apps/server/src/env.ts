import { fileURLToPath } from "node:url";
import { z } from "zod";

// 加载仓库根目录 .env（不存在则忽略，走默认值/进程环境变量）
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // .env 不存在时使用进程环境变量与默认值
}

const optionalInt = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().int().positive().optional(),
);

const envSchema = z.object({
  DATABASE_URL: z.string().default("mysql://root:root@localhost:3306/interview"),
  PORT: z.coerce.number().int().default(3001),
  LLM_BASE_URL: z.string().default("https://api.moonshot.cn/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("moonshot-v1-8k"),
  /** 模型分级（docs/dev/server.md）：追问/开场用便宜模型；空则回落 LLM_MODEL */
  LLM_MODEL_FOLLOWUP: z.string().default(""),
  /** 模型分级：评估用强模型；空则回落 LLM_MODEL */
  LLM_MODEL_EVAL: z.string().default(""),
  /** 部分网关（如 cannbot）除 Bearer 外还要求 x-api-vkey 头 */
  LLM_VKEY: z.string().default(""),
  /** session cookie 签名密钥；为空时使用进程内随机密钥（仅开发用，重启即失效） */
  SESSION_SECRET: z.string().default(""),
  /** 注册验证码 SMTP；SMTP_HOST 为空时 dev 模式把验证码打印到日志 */
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  /** adminProcedure 放行邮箱列表（逗号分隔） */
  ADMIN_EMAILS: z.string().default(""),
  /** 配额默认值（缺省/空 = 不限，上线初期默认；后续仅改配置开启分层） */
  QUOTA_DEFAULT_JUDGE: optionalInt,
  QUOTA_DEFAULT_INTERVIEW: optionalInt,
  /** 评测队列并发上限（in-process worker 与独立 judge-worker 通用） */
  JUDGE_CONCURRENCY: z.coerce.number().int().positive().default(2),
  /** false 时禁用 server 内置 in-process worker（独立 judge-worker 部署模式，
   *  生产 compose 置 false：本机 exec 路径下线，沙箱执行由独立进程接管） */
  JUDGE_INPROCESS_WORKER: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
