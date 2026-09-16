import SwiftUI

// ---------------------------------------------------------------------------
// 面试 Tab（web /start /bank /history 共用二级导航）+ 开始面试（组卷三步表单）。
// ---------------------------------------------------------------------------

enum InterviewRoute: Hashable {
    case room(Int)
    /// assumeFinished：本地刚点完「结束本场」直接进报告页（服务端报告可能还在生成）
    case report(Int, assumeFinished: Bool)
}

struct InterviewHomeScreen: View {
    enum Section: String, CaseIterable, Identifiable {
        case start = "开始面试"
        case bank = "题库"
        case history = "历史"
        var id: String { rawValue }
    }

    @State private var section: Section = .start
    @State private var path: [InterviewRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                Picker("板块", selection: $section) {
                    ForEach(Section.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 4)

                switch section {
                case .start:
                    StartScreen(openRoom: { id in
                        path.append(.room(id))
                    })
                case .bank:
                    BankScreen()
                case .history:
                    HistoryScreen(openRoom: { id in path.append(.room(id)) },
                                  openReport: { id in path.append(.report(id, assumeFinished: false)) })
                }
            }
            .background(Color.page)
            .navigationTitle("面试")
            .navigationDestination(for: InterviewRoute.self) { route in
                switch route {
                case .room(let id):
                    InterviewRoomScreen(sessionId: id) { finishedId in
                        path.append(.report(finishedId, assumeFinished: true))
                    }
                case .report(let id, let assumeFinished):
                    ReportScreen(sessionId: id, assumeFinished: assumeFinished)
                }
            }
            .navigationDestination(for: ProblemsRoute.self) { route in
                switch route {
                case .judge(let id):
                    JudgeScreen(problemId: id)
                case .problemList(let slug):
                    ProblemListDetailScreen(slug: slug)
                case .contest(let session):
                    ContestSessionScreen(session: session)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 开始面试
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class StartModel {
    var stats: QuestionStats?
    var scopes: QuestionScopes?
    var sessions: [SessionRow] = []

    var selectedCategories: Set<Category> = []
    var scopeSelection: ScopeSelection = .none
    var count = 3
    var starting = false
    var errorMessage: String?

    enum ScopeSelection: Equatable {
        case none
        case topic(QuestionScopes.ScopeItem)
        case week(QuestionScopes.ScopeItem)
        case day(QuestionScopes.DayItem)

        var scopeValue: String? {
            switch self {
            case .none: return nil
            case .topic(let item): return item.scope
            case .week(let item): return item.scope
            case .day(let item): return item.scope
            }
        }

        var label: String {
            switch self {
            case .none: return "按方向混合"
            case .topic(let item): return "\(item.name) 专题"
            case .week(let item): return item.name.replacingOccurrences(of: "week", with: "Week ")
            case .day(let item):
                return item.week.replacingOccurrences(of: "week", with: "Week ")
                    + " · " + item.day.replacingOccurrences(of: "day", with: "Day ")
            }
        }
    }

    var canStart: Bool {
        !starting && (scopeSelection != .none || !selectedCategories.isEmpty)
    }

    var finishedCount: Int { sessions.filter { $0.status == .finished }.count }
    var activeCount: Int { sessions.filter { $0.status == .active }.count }

    func load() async {
        do {
            let api = Services.shared.api
            async let stats = api.questionStats()
            async let scopes = api.questionScopes()
            async let sessions = api.interviewList()
            self.stats = try await stats
            self.scopes = try await scopes
            self.sessions = try await sessions
        } catch {
            // 统计加载失败不阻塞表单
        }
    }

    func start() async -> Int? {
        guard canStart else { return nil }
        starting = true
        errorMessage = nil
        defer { starting = false }
        do {
            let result = try await Services.shared.api.startInterview(
                categories: Array(selectedCategories),
                count: count,
                scope: scopeSelection.scopeValue
            )
            Haptics.success()
            return result.state.sessionId
        } catch let error as TRPCError {
            errorMessage = error.message
            Haptics.warning()
            return nil
        } catch {
            errorMessage = "网络异常，请稍后重试"
            return nil
        }
    }
}

struct StartScreen: View {
    let openRoom: (Int) -> Void
    @State private var model = StartModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                stepCard
                statsBand
                recentSessions
            }
            .padding(16)
        }
        .background(Color.page)
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    // MARK: 三步组卷

    private var stepCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            // 01 选择方向
            VStack(alignment: .leading, spacing: 10) {
                Text("01 · 选择方向")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.faint)
                let scopeActive = model.scopeSelection != .none
                ForEach(Category.allCases) { category in
                    let count = model.stats?.byCategory.byCategory(category) ?? 0
                    let selected = model.selectedCategories.contains(category)
                    Button {
                        if selected {
                            model.selectedCategories.remove(category)
                        } else {
                            model.selectedCategories.insert(category)
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(category.label)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Color.ink)
                                Text("\(count) 题")
                                    .font(.caption2)
                                    .foregroundStyle(Color.muted)
                            }
                            Spacer()
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selected ? Color.accent600 : Color.faint)
                        }
                        .padding(12)
                        .background(
                            selected ? Color.accent50 : Color.page,
                            in: RoundedRectangle(cornerRadius: 12)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(selected ? Color.accent200 : Color.line)
                        )
                        .opacity(scopeActive ? 0.45 : 1)
                    }
                    .buttonStyle(.plain)
                    .disabled(scopeActive)
                }
                if scopeActive {
                    Text("已选择考察范围，按方向选题自动忽略")
                        .font(.caption2)
                        .foregroundStyle(Color.faint)
                }
            }

            Divider().overlay(Color.divider)

            // 02 考察范围
            VStack(alignment: .leading, spacing: 10) {
                Text("02 · 考察范围")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.faint)
                HStack(spacing: 8) {
                    scopeMenu
                    if case .week(let week) = model.scopeSelection {
                        dayMenu(for: week)
                    } else if case .day(let day) = model.scopeSelection {
                        dayMenu(for: QuestionScopes.ScopeItem(name: day.week, count: day.count, scope: day.scope))
                    }
                }
            }

            Divider().overlay(Color.divider)

            // 03 题量
            VStack(alignment: .leading, spacing: 10) {
                Text("03 · 题量")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.faint)
                HStack(spacing: 6) {
                    ForEach(1...5, id: \.self) { n in
                        Button {
                            model.count = n
                        } label: {
                            Text("\(n)")
                                .font(.mono(.subheadline).weight(.medium))
                                .frame(width: 38, height: 34)
                                .background(model.count == n ? Color.accent600 : Color.page, in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(model.count == n ? Color.accent600 : Color.line))
                                .foregroundStyle(model.count == n ? Color.ink : Color.muted)
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                }
            }

            if let error = model.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Color.accent400)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                Task {
                    if let id = await model.start() {
                        openRoom(id)
                    }
                }
            } label: {
                Group {
                    if model.starting {
                        ProgressView().tint(Color.ink)
                    } else {
                        Text("开始面试").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.accent600)
            .disabled(!model.canStart)
        }
        .cardStyle(padding: 20)
    }

    private var scopeMenu: some View {
        Menu {
            Button("按方向混合") { model.scopeSelection = .none }
            if let scopes = model.scopes {
                if !scopes.topics.isEmpty {
                    Section("按专题") {
                        ForEach(scopes.topics) { item in
                            Button("\(item.name)（\(item.count) 题）") {
                                model.scopeSelection = .topic(item)
                            }
                        }
                    }
                }
                if !scopes.weeks.isEmpty {
                    Section("按周") {
                        ForEach(scopes.weeks) { item in
                            let label = item.name.replacingOccurrences(of: "week", with: "Week ")
                            Button("\(label)（\(item.count) 题）") {
                                model.scopeSelection = .week(item)
                            }
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(model.scopeSelection.label)
                    .font(.footnote)
                Image(systemName: "chevron.down")
                    .font(.caption2)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(model.scopeSelection == .none ? Color.page : Color.accent50, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(model.scopeSelection == .none ? Color.line : Color.accent200))
            .foregroundStyle(model.scopeSelection == .none ? Color.muted : Color.accent300)
        }
    }

    private func dayMenu(for week: QuestionScopes.ScopeItem) -> some View {
        Menu {
            Button("整周") {
                if case .week(let item) = model.scopeSelection {
                    model.scopeSelection = .week(item)
                }
            }
            if let scopes = model.scopes {
                let days = scopes.days.filter { $0.week == week.name }
                ForEach(days) { day in
                    Button("\(day.day.replacingOccurrences(of: "day", with: "Day "))（\(day.count) 题）") {
                        model.scopeSelection = .day(day)
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(dayMenuLabel)
                    .font(.footnote)
                Image(systemName: "chevron.down")
                    .font(.caption2)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.page, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.line))
            .foregroundStyle(Color.muted)
        }
    }

    private var dayMenuLabel: String {
        if case .day(let day) = model.scopeSelection {
            return day.day.replacingOccurrences(of: "day", with: "Day ")
        }
        return "整天 / 单日"
    }

    // MARK: 统计带 + 最近场次

    private var statsBand: some View {
        HStack(spacing: 12) {
            StatBlock(value: "\(model.sessions.count)", label: "累计场次")
            StatBlock(value: "\(model.finishedCount)", label: "已完成")
            StatBlock(value: "\(model.activeCount)", label: "进行中")
        }
        .cardStyle()
    }

    private var recentSessions: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeaderView(title: "最近场次")
            if model.sessions.isEmpty {
                EmptyBoxView(text: "还没有面试记录，开始第一场吧")
            } else {
                VStack(spacing: 8) {
                    ForEach(model.sessions.prefix(5)) { session in
                        SessionRowView(session: session)
                    }
                }
            }
        }
    }
}

/// 场次行（开始面试 / 历史共用）
struct SessionRowView: View {
    let session: SessionRow
    var showDelete = false
    var onDelete: (() -> Void)?

    var body: some View {
        NavigationLink(
            value: session.status == .active
                ? InterviewRoute.room(session.id)
                : InterviewRoute.report(session.id, assumeFinished: false)
        ) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(session.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.ink)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        Text(Fmt.date(session.createdAt))
                            .font(.caption2)
                            .foregroundStyle(Color.faint)
                        Text("\(session.questionIds.count) 题")
                            .font(.caption2)
                            .foregroundStyle(Color.faint)
                        if let duration = session.durationMinutes {
                            Text("\(duration) 分钟")
                                .font(.caption2)
                                .foregroundStyle(Color.faint)
                        }
                    }
                }
                Spacer()
                if let grade = session.overallGrade {
                    GradeBadge(grade: grade)
                }
                if session.status == .active {
                    StatusPill(.active, "进行中")
                }
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Color.faint)
            }
            .padding(12)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.divider))
        }
        .buttonStyle(.plain)
        .contextMenu {
            if showDelete {
                Button(role: .destructive) {
                    onDelete?()
                } label: {
                    Label("删除场次（含消息与报告）", systemImage: "trash")
                }
            }
        }
    }
}

extension QuestionStats.ByCategory {
    func byCategory(_ category: Category) -> Int {
        switch category {
        case .leetcode: return leetcode
        case .cuda: return cuda
        case .knowledge: return knowledge
        }
    }
}
