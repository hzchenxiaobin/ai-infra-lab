# @ailab/judge-worker

评测沙箱 worker（独立进程，M3 主体）。详细设计见
[dev/judge-worker.md](../../docs/dev/judge-worker.md)。

## 架构

```
server judge.submit ──insert──▶ submissions 表（pending）
                                    ▲          │
                                    │          │ 轮询领取（两步条件 UPDATE 抢占）
                                    │          ▼
              本进程 ──docker run──▶ 一次性评测容器（ailab/judge-algo 镜像）
                        │            无网络 / 只读根 / tmpfs /work / 资源限额
                        ▼
              写回 status + verdict_detail + runtime_ms
（AC 联动 user_progress 由 server judge.getResult 读到时做，worker 不写用户表）
```

- **队列就是 `submissions` 表**（不引 MQ）；领取语义与 server in-process worker 完全一致。
- **评测核心同源**：`@ailab/judge-core`（签名解析 / harness 生成 / 输出比对 / 终态映射），
  server 与本进程共用，比对规则两端一致。
- **容器是哑执行器**：stdin 吃 task.json、stdout 吐 results.json，
  编译/逐用例执行/超时强杀/输出截断在镜像内（`deploy/images/algo/run.py`）。
- **安全红线**（对外开放注册的门槛）：`--network none` / `--read-only` +
  tmpfs /work / `--memory` `--cpus` `--pids-limit` / 总时限兜底强杀 / 输出截断。

## 运行

```bash
# 1. 构建评测镜像（一次性，预构建；国内网络走默认 aliyun apt 源）
docker build -t ailab/judge-algo:latest deploy/images/algo

# 2. 起 MySQL 并跑迁移、导入判题数据（content:sync）

# 3. 启动 worker（.env 读 DATABASE_URL；部署环境经 compose 注入）
pnpm --filter @ailab/judge-worker start

# 4. 部署形态：server 侧关掉内置执行路径
#    server: JUDGE_INPROCESS_WORKER=false（本进程接管执行，队列语义不变）
```

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `DATABASE_URL` | `mysql://root:root@localhost:3306/interview` | MySQL 连接串 |
| `JUDGE_IMAGE` | `ailab/judge-algo:latest` | 评测镜像（启动检查存在性，缺失即退出） |
| `JUDGE_CONCURRENCY` | `2` | 同时在跑的评测容器数 |
| `JUDGE_TIMEOUT_MS` | `8000` | 单用例超时（透传容器内） |
| `JUDGE_MEM_MB` | `256` | 评测容器内存上限 |
| `JUDGE_SUBMISSION_TIMEOUT_MS` | 30s + 20×用例超时 + 15s | 单次评测总时限兜底 |
| `JUDGE_POLL_INTERVAL_MS` | `500` | 队列轮询间隔 |

## 目录

```
src/
├── index.ts    # 主循环：启动检查 → 崩溃恢复/孤儿容器清理 → 轮询执行写回
├── db.ts       # submissions 队列访问（raw SQL，与 server worker 同领取语义）
├── runner.ts   # docker run 编排：stdin/stdout 协议、限额、超时强杀、结果映射
└── env.ts      # 环境变量（无 zod，依赖最小化）
```

## 测试

```bash
pnpm --filter @ailab/judge-worker test
# runner.test.ts：真实 docker 冒烟（AC/WA/CE/TLE/无网络红线），镜像未构建则跳过
# worker.test.ts：队列端到端（fixture → 领取 → 容器执行 → 写回），需 MySQL
# 测试库为 interview_test_jw（与 server 的 interview_test 隔离：
# pnpm -r test 并行时队列 FIFO 领取不互抢），先对它跑一次 db:migrate
```
