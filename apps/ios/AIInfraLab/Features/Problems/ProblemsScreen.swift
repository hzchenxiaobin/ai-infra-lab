import SwiftUI

// ---------------------------------------------------------------------------
// 刷题 Tab（web /problems/gpu | /problems/algo）：
// 分区切换 + 5 组筛选 + 防抖搜索 + GPU 知识领域 A–L 分组 + 高频/中频分组 + 分页。
// ---------------------------------------------------------------------------

enum ProblemsRoute: Hashable {
    case judge(String)
    case problemList(String)
    case contest(Int)
}

@MainActor
@Observable
final class ProblemsModel {
    enum Partition: String, CaseIterable, Identifiable {
        case gpu, algo
        var id: String { rawValue }
        var label: String { self == .gpu ? "GPU 题库" : "算法题库" }
        var source: ProblemSource { self == .gpu ? .leetgpu : .leetcode }
        var description: String {
            self == .gpu
                ? "选自 CUDA 手撕面经的高频 + 中频题（34 题），评测跳转 leetgpu.com"
                : "LeetCode 全量题库（按题号 / 标签筛选），支持站内评测"
        }
    }

    var partition: Partition = .gpu

    // 筛选状态
    var difficulty: Difficulty?
    var progressFilter: String?
    var tag: String?
    var knowledgePoint: String?
    var judgeType: JudgeType?
    var searchText = ""

    var page = 1
    let pageSize = 50

    var items: [ProblemListItem] = []
    var total = 0
    var acCount = 0
    var facets = ProblemFacets(tags: [], knowledgePoints: [])
    var loading = false
    var errorMessage: String?

    private var searchTask: Task<Void, Never>?

    var totalPages: Int { max(1, Int(ceil(Double(total) / Double(pageSize)))) }

    func handleProgressChanged() {
        Task { await load(resetPage: true) }
    }

    func switchPartition(_ target: Partition) {
        guard partition != target else { return }
        partition = target
        difficulty = nil
        progressFilter = nil
        tag = nil
        knowledgePoint = nil
        judgeType = nil
        searchText = ""
        page = 1
        Task { await load(resetPage: true) }
        Task { await loadFacets() }
    }

    func setDifficulty(_ value: Difficulty?) {
        difficulty = value
        page = 1
        Task { await load(resetPage: true) }
    }

    func setProgressFilter(_ value: String?) {
        progressFilter = value
        page = 1
        Task { await load(resetPage: true) }
    }

    func setJudgeType(_ value: JudgeType?) {
        judgeType = value
        page = 1
        Task { await load(resetPage: true) }
    }

    func setTag(_ value: String?) {
        tag = value
        page = 1
        Task { await load(resetPage: true) }
    }

    func setKnowledgePoint(_ value: String?) {
        knowledgePoint = value
        page = 1
        Task { await load(resetPage: true) }
    }

    func onSearchChange() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            page = 1
            await load(resetPage: true)
        }
    }

    func load(resetPage: Bool = false) async {
        if resetPage && page != 1 { page = 1 }
        loading = true
        errorMessage = nil
        defer { loading = false }
        do {
            let trimmed = searchText.trimmingCharacters(in: .whitespaces)
            let result = try await Services.shared.api.problemList(
                difficulty: difficulty,
                source: partition.source,
                judgeType: judgeType,
                tag: tag,
                knowledgePoint: knowledgePoint,
                search: trimmed.isEmpty ? nil : trimmed,
                progress: progressFilter.flatMap { raw in
                    ["unseen", "seen", "ac"].contains(raw) ? raw : nil
                }.flatMap(ProgressStatus.init(rawValue:)),
                page: page,
                pageSize: pageSize
            )
            items = result.items
            total = result.total
            acCount = result.items.filter(\.ac).count
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }

    func loadFacets() async {
        do {
            facets = try await Services.shared.api.problemFacets(source: partition.source)
        } catch {
            // facets 失败不打断主列表
        }
    }

    func nextPage() {
        guard page < totalPages else { return }
        page += 1
        Task { await load() }
    }

    func prevPage() {
        guard page > 1 else { return }
        page -= 1
        Task { await load() }
    }
}

/// GPU 知识领域 A–L（对齐 contracts.GPU_DOMAINS）
private let GPU_DOMAINS: [(letter: String, slug: String)] = [
    ("A", "parallel-patterns"), ("B", "convolution-pooling"), ("C", "reduction-scan"),
    ("D", "gemm"), ("E", "attention"), ("F", "normalization-embedding"),
    ("G", "transformer-inference"), ("H", "quantization"), ("I", "sampling-sorting-search"),
    ("J", "advanced-algorithms-math"), ("K", "losses-basic-ml"), ("L", "simulation-misc"),
]

struct ProblemsScreen: View {
    @State private var model = ProblemsModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    headerView
                    filterBar
                    if model.partition == .gpu {
                        domainBar
                    }
                    if model.partition == .algo {
                        entryLinks
                    }
                    resultSummary
                    listSection
                    paginationBar
                }
                .padding(16)
            }
            .background(Color.page)
            .navigationTitle("刷题")
            .task {
                await model.load(resetPage: true)
                await model.loadFacets()
            }
            .onReceive(NotificationCenter.default.publisher(for: .progressChanged)) { _ in
                model.handleProgressChanged()
            }
            .refreshable {
                await model.load(resetPage: true)
                await model.loadFacets()
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
            .navigationDestination(for: ProblemsRouteListRoute.self) { _ in
                ProblemListsScreen()
            }
            .navigationDestination(for: ContestListRoute.self) { _ in
                ContestListScreen()
            }
        }
    }

    private var headerView: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("分区", selection: Binding(
                get: { model.partition },
                set: { model.switchPartition($0) }
            )) {
                ForEach(ProblemsModel.Partition.allCases) { partition in
                    Text(partition.label).tag(partition)
                }
            }
            .pickerStyle(.segmented)
            Text(model.partition.description)
                .font(.caption)
                .foregroundStyle(Color.muted)
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterMenu(title: "难度", selection: Binding(
                    get: { model.difficulty?.rawValue },
                    set: { model.setDifficulty($0.flatMap(Difficulty.init(rawValue:))) }
                ), options: [
                    .init("全部难度", nil),
                    .init("简单", Difficulty.easy.rawValue),
                    .init("中等", Difficulty.medium.rawValue),
                    .init("困难", Difficulty.hard.rawValue),
                ])

                FilterMenu(title: "状态", selection: Binding(
                    get: { model.progressFilter },
                    set: { model.setProgressFilter($0) }
                ), options: [
                    .init("全部状态", nil),
                    .init("没写过", "unseen"),
                    .init("需复习", "seen"),
                    .init("已完全掌握", "ac"),
                ])

                FilterMenu(title: "评测方式", selection: Binding(
                    get: { model.judgeType?.rawValue },
                    set: { model.setJudgeType($0.flatMap(JudgeType.init(rawValue:))) }
                ), options: [
                    .init("全部", nil),
                    .init("站内评测", JudgeType.internal.rawValue),
                    .init("leetgpu 评测", JudgeType.leetgpuCom.rawValue),
                    .init("不可评测", JudgeType.none.rawValue),
                ])

                if !model.facets.tags.isEmpty {
                    FilterMenu(title: "标签", selection: Binding(
                        get: { model.tag },
                        set: { model.setTag($0) }
                    ), options: [.init("全部标签", nil)] + model.facets.tags.map {
                        .init("\($0.value)（\($0.count)）", $0.value)
                    })
                }

                if !model.facets.knowledgePoints.isEmpty {
                    FilterMenu(title: "知识点", selection: Binding(
                        get: { model.knowledgePoint },
                        set: { model.setKnowledgePoint($0) }
                    ), options: [.init("全部知识点", nil)] + model.facets.knowledgePoints.map {
                        .init("\($0.value)（\($0.count)）", $0.value)
                    })
                }
            }
        }
    }

    /// GPU 分区：A–L 知识领域快捷分组
    private var domainBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(GPU_DOMAINS, id: \.letter) { domain in
                    let active = model.knowledgePoint == domain.slug
                    Button {
                        model.setKnowledgePoint(active ? nil : domain.slug)
                    } label: {
                        Text(domain.letter)
                            .font(.mono(.footnote).weight(.medium))
                            .frame(width: 34, height: 34)
                            .background(active ? Color.accent600 : Color.surface, in: Circle())
                            .overlay(Circle().strokeBorder(active ? Color.accent600 : Color.line))
                            .foregroundStyle(active ? Color.ink : Color.muted)
                    }
                }
            }
        }
    }

    /// 算法分区：题单 / 周赛入口
    private var entryLinks: some View {
        HStack(spacing: 8) {
            NavigationLink(value: ProblemsRouteListRoute()) { entryChip("题单") }
            NavigationLink(value: ContestListRoute()) { entryChip("周赛") }
            Spacer()
        }
    }

    private func entryChip(_ text: String) -> some View {
        Text(text)
            .font(.footnote.weight(.medium))
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(Color.accent50, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.accent200.opacity(0.5)))
            .foregroundStyle(Color.accent300)
    }

    private var resultSummary: some View {
        Group {
            if model.loading && model.items.isEmpty {
                LoadingView(text: "加载题库…")
            } else if let error = model.errorMessage, model.items.isEmpty {
                ErrorBoxView(message: error) {
                    Task { await model.load(resetPage: true) }
                }
            } else if model.items.isEmpty {
                EmptyBoxView(text: "没有符合条件的题目")
            } else {
                Text("共 \(model.total) 题 · 当前页已完全掌握 \(model.acCount)")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
            }
        }
    }

    @ViewBuilder
    private var listSection: some View {
        if model.partition == .gpu, model.knowledgePoint == nil {
            let high = model.items.filter { $0.tier == "high" }
            let mid = model.items.filter { $0.tier == "mid" }
            let others = model.items.filter { $0.tier == nil }
            VStack(alignment: .leading, spacing: 16) {
                if !high.isEmpty {
                    problemGroup(title: "高频（面经几乎必考）", items: high)
                }
                if !mid.isEmpty {
                    problemGroup(title: "中频", items: mid)
                }
                if !others.isEmpty {
                    problemGroup(title: "其他", items: others)
                }
            }
        } else if !model.items.isEmpty {
            problemCard(items: model.items)
        }
    }

    private func problemGroup(title: String, items: [ProblemListItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeaderView(title: title, subtitle: "\(items.count) 题")
            problemCard(items: items)
        }
    }

    private func problemCard(items: [ProblemListItem]) -> some View {
        VStack(spacing: 0) {
            ForEach(items) { item in
                ProblemRow(problem: item)
                Divider().overlay(Color.divider)
            }
        }
        .background(Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.divider))
    }

    @ViewBuilder
    private var paginationBar: some View {
        if model.total > model.pageSize {
            HStack {
                Button {
                    model.prevPage()
                } label: {
                    Image(systemName: "chevron.left")
                        .frame(width: 36, height: 32)
                }
                .buttonStyle(.bordered)
                .tint(Color.accent600)
                .disabled(model.page <= 1)

                Text("\(model.page) / \(model.totalPages)")
                    .font(.mono(.footnote))
                    .foregroundStyle(Color.muted)

                Button {
                    model.nextPage()
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(width: 36, height: 32)
                }
                .buttonStyle(.bordered)
                .tint(Color.accent600)
                .disabled(model.page >= model.totalPages)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

/// 题单 / 周赛列表的路由标记（进入独立列表页）
struct ProblemsRouteListRoute: Hashable {}
struct ContestListRoute: Hashable {}
