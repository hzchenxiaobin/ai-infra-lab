import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      // 独立测试库（与 server 的 interview_test 隔离：pnpm -r test 并行跑时，
      // 队列 FIFO 领取会互相抢行）；需先对 interview_test_jw 跑迁移
      DATABASE_URL: "mysql://root:root@localhost:3306/interview_test_jw",
      // runner 冒烟用本机已构建的评测镜像（缺失时测试自动跳过）
      JUDGE_IMAGE: "ailab/judge-algo:latest",
    },
    fileParallelism: false,
  },
});
