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

- **任务队列就是 DB 表 `submissions`**：`status: pending → running → ac/wa/ce/tle/mle/ie`。
  worker 轮询领取，初期不引入 MQ（02 已决策）。
- worker 与 web/server 同仓库独立部署（独立 compose 服务、独立镜像），不共享进程。
- **P0 过渡形态（已落地，生产由独立 worker 接管）**：server 进程内置 in-process worker
  （`apps/server/src/judge/worker.ts`，`startJudgeWorker()` 于 index.ts 启动）——
  队列领取/写回语义与独立 worker 同构，执行路径为本机 exec（`@ailab/judge-core` 的
  run.ts），**仅开发用**：部署时 `JUDGE_INPROCESS_WORKER=false` 关闭，执行全部走
  独立 judge-worker 的 Docker 沙箱（2026-09-10 第七批落地）。
- **判题数据源已切换 problems 表**（2026-09-10 第六批）：`submissions.problem_id`
  存统一题目 ID（`lc:0001` 等），testcases 与参考签名元数据（`problems.judge_meta`）
  由 content-kit 构建期从题解机器解析入库，评测路径不再读本地 leetcode 仓库；
  `judge_type` 非 `internal` 的题在 `judge.getProblem`/`submit` 即拒绝投递（§7）。
- **独立 worker 已落地**（2026-09-10 第七批）：`apps/judge-worker` 独立进程直接
  轮询 `submissions` 表（领取/写回语义与 in-process worker 一致），执行走本文件
  的 Docker 方案——一次性容器（`deploy/images/algo`）+ 全部安全红线（§5 逐条验证）；
  worker 领取/回报不做内部 HTTP API，直接读写 DB（队列即表，本文件 §1/§6 的设计）。

## 2. 目录结构

```
apps/judge-worker/
├── src/
│   ├── index.ts            # 主循环：启动检查 → 崩溃恢复/孤儿容器清理 → 轮询执行写回
│   ├── db.ts               # submissions 领取/写回/恢复（raw SQL，与 server worker 同语义）
│   ├── runner.ts           # docker run 编排：stdin/stdout 协议、限额、超时强杀、结果映射
│   ├── env.ts              # 环境变量（无 zod，依赖最小化）
│   ├── runner.test.ts      # Docker runner 冒烟（AC/WA/CE/TLE/无网络，镜像未构建则跳过）
│   └── worker.test.ts      # 队列端到端（fixture → 领取 → 容器执行 → 写回）
├── Dockerfile              # node:22-slim + docker CLI（挂宿主 docker.sock，不嵌套 daemon）
└── package.json            # 依赖 @ailab/judge-core（评测核心同源）+ mysql2

deploy/images/algo/
├── Dockerfile              # debian slim + g++ + python3（APT_MIRROR 可换国内源）
└── run.py                  # 容器内哑执行器：stdin task.json → stdout results.json
```

**评测核心代码只有一份**：`packages/judge-core/`（签名/用例解析 parse、harness 生成
driver、输出比对 compare、本机 exec run、终态映射 verdict）——server（开发形态）与
judge-worker（生产形态）都依赖它，输出比对规则（JSON 深比较、数值容差 1e-5、二维数组
无序兜底）两端同源；容器内不做比对，只做编译与执行。

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
deploy/images/algo/Dockerfile     # debian slim + g++ ≥ 11 + python3
deploy/images/algo/run.py         # 容器内哑执行器（stdin task.json → stdout results.json）
```

- C++：`g++ -std=c++17 -O2`；编译超时 30s，运行超时 `JUDGE_TIMEOUT_MS`（默认 8s）/用例，
  逐用例输出截断 8KB / 编译错误截断 4KB（run.py 内，输出截断红线）。
- Python：直接 `python3 main.py`，harness 由 judge-core driver 的 `buildPythonSource` 生成。
- 容器协议：task.json 经 **stdin** 注入（源码为完整 harness）、results.json 走
  **stdout**（容器无挂载卷，tmpfs /work 为唯一可写区，容器退出即焚）；
  比对在 worker 侧（judge-core 同源），容器只做编译与执行。
- **SQL 题（后续项）**：leetcode 数据库题的示例用例尚不可机器解析（无
  `name = value` 形态 → judge_type=none），无数据路径，SQLite 评测待用例解析
  方案（M4 候选）；镜像暂不装 sqlite3，落地时再加。
- 镜像内不带任何源码仓库与凭据。

## 5. 资源限额与安全红线

| 红线 | 实现 |
|---|---|
| 无网络 | `--network none`，绝无例外（runner.test.ts 有 DNS 解析必败的回归用例） |
| 只读输入 | task.json 经 stdin 注入；根 fs 只读 + tmpfs /work 唯一可写（`rw,exec,size=64m,mode=1777`——exec 允许执行编译产物、mode 允许非 root 的 judge 用户写入） |
| 超时强杀 | 每用例 wall-clock 超时（run.py subprocess timeout）→ 整容器 SIGKILL 兜底（worker 侧总时限 + `docker rm -f` 收尸） |
| 资源上限 | memory（`JUDGE_MEM_MB`）/ cpus=1 / pids-limit=128 三者都设，防 fork 炸弹与内存撑爆 |
| 输出截断 | run.py 逐用例截断（stdout 8KB / stderr 2KB / 编译错误 4KB），worker 侧容器 stdout 上限 4MB，防日志撑爆 DB |
| 并发上限 | `JUDGE_CONCURRENCY` 控制同时在跑的评测容器数（部署机 CPU 有限） |
| 非 root 执行 | 镜像内置 judge 用户（USER judge），容器内编译/执行不提权 |

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
  用于告警与人工介入，迁移 0004 已入表）；逐用例明细写 `verdict_detail` json。
- web 端轮询间隔 1–2s，运行中显示进度；完成写 `runtime_ms` / `memory_kb`（取所有
  用例最大值），驱动掌握度模型（03）。
- 评测结果落库后联动 `user_progress`（AC 标记）——由 server 侧轮询接口在读到时
  顺手更新（已落地：`judge.getResult` 读到 ac 时 upsert，mastered 不降级），
  worker 不写用户进度表（职责单一）。

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

- 评测核心（比对/harness 生成）：`packages/judge-core/src/judge-core.test.ts`——
  覆盖签名解析、数值容差、二维数组无序答案、本机 exec e2e（编译错误/超时/截断）。
- runner 层：`apps/judge-worker/src/runner.test.ts` 真实 docker 冒烟（镜像未构建跳过）
  ——已覆盖两数之和 AC（C++/Python）、WA、CE、死循环 TLE、无网络红线（容器内
  DNS 解析失败）。
- 端到端（M3 上线前）：`worker.test.ts` 队列全链路（fixture → 领取 → 容器执行 →
  写回读回）+ 手工冒烟：server `judge.submit` → 独立 worker 进程消费 →
  `getResult` 读回 AC/TLE（2026-09-10 第七批已验证）。
- 队列领取的原子性（并发双 worker 不重复领取）由两步条件 UPDATE 保证
  （与 server in-process worker 同语义，server 测试覆盖）。
