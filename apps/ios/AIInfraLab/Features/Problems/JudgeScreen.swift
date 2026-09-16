import SwiftUI

// ---------------------------------------------------------------------------
// 在线评测（web /judge/:id）：示例用例 + 语言切换 + starter code + 提交
// + 1.5s 轮询 + 结果渲染（对齐 web JudgeResult）。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class JudgeModel {
    var problem: JudgeProblem?
    var errorMessage: String?

    var language: JudgeLanguage = .cpp
    var code = ""

    enum RunPhase: Equatable {
        case idle
        case queued
        case running
        case terminal(JudgeResultDTO)
    }

    var runPhase: RunPhase = .idle
    private var pollTask: Task<Void, Never>?

    func load(problemId: String) async {
        do {
            let problem = try await Services.shared.api.judgeGetProblem(problemId: problemId)
            self.problem = problem
            if problem.cpp.available {
                language = .cpp
                code = problem.cpp.starter ?? ""
            } else {
                language = .python
                code = problem.python.starter ?? ""
            }
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }

    var canRun: Bool {
        guard let problem else { return false }
        return spec(for: language).available && !problem.examples.isEmpty && !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isBusy
    }

    var isBusy: Bool {
        if case .idle = runPhase { return false }
        if case .terminal = runPhase { return false }
        return true
    }

    func spec(for language: JudgeLanguage) -> JudgeProblem.LangSpec {
        problem?.spec(for: language) ?? .init(available: false, reason: "尚未加载", starter: nil)
    }

    func switchLanguage(_ target: JudgeLanguage) {
        guard target != language, spec(for: target).available else { return }
        language = target
        code = spec(for: target).starter ?? ""
        runPhase = .idle
    }

    func submit() async {
        guard let problem, canRun else { return }
        runPhase = .queued
        do {
            let submissionId = try await Services.shared.api.judgeSubmit(
                problemId: problem.problem.id, language: language, code: code
            )
            runPhase = .running
            pollTask = Task {
                do {
                    try await Poller.loop(
                        interval: .milliseconds(1500),
                        fetch: { try await Services.shared.api.judgeGetResult(submissionId: submissionId) },
                        isTerminal: { $0.status.isTerminal },
                        onUpdate: { [weak self] result in
                            guard let self else { return }
                            if result.status.isTerminal {
                                self.runPhase = .terminal(result)
                                if result.status == .ac {
                                    Haptics.success()
                                    NotificationCenter.default.post(name: .progressChanged, object: nil)
                                } else {
                                    Haptics.warning()
                                }
                            } else {
                                self.runPhase = .running
                            }
                        }
                    )
                } catch {
                    self.runPhase = .idle
                }
            }
        } catch let error as TRPCError {
            runPhase = .idle
            errorMessage = error.message
        } catch {
            runPhase = .idle
            errorMessage = "网络异常，请稍后重试"
        }
    }

    func cancelPolling() {
        pollTask?.cancel()
    }
}

struct JudgeScreen: View {
    let problemId: String
    @State private var model = JudgeModel()

    var body: some View {
        Group {
            if let problem = model.problem {
                judgeBody(problem)
            } else if let error = model.errorMessage {
                ErrorBoxView(message: error) {
                    model.errorMessage = nil
                    Task { await model.load(problemId: problemId) }
                }
                .padding(24)
            } else {
                LoadingView(text: "加载评测题目…")
            }
        }
        .background(Color.page)
        .navigationTitle(model.problem.map { $0.problem.number > 0 ? "#\($0.problem.number)" : "评测" } ?? "评测")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load(problemId: problemId) }
        .onDisappear { model.cancelPolling() }
    }

    private func judgeBody(_ problem: JudgeProblem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        if problem.problem.number > 0 {
                            Text("#\(problem.problem.number)")
                                .font(.mono(.subheadline).weight(.semibold))
                                .foregroundStyle(Color.accent600)
                        }
                        Text(problem.problem.title)
                            .font(.headline)
                        DifficultyBadge(difficulty: problem.problem.difficulty)
                        Spacer()
                    }
                    Text("评测用例为题面示例（LeetCode 不公开完整测试集）")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                    if !problem.problem.url.isEmpty {
                        Button {
                            Services.shared.links.open(problem.problem.url, title: problem.problem.title)
                        } label: {
                            Label("查看题解", systemImage: "book")
                                .font(.caption)
                                .foregroundStyle(Color.accent400)
                        }
                    }
                }
                .cardStyle()

                examplesCard(problem)
                editorCard(problem)

                if let error = model.errorMessage {
                    ErrorBoxView(message: error) { model.errorMessage = nil }
                }

                if case .terminal(let result) = model.runPhase {
                    JudgeResultView(result: result)
                }
            }
            .padding(16)
        }
    }

    private func examplesCard(_ problem: JudgeProblem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeaderView(title: "示例用例", subtitle: "\(problem.examples.count) 条")
            if problem.examples.isEmpty {
                Text("该题未解析到示例用例，无法评测")
                    .font(.caption)
                    .foregroundStyle(Color.accent400)
            } else {
                ForEach(Array(problem.examples.enumerated()), id: \.element.id) { index, example in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("用例 \(index + 1)")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(Color.muted)
                        ForEach(example.args, id: \.name) { arg in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(arg.name)
                                    .font(.mono(.caption))
                                    .foregroundStyle(Color.faint)
                                Text(arg.value)
                                    .font(.mono(.caption))
                                    .foregroundStyle(Color.ink)
                                    .textSelection(.enabled)
                            }
                        }
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("期望")
                                .font(.mono(.caption))
                                .foregroundStyle(Color.accent600)
                            Text(example.expected)
                                .font(.mono(.caption))
                                .foregroundStyle(Color.ink)
                                .textSelection(.enabled)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.page, in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .cardStyle()
    }

    private func editorCard(_ problem: JudgeProblem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                ForEach(JudgeLanguage.allCases) { language in
                    let spec = model.spec(for: language)
                    Button {
                        model.switchLanguage(language)
                    } label: {
                        Text(language.label)
                            .font(.footnote.weight(.medium))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .background(model.language == language ? Color.accent600 : Color.surface, in: Capsule())
                            .foregroundStyle(model.language == language ? Color.ink : Color.muted)
                    }
                    .buttonStyle(.plain)
                    .disabled(!spec.available)
                    .opacity(spec.available ? 1 : 0.45)
                }
                Spacer()
            }

            let unavailableReason = model.spec(for: model.language).reason
            if !model.spec(for: model.language).available, let reason = unavailableReason {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(Color.accent400)
            }

            TextEditor(text: $model.code)
                .font(.mono(.footnote))
                .frame(minHeight: 240)
                .padding(8)
                .scrollContentBackground(.hidden)
                .background(Color.page, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.line))
                .disabled(model.isBusy)

            Button {
                Task { await model.submit() }
            } label: {
                HStack {
                    switch model.runPhase {
                    case .queued:
                        ProgressView().tint(Color.ink)
                        Text("已入队…")
                    case .running:
                        ProgressView().tint(Color.ink)
                        Text("评测中…")
                    default:
                        Image(systemName: "play.fill")
                        Text("提交评测")
                    }
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.accent600)
            .disabled(!model.canRun)
        }
        .cardStyle()
    }
}

// ---------------------------------------------------------------------------
// 评测结果渲染
// ---------------------------------------------------------------------------

struct JudgeResultView: View {
    let result: JudgeResultDTO

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeaderView(title: "评测结果")
            switch renderKind {
            case .serviceError:
                VStack(alignment: .leading, spacing: 6) {
                    Text("评测服务异常")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.accent400)
                    if let detail = serviceErrorDetail {
                        Text(detail)
                            .font(.mono(.caption))
                            .foregroundStyle(Color.muted)
                            .textSelection(.enabled)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color.accent50, in: RoundedRectangle(cornerRadius: 10))

            case .compileError(let output):
                VStack(alignment: .leading, spacing: 6) {
                    Text("编译失败")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.accent400)
                    Text(output)
                        .font(.mono(.caption))
                        .foregroundStyle(Color.muted)
                        .textSelection(.enabled)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color.accent50, in: RoundedRectangle(cornerRadius: 10))

            case .passed(let passed, let total, let runtimeMs, let cases):
                HStack(spacing: 10) {
                    Text("通过 \(passed)/\(total)")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(passed == total ? Color(hex: 0x3fb950) : Color.accent400)
                    if let runtimeMs {
                        Text("\(runtimeMs) ms")
                            .font(.mono(.caption))
                            .foregroundStyle(Color.muted)
                    }
                    Spacer()
                    Text(result.status.label)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(passed == total ? Color(hex: 0x3fb950) : Color.accent400)
                }
                ForEach(Array(cases.enumerated()), id: \.element.id) { index, testCase in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: testCase.pass ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .font(.footnote)
                                .foregroundStyle(testCase.pass ? Color(hex: 0x3fb950) : Color.accent600)
                            Text("用例 \(index + 1)")
                                .font(.caption2)
                                .foregroundStyle(Color.muted)
                            if let error = testCase.error, !error.isEmpty {
                                Text(error)
                                    .font(.mono(.caption2))
                                    .foregroundStyle(Color.accent400)
                                    .lineLimit(2)
                            }
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            caseLine("输入", testCase.input)
                            caseLine("期望", testCase.expected)
                            caseLine("实际", testCase.actual)
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            testCase.pass ? Color.page : Color.accent50,
                            in: RoundedRectangle(cornerRadius: 8)
                        )
                    }
                }
            }
        }
        .cardStyle()
    }

    private func caseLine(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label)
                .font(.mono(.caption2))
                .foregroundStyle(Color.faint)
                .frame(width: 28, alignment: .leading)
            Text(value)
                .font(.mono(.caption2))
                .foregroundStyle(Color.ink)
                .textSelection(.enabled)
        }
    }

    private enum RenderKind {
        case serviceError
        case compileError(String)
        case passed(passed: Int, total: Int, runtimeMs: Int?, cases: [JudgeVerdict.Case])
    }

    private var renderKind: RenderKind {
        guard let verdict = result.verdictDetail else {
            return .serviceError
        }
        if result.status == .ie || verdict.status == nil || verdict.status == "no_cases" {
            return .serviceError
        }
        if verdict.status == "compile_error" {
            return .compileError(verdict.compileError ?? "")
        }
        let cases = verdict.cases ?? []
        return .passed(
            passed: verdict.passed ?? 0,
            total: verdict.total ?? cases.count,
            runtimeMs: result.runtimeMs,
            cases: cases
        )
    }

    private var serviceErrorDetail: String? {
        if result.status == .ie, let error = result.verdictDetail?.error {
            return error
        }
        return result.verdictDetail?.error
    }
}
