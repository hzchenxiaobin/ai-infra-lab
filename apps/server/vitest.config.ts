import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      // 测试走独立数据库，不碰开发库数据（interview_test 需先执行迁移）
      DATABASE_URL: "mysql://root:root@localhost:3306/interview_test",
      // 纯 LLM 模式要求非空 Key；测试用 stub fetch mock LLM 响应，Key 内容无所谓
      LLM_API_KEY: "test-mock-key",
      // adminProcedure 测试身份（content.test 等；2026-09-11 收紧后仅此名单可过 admin）
      ADMIN_EMAILS: "test-admin@ailab.test",
    },
    // 集成测试共享同一 MySQL：文件并行会让 content.import 的全量 stale 标记
    // 打到并行中其他文件的种子行（曾致 problem/content 交叉失败），改顺序执行
    fileParallelism: false,
  },
});
