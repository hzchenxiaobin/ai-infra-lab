import SwiftUI

// ---------------------------------------------------------------------------
// 面试题库管理（web /bank）：筛选 + 分页 + QuestionCard 展开 + 新增/编辑 +
// JSON 批量导入 + 一键播种。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class BankModel {
    var category: Category?
    var difficulty: Difficulty?
    var searchText = ""
    var page = 1
    let pageSize = 10

    var result: QuestionListResult?
    var loading = false
    var errorMessage: String?
    var infoMessage: String?

    private var searchTask: Task<Void, Never>?

    var totalPages: Int {
        guard let result else { return 1 }
        return max(1, Int(ceil(Double(result.total) / Double(result.pageSize))))
    }

    func onSearchChange() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            page = 1
            await load()
        }
    }

    func setCategory(_ value: Category?) {
        category = value
        page = 1
        Task { await load() }
    }

    func setDifficulty(_ value: Difficulty?) {
        difficulty = value
        page = 1
        Task { await load() }
    }

    func load() async {
        loading = true
        errorMessage = nil
        defer { loading = false }
        do {
            let trimmed = searchText.trimmingCharacters(in: .whitespaces)
            result = try await Services.shared.api.questionList(
                category: category,
                difficulty: difficulty,
                search: trimmed.isEmpty ? nil : trimmed,
                page: page,
                pageSize: pageSize
            )
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }

    func remove(_ question: BankQuestion) async {
        do {
            try await Services.shared.api.questionRemove(id: question.id)
            infoMessage = "已删除「\(question.title)」"
            await load()
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }

    func seed() async {
        do {
            let result = try await Services.shared.api.questionSeed()
            infoMessage = result.seeded > 0
                ? "已播种 \(result.seeded) 题，跳过 \(result.skipped) 题"
                : "种子题已全部存在（跳过 \(result.skipped) 题）"
            await load()
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}

struct BankScreen: View {
    @State private var model = BankModel()
    @State private var editingQuestion: BankQuestion?
    @State private var creating = false
    @State private var importing = false
    @State private var confirmingSeed = false
    @State private var deletingQuestion: BankQuestion?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                filterBar

                if let info = model.infoMessage {
                    Text(info)
                        .font(.footnote)
                        .foregroundStyle(Color(hex: 0x3fb950))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color(hex: 0x3fb950).opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                }
                if let error = model.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Color.accent400)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if model.loading && model.result == nil {
                    LoadingView(text: "加载题库…")
                } else if let items = model.result?.items, !items.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(items) { question in
                            QuestionCard(
                                question: question,
                                onDelete: { deletingQuestion = question },
                                onEdit: { editingQuestion = question }
                            )
                        }
                    }
                    paginationBar
                } else if model.result != nil {
                    EmptyBoxView(text: "没有符合条件的题目；可「一键播种」导入内置题库")
                }
            }
            .padding(16)
        }
        .background(Color.page)
        .task { await model.load() }
        .refreshable { await model.load() }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    creating = true
                } label: {
                    Image(systemName: "plus")
                }
                Menu {
                    Button {
                        importing = true
                    } label: {
                        Label("批量导入", systemImage: "square.and.arrow.down")
                    }
                    Button {
                        confirmingSeed = true
                    } label: {
                        Label("一键播种", systemImage: "leaf")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $creating) {
            QuestionFormSheet(onSaved: {
                creating = false
                Task { await model.load() }
            })
        }
        .sheet(item: $editingQuestion) { question in
            QuestionFormSheet(editing: question, onSaved: {
                editingQuestion = nil
                Task { await model.load() }
            })
        }
        .sheet(isPresented: $importing) {
            ImportSheet { message in
                importing = false
                model.infoMessage = message
                Task { await model.load() }
            }
        }
        .confirmationDialog("一键播种内置题库？", isPresented: $confirmingSeed, titleVisibility: .visible) {
            Button("播种（幂等，重复执行自动跳过）") {
                Task { await model.seed() }
            }
        }
        .confirmationDialog(
            "删除题目「\(deletingQuestion?.title ?? "")」？",
            isPresented: Binding(
                get: { deletingQuestion != nil },
                set: { if !$0 { deletingQuestion = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("删除", role: .destructive) {
                if let question = deletingQuestion {
                    Task { await model.remove(question) }
                }
                deletingQuestion = nil
            }
        }
    }

    private var filterBar: some View {
        VStack(spacing: 10) {
            Picker("方向", selection: Binding(
                get: { model.category },
                set: { model.setCategory($0) }
            )) {
                Text("全部方向").tag(Category?.none)
                ForEach(Category.allCases) { Text($0.label).tag(Category?.some($0)) }
            }
            .pickerStyle(.segmented)

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

                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.footnote)
                        .foregroundStyle(Color.faint)
                    TextField("搜索标题", text: $model.searchText)
                        .font(.footnote)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onChange(of: model.searchText) { model.onSearchChange() }
                        .submitLabel(.search)
                        .onSubmit { model.page = 1; Task { await model.load() } }
                }
                .padding(.horizontal, 10)
                .frame(height: 32)
                .background(Color.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(Color.line))
            }
        }
    }

    @ViewBuilder
    private var paginationBar: some View {
        if let result = model.result, result.total > result.pageSize {
            HStack {
                Button {
                    model.page -= 1
                    Task { await model.load() }
                } label: {
                    Image(systemName: "chevron.left").frame(width: 36, height: 32)
                }
                .buttonStyle(.bordered)
                .tint(Color.accent600)
                .disabled(model.page <= 1)

                Text("\(model.page) / \(model.totalPages) · 共 \(result.total) 题")
                    .font(.mono(.footnote))
                    .foregroundStyle(Color.muted)

                Button {
                    model.page += 1
                    Task { await model.load() }
                } label: {
                    Image(systemName: "chevron.right").frame(width: 36, height: 32)
                }
                .buttonStyle(.bordered)
                .tint(Color.accent600)
                .disabled(model.page >= model.totalPages)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

// ---------------------------------------------------------------------------
// 题目卡片（可展开）
// ---------------------------------------------------------------------------

private struct QuestionCard: View {
    let question: BankQuestion
    let onDelete: () -> Void
    let onEdit: () -> Void
    @State private var expanded = false

    private var judgeProblemId: String? {
        judgeProblemIdFromSourceKey(question.sourceKey)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { expanded.toggle() }
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        ChipView(text: question.category.label, accent: true)
                        DifficultyBadge(difficulty: question.difficulty)
                        if question.isShared {
                            ChipView(text: "共享题库")
                        } else {
                            ChipView(text: "私有")
                        }
                        Spacer()
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(.caption)
                            .foregroundStyle(Color.faint)
                    }
                    Text(question.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.ink)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 8) {
                        if !question.tags.isEmpty {
                            ForEach(question.tags.split(separator: ",").prefix(3), id: \.self) { tag in
                                ChipView(text: String(tag).trimmingCharacters(in: .whitespaces))
                            }
                        }
                        Text("更新于 \(Fmt.date(question.updatedAt))")
                            .font(.caption2)
                            .foregroundStyle(Color.faint)
                    }
                }
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: 10) {
                    Text(question.content)
                        .font(.mono(.footnote))
                        .foregroundStyle(Color.ink)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.page, in: RoundedRectangle(cornerRadius: 8))

                    if !question.followUps.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("预设追问")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Color.muted)
                            ForEach(Array(question.followUps.enumerated()), id: \.offset) { index, followUp in
                                Text("\(index + 1). \(followUp)")
                                    .font(.caption)
                                    .foregroundStyle(Color.muted)
                            }
                        }
                    }

                    if !question.keyPoints.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("考察要点")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Color.muted)
                            Text(question.keyPoints)
                                .font(.caption)
                                .foregroundStyle(Color.muted)
                        }
                    }

                    if !question.source.isEmpty {
                        Text("来源：\(question.source)")
                            .font(.caption2)
                            .foregroundStyle(Color.faint)
                    }

                    HStack(spacing: 12) {
                        if let judgeProblemId {
                            NavigationLink(value: ProblemsRoute.judge(judgeProblemId)) {
                                Label("在线评测", systemImage: "play")
                            }
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(Color.accent400)
                        }
                        if !question.isShared {
                            Button {
                                onEdit()
                            } label: {
                                Label("编辑", systemImage: "pencil")
                            }
                            .font(.footnote)
                            .foregroundStyle(Color.muted)
                            Button(role: .destructive) {
                                onDelete()
                            } label: {
                                Label("删除", systemImage: "trash")
                            }
                            .font(.footnote)
                            .foregroundStyle(Color.accent600)
                        }
                        Spacer()
                    }
                }
            }
        }
        .padding(14)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.divider))
    }
}
