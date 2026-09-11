# @ailab/content-kit

内容管线与工作流工具包：`packages/content/**`（三仓库内容快照）的构建期加工——
frontmatter 校验/补齐、统一 ID、质量门 lint、元数据产物（sync）、统计口径（stats）
与一次性迁移脚本。详见 [dev/content-kit.md](../../docs/dev/content-kit.md)。

## 命令

```bash
pnpm --filter @ailab/content-kit lint      # 质量门（error 非零退出；CI 必跑，lint 即测试）
pnpm --filter @ailab/content-kit backfill  # 幂等补齐 frontmatter（related_* 从正文链接推导）
pnpm --filter @ailab/content-kit sync      # 产出 dist/{contents,problems,lists,search-index,stats}.json（含 stats）
pnpm --filter @ailab/content-kit stats     # 仅产出 dist/stats.json（构建期统计注入口径）
```

## src/ 模块

| 模块 | 职责 |
|---|---|
| `content.ts` | 扫描 `packages/content`（含正文链接提取），产出 ContentFile 列表 |
| `ids.ts` | 统一 ID 与 url 生成（`lc:0001`、`gpu:e:001`、`learn:w01d01`…），classify 按目录推导 |
| `frontmatter.ts` / `schema.ts` | frontmatter 解析/序列化 + zod 校验（缺字段即 lint error） |
| `knowledge-points.ts` | 受控知识点词表（VOCAB）、tag→kp 映射、GPU A–L 领域分组 |
| `gpu-skill-map.ts` | LeetGPU 平台 slug ↔ 题目解析（backfill related 边来源之一） |
| `lint.ts` | 质量门：frontmatter/ID 唯一/悬空链接（含站内统一 URL）/related 对称/模板骨架（GPU 6 段、教学日 8 段、论文 17 节）/陈旧口径/孤儿图片…（分类汇总输出） |
| `backfill.ts` | frontmatter 幂等回填：难度/标签/languages 机器提取、related_problems/related_learn 边（leetgpu 平台链接 + 相对 md 链接 + 站内统一 URL md/HTML 形态）对称并集 |
| `sync.ts` | dist 五份 JSON 产物（server `content:sync` 的输入、CI 量级校验对象） |
| `stats.ts` | dist/stats.json：分区/难度/知识点覆盖/GPU 领域分布/论文 done-skeleton 显式口径（文案统计数的唯一来源） |
| `judge-extract.ts` | 题解示例用例与参考签名解析（problems.testcases/judge_meta，站内评测数据源） |

## scripts/（一次性/按需）

| 脚本 | 说明 |
|---|---|
| `fix-links.ts` | algo 题解间错误相对链接修复（04 迁移收尾；空格/跨目录/题名漂移，唯一命中才改写） |
| `fix-oldsite-links.ts` | 旧 GitHub Pages 站绝对 URL → 站内统一 ID 链接（backlog P2 正文改链；跨分区产物为 HTML `<a href>`——vitepress 对 md 链接会加 base，见 dev/content-site.md §6） |

## 数据流

```
packages/content/** ──lint（质量门，CI）──▶ backfill（按需，幂等）
                    └─sync──▶ dist/*.json ──▶ CLI content:sync ──▶ MySQL（contents/problems/problem_lists）
                                          └─▶ docs 站构建（sync-content/gpu/algo.mts 读 content 原文）
```

替代关系：leetcode `build.py` / ai-infra-notes `build/` 自研生成器已退役，lint 逻辑
用 TS 重写进本包；server 的 `sync/`（GitHub 在线拉取）已退役（judge 数据源切换
problems 表，2026-09-10 第六批）。
