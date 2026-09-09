# judge-worker — 评测沙箱开发指南

> `apps/judge-worker`：对外产品化的安全硬门槛（05 风险清单：**容器沙箱落地前不对外开放
> 注册**）。替代 interview 现状的"本机裸跑用户代码"。架构决策见
> [02 §3 评测沙箱](../02-architecture.md#3-评测沙箱judge-worker)。

## 1. 总体架构

```
web JudgePage ──tRPC──▶ server judge.run ──insert──▶ submissions 表（status=pending）
                                                          ▲        │
                                                          │ 轮询    │ worker 领取
                                                          │        ▼
                                              judge-worker ──docker run──▶ 一次性评测容器
                                                  │                   （algo 镜像，纯 CPU）
                                                  │ 挂宿主 /var/run/docker.sock
                                                  ▼
                                          写回 status + verdict_detail + runtime/memory
web 轮询 submissions 状态 ◀──tRPC── server judge.getResult ◀──────────────┘
```

- **任务队列就是 DB 表 `submissions`**：`status: pending → running → ac/wa/ce/tle/mle`。
  worker 轮询领取，初期不引入 MQ（02 已决策）。
- worker 与 web/server 同仓库独立部署（独立 compose 服务、独立镜像），不共享进程。

## 2. 目录结构

```
apps/judge-worker/
├── src/
│   ├── index.ts            # 主循环：轮询 → 领取 → 执行 → 写回
│   ├── queue.ts            # submissions 领取（事务内 UPDATE ... status=running）
│   ├── runner.ts           # docker run 编排：挂载、限额、超时、收尸
│   ├── images.ts           # 镜像名/标签常量与镜像存在性检查
│   └── verdict.ts          # 用例结果 → 终态判定（ac/wa/ce/tle/mle）
├── package.json            # 依赖复用 server 的 judge/ 评测核心（见 §4）
└── Dockerfile              # node:22-slim + docker CLI（不嵌套 Docker daemon）
```

**评测核心代码只有一份**：`apps/server/src/judge/`（parse.ts 签名/用例解析、
driver.ts harness 生成、run.ts 的比对逻辑）抽到可共享的位置（如
`packages/judge-core/`），server 与 judge-worker 都依赖它——输出比对规则
（JSON 深比较、数值容差 1e-5、二维数组无序兜底）两端必须一致。

## 3. Docker-out-of-Docker

worker 容器**挂载宿主 `/var/run/docker.sock`**，在宿主机上拉起一次性评测容器，
而不是在 worker 内嵌套 Docker（dind 有存储驱动与性能问题，02 已否决）。

```bash
# compose 中的关键配置
judge-worker:
  build: apps/judge-worker
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  environment:
    JUDGE_CONCURRENCY: 2
    JUDGE_TIMEOUT_MS: 8000
    JUDGE_MEM_MB: 256
```

worker 调宿主 Docker API（docker CLI 或 Engine HTTP API）起容器：

```bash
docker run --rm \
  --network none \                 # 无网络
  --memory 256m --cpus 1 \         # 资源限额
  --pids-limit 128 \
  --read-only \                    # 根文件系统只读
  --tmpfs /work:rw,size=64m \      # 唯一可写区（编译产物/临时文件）
  -v <hostcase>:/cases:ro \        # 只读用例输入
  ailab/judge-algo:latest \
  /run.sh                          # 编译 + 逐用例执行（镜像内脚本）
```

注意事项：

- 评测容器跑在**宿主机**上，容器名/标签要带 submission id 前缀，便于清理与审计。
- worker 启动时检查 algo 镜像存在，不存在则报错退出（镜像预构建，不在评测路径上
  现场 build）。
- worker 崩溃恢复：启动时把 `running` 超时的 submission 重置为 `pending` 重领，
  并 `docker ps --filter label=ailab-judge` 清理孤儿容器。

## 4. algo 评测镜像

```
deploy/images/algo/Dockerfile     # debian slim + g++ ≥ 11 + python3 + sqlite3
```

- C++：`g++ -std=c++17 -O2`（沿用 run.ts 现状）；编译超时 30s，运行超时 8s/用例，
  输出上限 64KB——这些常量拷自 `server/src/judge/run.ts`，环境变量化后镜像内外一致。
- Python：直接 `python3 main.py`，harness 由 driver.ts 的 `buildPythonSource` 生成。
- **SQL 题**：镜像内嵌 SQLite；harness 把用例的建表/数据 SQL 导入临时库，执行用户
  查询，**比对结果集**（行序无关、列名敏感；leetcode 有 324 道数据库题，见 02 §3）。
  MySQL 方言题 v1 一律按 SQLite 评测，题面标注差异。
- 镜像内不带任何源码仓库与凭据，用例经只读挂载注入。

## 5. 资源限额与安全红线

| 红线 | 实现 |
|---|---|
| 无网络 | `--network none`，绝无例外 |
| 只读输入 | 用例只读挂载；根 fs 只读 + 限定 tmpfs 可写区 |
| 超时强杀 | 每用例 wall-clock 超时 → SIGKILL；整个 submission 有总时限兜底 |
| 资源上限 | memory / cpus / pids-limit 三者都设，防 fork 炸弹与内存撑爆 |
| 输出截断 | stdout/stderr 超上限截断入库，防日志撑爆 DB |
| 并发上限 | `JUDGE_CONCURRENCY` 控制同时在跑的评测容器数（部署机 CPU 有限） |

补充防线（与沙箱正交，见 05 风险清单"滥用与刷接口"）：提交频率走 server 配额中间件
（[server](server.md#8-配额中间件计量先行限额后置)）；评测队列积压进监控告警。

**红线**：不因为"题目可信"而跳过容器直接跑；interview 现状的本机 exec 代码路径
（`run.ts` 的 `execFileSync`）在 judge-worker 落地后从 server 的 HTTP 路径上移除。

## 6. 队列与状态机细节

```sql
-- 领取任务（单 SQL 原子领取，多 worker 安全）
UPDATE submissions SET status='running', started_at=NOW()
WHERE id = (SELECT id FROM submissions WHERE status='pending'
            ORDER BY id LIMIT 1) AND status='pending';
```

- 终态：`ac / wa / ce / tle / mle`，外加 `ie`（internal error，worker 自身故障，
  用于告警与人工介入）；逐用例明细写 `verdict_detail` json。
- web 端轮询间隔 1–2s，运行中显示进度；完成写 `runtime_ms` / `memory_kb`（取所有
  用例最大值），驱动掌握度模型（03）。
- 评测结果落库后联动 `user_progress`（AC 标记）——由 server 侧轮询接口在读到时
  顺手更新，worker 不写用户进度表（职责单一）。

## 7. GPU 题：引流 leetgpu.com

**部署机无 GPU，不自建 GPU 沙箱**（2026-09 决策，05 已留档）。产品逻辑：

- GPU 题（`problems.judge_type = 'leetgpu-com'`）在题目页展示"前往 leetgpu.com
  在线评测"跳转按钮 + `.cu` harness 下载（供本地有 GPU 的用户自测）。
- 刷题状态支持**手动标记完成**（写 `user_progress`），不做可信度校验——v1 接受
  这个误差，掌握度模型里 GPU 信号权重天然有限。
- judge-worker 代码里不为 GPU 留任何分支：`judge_type` 非 `internal` 的题在 server
  层就拒绝投递队列。
- M4 增强项（有 GPU 资源时）才重启自建沙箱，届时收编 `leetgpu-challenges`
  （题库元数据 + `challenge.py` 用例生成）作为基座。

## 8. 测试

- 评测核心（比对/harness 生成）沿用 `server/src/judge/judge.test.ts` 模式做纯函数测试，
  **必须覆盖**：编译错误、超时、数值容差、二维数组无序答案、输出截断。
- worker 层测试：queue 领取的原子性（并发双 worker 不重复领取）、崩溃恢复重置。
- 端到端冒烟（M3 上线前）：真实 docker 环境跑一道两数之和 AC + 一道死循环 TLE。
