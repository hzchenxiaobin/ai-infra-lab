# @ailab/judge-worker（待实现）

评测沙箱 worker，**P7 里程碑实现**，当前仅为目录占位。

目标形态（详见 [dev/judge-worker.md](../../dev/judge-worker.md)）：

- DB 轮询 `submissions` 表取待评测任务（不引入消息队列）。
- Docker-out-of-Docker 拉起一次性容器执行评测：algo 镜像（g++ / python3 / SQLite）、
  资源限额由 `JUDGE_CONCURRENCY` / `JUDGE_TIMEOUT_MS` / `JUDGE_MEM_MB` 控制。
- 安全红线：容器隔离是产品化上线的前置条件，禁止本机裸跑用户代码。
- SQL 题用 SQLite 评测；GPU 题不自建沙箱，引流 leetgpu.com，站内提供 `.cu`
  harness 下载自测 + 刷题状态手动标记。

现状过渡：评测逻辑暂在 `apps/server` 的 judge 模块内（本机执行），上线前必须迁出。
