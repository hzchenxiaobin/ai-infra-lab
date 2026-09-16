import SwiftUI

// ---------------------------------------------------------------------------
// 学习 Tab（web /learn）：三阶段 × 10 周主线 + 每周节奏 + 专题 + 论文精读。
// 正文阅读在 docs 站：点击标题/格点 → 内嵌浏览器；长按格点标记进度。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class LearnModel {
    enum Phase {
        case loading
        case ready(LearnOverview)
        case failed(String)
    }

    var phase: Phase = .loading
    var markingDayIds: Set<String> = []

    func load() async {
        if case .ready = phase {} else { phase = .loading }
        do {
            phase = .ready(try await Services.shared.api.learnOverview())
        } catch let error as TRPCError {
            phase = .failed(error.message)
        } catch {
            phase = .failed("网络异常，请稍后重试")
        }
    }

    /// 三态标记：unseen → seen → mastered（mastered 后不可回退，web 同款约束）
    func mark(day: LearnOverview.Day) async {
        guard day.status == .unseen || day.status == .seen, !markingDayIds.contains(day.id) else { return }
        let next: ProgressStatus = day.status == .unseen ? .seen : .mastered
        markingDayIds.insert(day.id)
        defer { markingDayIds.remove(day.id) }
        do {
            try await Services.shared.api.progressMark(contentId: day.id, status: next)
            NotificationCenter.default.post(name: .progressChanged, object: nil)
            await load()
        } catch {
            // 静默失败：下次刷新恢复真实状态
        }
    }
}

private struct LearnPhaseGroup {
    let name: String
    let tagline: String
    let weeks: [Int]
}

private let PHASES: [LearnPhaseGroup] = [
    LearnPhaseGroup(name: "阶段一 · 基础内功",
                    tagline: "GPU 执行本质 → Kernel 优化 → Tensor Core → Transformer 算子",
                    weeks: [1, 2, 3, 4]),
    LearnPhaseGroup(name: "阶段二 · 推理系统",
                    tagline: "FlashAttention → KV Cache → Batching 调度 → 推理加速",
                    weeks: [5, 6, 7, 8]),
    LearnPhaseGroup(name: "阶段三 · 分布式与冲刺",
                    tagline: "分布式并行 → 项目整合 → 面试冲刺",
                    weeks: [9, 10]),
]

private let WEEK_BLURBS: [Int: String] = [
    1: "建立 GPU 性能直觉 —— 性能 = Memory + 并行度",
    2: "掌握 Warp Shuffle、Register Blocking、GEMM 七层路径、CUDA Streams",
    3: "掌握 WMMA/mma.sync、CUTLASS 三级 Tiling、CuTe 布局抽象",
    4: "手写 Softmax/LayerNorm/GEMM Backward、Triton 三方 benchmark",
    5: "从 FA 简化版到 FA-3 完整贯通：论文 / Forward / Backward / 官方源码 / 性能对比",
    6: "Prefill/Decode、KV Cache（GQA/MQA/MLA）、vLLM、PagedAttention、FlashDecoding",
    7: "Continuous Batching、vLLM Scheduler、Chunked Prefill、PD 分离、Mini 引擎 v1",
    8: "量化（W8A16/INT8 KV/FP8）、投机解码、CUDA Graph、采样 kernel",
    9: "TP/PP/DP、NCCL、通信计算重叠、Ring Attention、MoE+EP、Ascend 对比",
    10: "Mini 引擎真整合、全链路 Profiling、面试题库、Mock 面试、诊断剧本",
]

private let WEEK_RHYTHM: [(days: String, title: String, desc: String)] = [
    (days: "Day 1-2", title: "理论 + 基础 Kernel", desc: "概念建模 + 最简实现"),
    (days: "Day 3-4", title: "进阶实现 / 源码", desc: "进阶优化或开源源码导读"),
    (days: "Day 5", title: "项目推进", desc: "接入 Mini 引擎或 benchmark"),
    (days: "Day 6", title: "Profiling", desc: "ncu / nsys 实测 + Roofline"),
    (days: "Day 7", title: "复盘 + 面试", desc: "知识地图 / 手撕清单 / 面试 Q&A"),
]

struct LearnScreen: View {
    @State private var model = LearnModel()
    @Environment(LinkStore.self) private var links

    var body: some View {
        NavigationStack {
            Group {
                switch model.phase {
                case .loading:
                    LoadingView(text: "加载学习路径…")
                case .failed(let message):
                    ErrorBoxView(message: message) {
                        Task { await model.load() }
                    }
                    .padding(24)
                case .ready(let overview):
                    readyView(overview)
                }
            }
            .background(Color.page)
            .navigationTitle("学习路线")
            .task { await model.load() }
        }
    }

    private func readyView(_ overview: LearnOverview) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                let totalDays = overview.weeks.reduce(0) { $0 + $1.days.count }
                let seenDays = overview.weeks.reduce(0) { $0 + $1.seenDays }
                let percent = totalDays > 0 ? Double(seenDays) / Double(totalDays) : 0

                VStack(alignment: .leading, spacing: 6) {
                    Text("三个阶段、十个主题，从 GPU 执行本质一路走到分布式推理与面试冲刺。")
                        .font(.subheadline)
                        .foregroundStyle(Color.muted)
                    HStack {
                        Text("整体进度")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        Spacer()
                        Text("已学 \(seenDays)/\(totalDays) 天（\(Int(percent * 100))%）")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }
                    ProgressBarView(value: percent, height: 10)
                }

                ForEach(PHASES, id: \.name) { phase in
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeaderView(title: phase.name, subtitle: phase.tagline)
                        VStack(spacing: 12) {
                            ForEach(phase.weeks, id: \.self) { weekNo in
                                if let week = overview.weeks.first(where: { $0.week == weekNo }) {
                                    WeekCard(week: week, links: links, model: model)
                                }
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    SectionHeaderView(title: "每周节奏")
                    VStack(spacing: 8) {
                        ForEach(WEEK_RHYTHM, id: \.days) { rhythm in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(rhythm.days)
                                    .font(.mono(.caption).weight(.semibold))
                                    .foregroundStyle(Color.accent600)
                                    .frame(width: 64, alignment: .leading)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(rhythm.title)
                                        .font(.subheadline.weight(.medium))
                                    Text(rhythm.desc)
                                        .font(.caption)
                                        .foregroundStyle(Color.muted)
                                }
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }

                if !overview.topics.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeaderView(title: "专题", subtitle: "\(overview.topics.count) 个")
                        VStack(spacing: 10) {
                            ForEach(overview.topics) { topic in
                                Button {
                                    links.open(topic.url, title: topic.title)
                                } label: {
                                    HStack(spacing: 10) {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(topic.title)
                                                .font(.subheadline.weight(.medium))
                                                .foregroundStyle(Color.ink)
                                            Text(topic.slug)
                                                .font(.mono(.caption))
                                                .foregroundStyle(Color.faint)
                                        }
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: 3) {
                                            Text("\(topic.seenDays)/\(topic.totalDays) 天")
                                                .font(.caption.weight(.medium))
                                                .foregroundStyle(Color.accent300)
                                            ProgressBarView(
                                                value: topic.totalDays > 0 ? Double(topic.seenDays) / Double(topic.totalDays) : 0,
                                                height: 4
                                            )
                                            .frame(width: 72)
                                        }
                                    }
                                    .padding(12)
                                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.divider))
                                }
                            }
                        }
                    }
                }

                if !overview.papers.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeaderView(title: "论文精读", subtitle: "\(overview.papers.count) 篇")
                        VStack(spacing: 8) {
                            ForEach(overview.papers) { paper in
                                Button {
                                    links.open(paper.url, title: paper.title)
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(systemName: "doc.text")
                                            .font(.footnote)
                                            .foregroundStyle(Color.muted)
                                        Text(paper.title)
                                            .font(.subheadline)
                                            .foregroundStyle(Color.ink)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.caption)
                                            .foregroundStyle(Color.faint)
                                    }
                                    .padding(12)
                                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.divider))
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await model.load() }
    }
}

private struct WeekCard: View {
    let week: LearnOverview.Week
    let links: LinkStore
    let model: LearnModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                links.open(week.url, title: week.title)
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("W\(week.week)→")
                        .font(.mono(.subheadline).weight(.bold))
                        .foregroundStyle(Color.accent600)
                    Text(week.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.ink)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Text("\(week.seenDays)/\(week.days.count) 天")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                }
            }
            if let blurb = WEEK_BLURBS[week.week] {
                Text(blurb)
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                    .lineLimit(2)
            }
            DayGrid(week: week, links: links, model: model)
        }
        .cardStyle()
    }
}

private struct DayGrid: View {
    let week: LearnOverview.Week
    let links: LinkStore
    let model: LearnModel

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
            ForEach(week.days) { day in
                DayCell(
                    day: day,
                    isMarking: model.markingDayIds.contains(day.id),
                    onTap: { links.open(day.url, title: day.title) },
                    onMark: { Task { await model.mark(day: day) } }
                )
            }
        }
    }
}

private struct DayCell: View {
    let day: LearnOverview.Day
    let isMarking: Bool
    let onTap: () -> Void
    let onMark: () -> Void

    private var borderColor: Color {
        switch day.status {
        case .unseen: return .line
        case .seen: return Color.accent600.opacity(0.4)
        case .mastered, .ac: return .accent600
        }
    }

    private var background: Color {
        switch day.status {
        case .unseen: return .surface
        default: return .accent50
        }
    }

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 2) {
                Text("D\(day.day)")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color.muted)
                Text(day.status == .mastered || day.status == .ac ? "✓" : " ")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color.accent400)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 36)
            .background(background, in: RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8).strokeBorder(borderColor)
            )
            .opacity(isMarking ? 0.4 : 1)
        }
        .buttonStyle(.plain)
        .contextMenu {
            if day.status == .unseen {
                Button { onMark() } label: { Label("标记已学", systemImage: "eye") }
            } else if day.status == .seen {
                Button { onMark() } label: { Label("标记已掌握", systemImage: "checkmark.circle") }
            } else {
                Text("已掌握")
            }
        }
    }
}
