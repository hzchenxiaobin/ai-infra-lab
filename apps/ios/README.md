# AIInfra Lab iOS App

AI Infra 学—练—面闭环平台的原生 iOS 客户端，功能对等 [web 门户](../../apps/web)（设计文档：[docs/08-ios-app-design.md](../../docs/08-ios-app-design.md)）。

## 功能

| 模块 | 覆盖内容 |
|---|---|
| 学习 | 三阶段 × 10 周主线（DayCell 三态标记）、专题、论文精读，正文经内嵌浏览器阅读 docs 站 |
| 刷题 | GPU/算法双分区、难度/状态/评测方式/标签/知识点筛选、GPU 知识领域 A–L 分组、高频/中频分组、题单、周赛、三态掌握标记、个人备注 |
| 评测 | C++/Python 在线评测、示例用例展示、1.5s 轮询、逐用例结果渲染、AC 联动掌握状态 |
| 面试 | 三步组卷（方向/考察范围/题量）、聊天流（乐观更新 + 打字指示 + 断点续面）、代码题内嵌评测、结束本场、LLM 评估报告（卡片化渲染 + 一问一答配对 + 薄弱点推荐）、历史统计（方向均分 + 趋势折线） |
| 题库管理 | 面试题 CRUD、JSON 批量导入、一键播种 |
| 我的 | 连续活跃天数、学习/刷题进度、掌握度雷达（三路信号 0.2/0.5/0.3）、配额用量 |
| 搜索 | 300ms 防抖全站搜索、类型筛选 |

## 技术要点

- **零第三方依赖**：Swift 6 (Swift 5 模式) + SwiftUI（iOS 17+）+ URLSession + 自研组件。
- **后端零改动**：直连现有 tRPC HTTP API —— query 走 `GET /trpc/{proc}?input={"json":...}`，mutation 走 `POST /trpc/{proc}`（协议已对线上实测校准）。
- **会话**：`ailab_session` HttpOnly Cookie 由系统 `HTTPCookieStorage` 管理（跨启动保留、滑动续期自动生效）；任何业务 401 全局登出回登录页。
- **架构**：`@Observable` MVVM；`Core/TRPCClient`（协议层）→ `Core/API`（类型化过程）→ Feature ViewModel → SwiftUI。
- **UI 令牌**：对齐 web 暗色主题（`#0e1116` 冷炭底 + `#f2502b` 单红强调）。

## 开发

```bash
# 生成 Xcode 工程（源码 + project.yml 已入库，改动 project.yml 后需重新生成）
cd apps/ios && xcodegen generate

# 打开工程（或用 Xcode 直接打开 AIInfraLab.xcodeproj）
open AIInfraLab.xcodeproj

# 命令行构建（模拟器）
xcodebuild -project AIInfraLab.xcodeproj -scheme AIInfraLab \
  -destination 'generic/platform=iOS Simulator' build

# 类型检查（快速反馈）
xcrun -sdk iphonesimulator swiftc -target arm64-apple-ios17.0-simulator \
  -typecheck $(find AIInfraLab -name '*.swift')
```

- 默认服务器地址 `http://47.93.85.170:8080`（生产）；App 内「我的 → 设置」可切换（本地开发用）。
- 当前为 HTTP 明文：Info.plist 已按 ATS 规则对 `47.93.85.170` 加例外；服务器切 HTTPS 后建议移除。

## 目录结构

```
apps/ios/
├── project.yml              # XcodeGen 工程定义（Info.plist 属性 / ATS / 签名）
├── AIInfraLab.xcodeproj/    # xcodegen 生成产物（入库）
└── AIInfraLab/
    ├── App/                 # 入口、RootView（五 Tab）、SessionStore
    ├── Core/                # Config / Models（contracts 对齐 DTO）/ TRPCClient / API / Poller
    ├── UI/                  # Theme / Components / Markdown 渲染 / 气泡 / 内嵌浏览器
    ├── Features/
    │   ├── Auth/            # 登录、注册（验证码 60s 倒计时）
    │   ├── Learn/           # 学习路线
    │   ├── Problems/        # 刷题、题单、周赛、评测
    │   ├── Interview/       # 组卷、题库、历史、面试间、报告
    │   ├── Dashboard/       # 个人中心（雷达图 / 配额）+ 设置
    │   └── Search/          # 全站搜索
    └── Resources/           # Assets（AppIcon / AccentColor）
```

## 已验证

- `xcodebuild`（iOS 17 模拟器目标）构建通过。
- `Core/` 四个协议层源文件以 macOS 可执行直连生产服务器冒烟通过：GET query 信封 / POST mutation 错误信封 / 401 全局策略 / superjson Date 解码。
