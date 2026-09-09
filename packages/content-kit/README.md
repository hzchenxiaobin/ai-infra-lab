# @ailab/content-kit（待实现）

内容管线与工作流工具包，当前仅为目录占位。详见
[dev/content-kit.md](../../dev/content-kit.md)。

职责范围：

- **frontmatter 校验**：解析并校验 `packages/content/**` 的元数据（zod schema）。
- **统一 ID**：全产品唯一内容/题目 ID 的生成与解析（交叉引用只许用统一 ID）。
- **lint**：重复标题 / 悬空链接 / 陈旧口径 / 模板结构检查；CI 必跑，lint 即测试。
- **同步**：内容 → DB 幂等同步（`id + contentHash` upsert，失效标 `stale` 不物理删除）、
  搜索索引导出、LLM 抽题管线与 cannbot 产题辅助。

替代关系：leetcode `build.py` / ai-infra-notes `build/` 自研生成器已退役，
lint 逻辑用 TS 重写进本包；server 的 `sync/`（GitHub 在线拉取）同步退役。
