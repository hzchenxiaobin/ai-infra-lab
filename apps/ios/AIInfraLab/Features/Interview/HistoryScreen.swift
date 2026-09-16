import SwiftUI

// ---------------------------------------------------------------------------
// 面试历史（web /history）：方向平均分条形图 + 近 10 场趋势折线 + 全部场次列表。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class HistoryModel {
    var stats: InterviewStats?
    var sessions: [SessionRow] = []
    var loading = false
    var errorMessage: String?

    func load() async {
        loading = true
        errorMessage = nil
        defer { loading = false }
        do {
            let api = Services.shared.api
            async let stats = api.interviewStats()
            async let sessions = api.interviewList()
            self.stats = try await stats
            self.sessions = try await sessions
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }

    func remove(_ session: SessionRow) async {
        do {
            try await Services.shared.api.removeInterview(sessionId: session.id)
            await load()
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}

struct HistoryScreen: View {
    let openRoom: (Int) -> Void
    let openReport: (Int) -> Void
    @State private var model = HistoryModel()
    @State private var deletingSession: SessionRow?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if model.loading && model.sessions.isEmpty {
                    LoadingView(text: "加载历史…")
                } else if let error = model.errorMessage, model.sessions.isEmpty {
                    ErrorBoxView(message: error) { Task { await model.load() } }
                } else if model.sessions.isEmpty {
                    EmptyBoxView(text: "暂无面试记录")
                } else {
                    if let stats = model.stats {
                        averagesCard(stats)
                        trendCard(stats)
                    }
                    sessionsCard
                }
            }
            .padding(16)
        }
        .background(Color.page)
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    /// 方向平均分（A=4 · B=3 · C=2 · D=1 分制）
    private func averagesCard(_ stats: InterviewStats) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeaderView(title: "方向平均分", subtitle: "A=4 · B=3 · C=2 · D=1")
            if stats.categoryAverages.isEmpty {
                Text("完成面试后这里会展示各方向平均分")
                    .font(.caption)
                    .foregroundStyle(Color.faint)
            } else {
                ForEach(stats.categoryAverages) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(Category(rawValue: item.category)?.label ?? item.category)
                                .font(.footnote)
                                .foregroundStyle(Color.ink)
                            Spacer()
                            Text(String(format: "%.1f 分 · %d 场", item.average, item.sessions))
                                .font(.mono(.caption))
                                .foregroundStyle(Color.muted)
                        }
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.divider)
                                Capsule()
                                    .fill(Color.accent600.opacity(0.85))
                                    .frame(width: geo.size.width * min(1, item.average / 4))
                            }
                        }
                        .frame(height: 8)
                    }
                }
            }
        }
        .cardStyle()
    }

    /// 近 10 场趋势折线（y 轴 A–D 等级线）
    private func trendCard(_ stats: InterviewStats) -> some View {
        let points = stats.trend.filter { $0.score != nil }
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeaderView(title: "近 10 场趋势", subtitle: "共完成 \(stats.totalFinished) 场")
            if points.count < 2 {
                Text("完成至少两场面试后展示趋势")
                    .font(.caption)
                    .foregroundStyle(Color.faint)
            } else {
                TrendChart(points: points)
                    .frame(height: 150)
            }
        }
        .cardStyle()
    }

    private var sessionsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeaderView(title: "全部场次", subtitle: "\(model.sessions.count) 场")
            VStack(spacing: 8) {
                ForEach(model.sessions) { session in
                    SessionRowView(session: session, showDelete: true) {
                        deletingSession = session
                    }
                }
            }
        }
    }
}

/// 趋势折线图（Canvas 自绘，对齐 web 手写 SVG 折线）
private struct TrendChart: View {
    let points: [InterviewStats.TrendPoint]

    var body: some View {
        GeometryReader { geo in
            let insets = EdgeInsets(top: 10, leading: 10, bottom: 20, trailing: 10)
            let width = geo.size.width - insets.leading - insets.trailing
            let height = geo.size.height - insets.top - insets.bottom
            let stepX = width / CGFloat(max(1, points.count - 1))

            ZStack(alignment: .topLeading) {
                // y 轴刻度线 A-D
                ForEach(Array(["A", "B", "C", "D"].enumerated()), id: \.offset) { index, grade in
                    let y = insets.top + height * CGFloat(index) / 3
                    VStack(alignment: .leading, spacing: 0) {
                        Path { p in
                            p.move(to: CGPoint(x: insets.leading, y: y))
                            p.addLine(to: CGPoint(x: insets.leading + width, y: y))
                        }
                        .stroke(Color.divider, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        Text(grade)
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundStyle(Color.faint)
                            .offset(x: 0, y: -6)
                            .position(x: insets.leading - 6, y: y)
                    }
                }

                // 折线
                Path { path in
                    for (index, point) in points.enumerated() {
                        let x = insets.leading + stepX * CGFloat(index)
                        let score = CGFloat(point.score ?? 0)
                        let y = insets.top + height * (4 - score) / 3
                        if index == 0 {
                            path.move(to: CGPoint(x: x, y: y))
                        } else {
                            path.addLine(to: CGPoint(x: x, y: y))
                        }
                    }
                }
                .stroke(Color.accent600, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))

                // 数据点 + 标签
                ForEach(Array(points.enumerated()), id: \.element.id) { index, point in
                    let x = insets.leading + stepX * CGFloat(index)
                    let score = CGFloat(point.score ?? 0)
                    let y = insets.top + height * (4 - score) / 3
                    Circle()
                        .fill(Color.accent600)
                        .frame(width: 6, height: 6)
                        .position(x: x, y: y)
                    Text(Fmt.monthDay.string(from: point.createdAt))
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundStyle(Color.faint)
                        .position(
                            x: min(max(x, insets.leading + 16), insets.leading + width - 16),
                            y: insets.top + height + 10
                        )
                    if let grade = point.overallGrade {
                        Text(grade)
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(Color.accent300)
                            .position(x: x, y: max(y - 10, insets.top - 2))
                    }
                }
            }
        }
    }
}
