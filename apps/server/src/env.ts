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
  /** 部分网关（如 cannbot）除 Bearer 外还要求 x-api-vkey 头 */
  LLM_VKEY: z.string().default(""),
  /** 本地 leetcode 仓库路径（在线评测取参考代码/签名用），默认面试仓库的同级 leetcode 目录 */
  LEETCODE_REPO_DIR: z
    .string()
    .default(fileURLToPath(new URL("../../../../leetcode", import.meta.url))),
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
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
