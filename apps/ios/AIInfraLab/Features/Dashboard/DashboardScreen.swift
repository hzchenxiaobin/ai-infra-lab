import SwiftUI

// ---------------------------------------------------------------------------
// 个人中心（web /dashboard）：连续活跃天数 + 学习进度 + 按难度刷题统计 +
// 掌握度雷达（三路信号 0.2/0.5/0.3）+ 配额用量 + 服务器设置。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class DashboardModel {
    var overview: ProgressOverview?
    var quota: QuotaMe?
    var errorMessage: String?

    func load() async {
        do {
            let api = Services.shared.api
            async let overview = api.progressOverview()
            async let quota = api.quotaMe()
            self.overview = try await overview
            self.quota = try await quota
            errorMessage = nil
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}

struct DashboardScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var model = DashboardModel()
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let overview = model.overview {
                        summaryRow(overview)
                        learningCard(overview)
                        practiceCard(overview)
                        masteryCard(overview)
                        if let quota = model.quota {
                            quotaCard(quota)
                        }
                    } else if let error = model.errorMessage {
                        ErrorBoxView(message: error) { Task { await model.load() } }
                    } else {
                        LoadingView(text: "加载个人数据…")
                    }
                }
                .padding(16)
            }
            .background(Color.page)
            .navigationTitle("个人中心")
            .task { await model.load() }
            .refreshable { await model.load() }
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsScreen()
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    Button {
                        Task { await session.logout() }
                    } label: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
        }
    }

    private func summaryRow(_ overview: ProgressOverview) -> some View {
        HStack(spacing: 12) {
            StatBlock(value: "\(overview.streakDays)", label: "连续活跃天数")
            StatBlock(value: "\(overview.learning.seen)/\(overview.learning.total)", label: "已学篇目")
            StatBlock(value: "\(overview.practice.ac)/\(overview.practice.total)", label: "已 AC 题目")
        }
        .cardStyle()
    }

    private func learningCard(_ overview: ProgressOverview) -> some View {
        let percent = overview.learning.total > 0 ? Double(overview.learning.seen) / Double(overview.learning.total) : 0
        return VStack(alignment: .leading, spacing: 10) {
            SectionHeaderView(title: "学习路径")
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(Int(percent * 100))%")
                    .font(.system(.largeTitle, design: .rounded).weight(.bold))
                    .foregroundStyle(Color.ink)
                Text("已学 \(overview.learning.seen)/\(overview.learning.total) · 已掌握 \(overview.learning.mastered)")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
            }
            ProgressBarView(value: percent, height: 10)
        }
        .cardStyle()
    }

    private func practiceCard(_ overview: ProgressOverview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeaderView(title: "刷题统计", subtitle: "AC \(overview.practice.ac)/\(overview.practice.total)")
            ForEach([Difficulty.easy, .medium, .hard]) { difficulty in
                let bucket = overview.practice.byDifficulty[difficulty.rawValue]
                    ?? .init(total: 0, ac: 0)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(difficulty.label)
                            .font(.footnote)
                        Spacer()
                        Text("\(bucket.ac)/\(bucket.total)")
                            .font(.mono(.caption))
                            .foregroundStyle(Color.muted)
                    }
                    ProgressBarView(
                        value: bucket.total > 0 ? Double(bucket.ac) / Double(bucket.total) : 0,
                        tint: difficulty == .hard ? .accent600 : (difficulty == .medium ? Color(hex: 0xd29922) : Color(hex: 0x3fb950)),
                        height: 6
                    )
                }
            }
        }
        .cardStyle()
    }

    private func masteryCard(_ overview: ProgressOverview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeaderView(title: "掌握度雷达", subtitle: "薄弱在前")
            if overview.mastery.isEmpty {
                Text("标记学习进度、刷题 AC 并完成面试后，这里会展示各知识点的掌握度")
                    .font(.caption)
                    .foregroundStyle(Color.faint)
            } else {
                RadarChart(values: overview.mastery.prefix(8).map { .init(label: $0.knowledgePoint, value: $0.mastery) })
                    .frame(height: 230)
                Text("三路信号加权（学习 0.2 · 刷题 0.5 · 面试 0.3）")
                    .font(.caption2)
                    .foregroundStyle(Color.faint)
                VStack(spacing: 8) {
                    ForEach(Array(overview.mastery.prefix(8))) { mastery in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(mastery.knowledgePoint)
                                    .font(.footnote.weight(.medium))
                                    .lineLimit(1)
                                Spacer()
                                Text(Fmt.masteryPercent(mastery.mastery))
                                    .font(.mono(.caption).weight(.semibold))
                                    .foregroundStyle(mastery.mastery < 0.4 ? Color.accent400 : Color.accent300)
                            }
                            HStack(spacing: 6) {
                                ChipView(text: "学习 \(signalText(mastery.signals.learn))")
                                ChipView(text: "刷题 \(signalText(mastery.signals.problem))")
                                ChipView(text: "面试 \(signalText(mastery.signals.interview))")
                            }
                            ProgressBarView(value: mastery.mastery, height: 4)
                        }
                        .padding(10)
                        .background(Color.page, in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
        .cardStyle()
    }

    private func signalText(_ value: Double?) -> String {
        guard let value else { return "-" }
        return Fmt.percent(value)
    }

    private func quotaCard(_ quota: QuotaMe) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeaderView(title: "配额用量")
            ForEach(quota.current) { usage in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(usage.kind.label)
                            .font(.footnote)
                        Spacer()
                        if let limit = usage.quota {
                            Text("今日已用 \(usage.used) / \(limit) 次")
                                .font(.mono(.caption))
                                .foregroundStyle(usage.used >= limit ? Color.accent400 : Color.muted)
                        } else {
                            Text("今日已用 \(usage.used) 次 · 不限量")
                                .font(.mono(.caption))
                                .foregroundStyle(Color.muted)
                        }
                    }
                    if let limit = usage.quota {
                        ProgressBarView(value: Double(usage.used) / Double(max(1, limit)), height: 5)
                    }
                }
            }
            Text("统计周期：按天（UTC），每日重置")
                .font(.caption2)
                .foregroundStyle(Color.faint)
        }
        .cardStyle()
    }
}

// ---------------------------------------------------------------------------
// 雷达图（Canvas 自绘，对齐 web 手写 SVG 正 n 边形）
// ---------------------------------------------------------------------------

private struct RadarValue {
    let label: String
    let value: Double
}

private struct RadarChart: View {
    let values: [RadarValue]

    var body: some View {
        Canvas { context, size in
            guard values.count >= 3 else {
                // 少于 3 轴画不了雷达，退化为进度条列表由外层处理
                return
            }
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2 - 26
            let count = values.count

            func point(axis: Int, ratio: Double) -> CGPoint {
                let angle = -Double.pi / 2 + Double(axis) * 2 * .pi / Double(count)
                return CGPoint(
                    x: center.x + radius * ratio * CGFloat(cos(angle)),
                    y: center.y + radius * ratio * CGFloat(sin(angle))
                )
            }

            // 网格环（0.25 / 0.5 / 0.75 / 1）
            for ring in [0.25, 0.5, 0.75, 1.0] {
                var path = Path()
                for axis in 0...count {
                    let p = point(axis: axis % count, ratio: ring)
                    if axis == 0 { path.move(to: p) } else { path.addLine(to: p) }
                }
                context.stroke(path, with: .color(Color.divider), lineWidth: 1)
            }

            // 轴线
            for axis in 0..<count {
                var path = Path()
                path.move(to: center)
                path.addLine(to: point(axis: axis, ratio: 1))
                context.stroke(path, with: .color(Color.divider), lineWidth: 1)
            }

            // 数据多边形
            var dataPath = Path()
            for axis in 0...count {
                let value = values[axis % count].value
                let p = point(axis: axis % count, ratio: max(0.02, min(1, value)))
                if axis == 0 { dataPath.move(to: p) } else { dataPath.addLine(to: p) }
            }
            context.fill(dataPath, with: .color(Color.accent600.opacity(0.25)))
            context.stroke(dataPath, with: .color(Color.accent600), lineWidth: 2)

            // 数据点
            for axis in 0..<count {
                let p = point(axis: axis, ratio: max(0.02, min(1, values[axis].value)))
                context.fill(
                    Path(ellipseIn: CGRect(x: p.x - 3, y: p.y - 3, width: 6, height: 6)),
                    with: .color(Color.accent600)
                )
            }

            // 轴标签
            for axis in 0..<count {
                let p = point(axis: axis, ratio: 1.18)
                context.draw(
                    Text(values[axis].label)
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundColor(Color.muted),
                    at: p
                )
            }
        }
    }
}
