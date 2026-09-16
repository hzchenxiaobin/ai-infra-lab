import SwiftUI

// ---------------------------------------------------------------------------
// 面试间（web /interview/:id）：状态卡 + 聊天流（乐观更新 + 打字指示）+
// 代码题内嵌评测面板 + 结束本场 → 报告页。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class InterviewRoomModel {
    let sessionId: Int

    var session: SessionRow?
    var messages: [InterviewMessageDTO] = []
    var questions: [Int: QuestionDTO] = [:]
    var reportProgress: ReportProgress?
    var loadError: String?

    var inputText = ""
    var sending = false
    var finishing = false
    var actionError: String?

    var codeProblem: JudgeProblem?
    var codeLoading = false
    var codeLanguage: JudgeLanguage = .cpp
    var code = ""
    var runPhase: JudgeModel.RunPhase = .idle

    private var nextLocalId = -1
    private var pollTask: Task<Void, Never>?
    private var loadedProblemKey: String?

    init(sessionId: Int) {
        self.sessionId = sessionId
    }

    var isActive: Bool { session?.status == .active }

    var currentQuestion: QuestionDTO? {
        guard let session else { return nil }
        guard session.currentIndex < session.questionIds.count else { return nil }
        return questions[session.questionIds[session.currentIndex]]
    }

    /// 代码题（leetcode/cuda）且有统一题目映射时显示代码面板
    var currentJudgeProblemId: String? {
        guard let question = currentQuestion, question.category != .knowledge else { return nil }
        return question.judgeProblemId
    }

    var canSend: Bool {
        isActive && !sending && !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var codeSpec: JudgeProblem.LangSpec {
        codeProblem?.spec(for: codeLanguage)
            ?? .init(available: false, reason: "尚未加载", starter: nil)
    }

    var canRunJudge: Bool {
        guard let problem = codeProblem, codeSpec.available, !problem.examples.isEmpty else { return false }
        if case .idle = runPhase { return true }
        if case .terminal = runPhase { return true }
        return false
    }

    // MARK: 加载

    func load() async {
        do {
            let data = try await Services.shared.api.interviewGet(sessionId: sessionId)
            session = data.session
            messages = data.messages
            questions = data.questions
            reportProgress = data.reportProgress
            loadError = nil
            await ensureCodeProblem()
        } catch let error as TRPCError {
            loadError = error.message
        } catch {
            loadError = "网络异常，请稍后重试"
        }
    }

    private func ensureCodeProblem() async {
        guard let problemId = currentJudgeProblemId, loadedProblemKey != problemId else { return }
        loadedProblemKey = problemId
        codeProblem = nil
        runPhase = .idle
        code = ""
        codeLoading = true
        defer { codeLoading = false }
        do {
            let problem = try await Services.shared.api.judgeGetProblem(problemId: problemId)
            if currentJudgeProblemId == problemId {
                codeProblem = problem
                if problem.cpp.available {
                    codeLanguage = .cpp
                    code = problem.cpp.starter ?? ""
                } else {
                    codeLanguage = .python
                    code = problem.python.starter ?? ""
                }
            }
        } catch {
            // 题面加载失败不阻塞聊天；可通过切换语言/重进重试
        }
    }

    // MARK: 发送回答（乐观更新）

    func send() async {
        let content = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !sending, isActive else { return }
        let localCandidate = InterviewMessageDTO(
            id: nextLocalId,
            sessionId: sessionId,
            questionId: currentQuestion?.id,
            role: .candidate,
            content: content,
            createdAt: Date()
        )
        nextLocalId -= 1
        messages.append(localCandidate)
        inputText = ""
        sending = true
        actionError = nil
        defer { sending = false }

        do {
            let result = try await Services.shared.api.reply(sessionId: sessionId, content: content)
            apply(state: result.state)
            let interviewer = InterviewMessageDTO(
                id: nextLocalId,
                sessionId: sessionId,
                questionId: currentQuestion?.id,
                role: .interviewer,
                content: result.interviewerMessage,
                createdAt: Date()
            )
            nextLocalId -= 1
            messages.append(interviewer)
            // 换题后按需加载新题的评测面板
            await ensureCodeProblem()
        } catch let error as TRPCError {
            inputText = content
            appendSystem("发送失败：\(error.message)（内容已恢复到输入框，可重试）")
        } catch {
            inputText = content
            appendSystem("发送失败：网络异常（内容已恢复到输入框，可重试）")
        }
    }

    /// 把当前代码作为回答发给面试官
    func sendCode() async {
        let code = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else { return }
        inputText = code
        await send()
    }

    private func appendSystem(_ text: String) {
        messages.append(InterviewMessageDTO(
            id: nextLocalId,
            sessionId: sessionId,
            questionId: nil,
            role: .system,
            content: text,
            createdAt: Date()
        ))
        nextLocalId -= 1
    }

    private func apply(state: InterviewStateDTO) {
        guard let s = session else { return }
        session = SessionRow(
            id: s.id,
            userId: s.userId,
            title: s.title,
            categories: s.categories,
            questionIds: s.questionIds,
            currentIndex: state.currentIndex,
            followUpIndex: state.followUpIndex,
            status: state.status,
            overallGrade: s.overallGrade,
            scopeKnowledgePoints: s.scopeKnowledgePoints,
            createdAt: s.createdAt,
            finishedAt: s.finishedAt
        )
    }

    // MARK: 内嵌评测

    func switchLanguage(_ target: JudgeLanguage) {
        guard target != codeLanguage,
              codeProblem?.spec(for: target).available == true else { return }
        codeLanguage = target
        code = codeProblem?.spec(for: target).starter ?? ""
        runPhase = .idle
    }

    func runJudge() async {
        guard let problem = codeProblem, canRunJudge else { return }
        runPhase = .queued
        do {
            let submissionId = try await Services.shared.api.judgeSubmit(
                problemId: problem.problem.id, language: codeLanguage, code: code
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
            actionError = error.message
        } catch {
            runPhase = .idle
            actionError = "网络异常，请稍后重试"
        }
    }

    // MARK: 结束本场

    /// 本地立即置 finished（服务端先落库状态再异步评估），报告页轮询生成进度
    func finish() async {
        guard let s = session, s.status == .active, !finishing else { return }
        finishing = true
        defer { finishing = false }
        session = SessionRow(
            id: s.id,
            userId: s.userId,
            title: s.title,
            categories: s.categories,
            questionIds: s.questionIds,
            currentIndex: s.currentIndex,
            followUpIndex: s.followUpIndex,
            status: .finished,
            overallGrade: s.overallGrade,
            scopeKnowledgePoints: s.scopeKnowledgePoints,
            createdAt: s.createdAt,
            finishedAt: Date()
        )
        appendSystem("本场面试已结束，感谢参与。评估报告生成后可在报告页查看。")
        pollTask?.cancel()
        // 后台触发评估（幂等）；报告页轮询 interview.get 的 reportProgress
        let targetSessionId = sessionId
        Task.detached(priority: .userInitiated) {
            _ = try? await Services.shared.api.finishInterview(sessionId: targetSessionId)
        }
    }

    func cancelTasks() {
        pollTask?.cancel()
    }
}

struct InterviewRoomScreen: View {
    let sessionId: Int
    let onFinished: (Int) -> Void

    @State private var model: InterviewRoomModel
    @State private var confirmingFinish = false
    @State private var problemExpanded = true

    init(sessionId: Int, onFinished: @escaping (Int) -> Void) {
        self.sessionId = sessionId
        self.onFinished = onFinished
        _model = State(initialValue: InterviewRoomModel(sessionId: sessionId))
    }

    var body: some View {
        Group {
            if let error = model.loadError {
                ErrorBoxView(message: error) {
                    Task { await model.load() }
                }
                .padding(24)
            } else if let session = model.session {
                roomBody(session)
            } else {
                LoadingView(text: "恢复面试现场…")
            }
        }
        .background(Color.page)
        .navigationTitle(model.session?.title ?? "面试间")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .onDisappear { model.cancelTasks() }
    }

    private func roomBody(_ session: SessionRow) -> some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 12) {
                        headerCard(session)
                        if let question = model.currentQuestion, question.category != .knowledge {
                            problemCard(question)
                        }
                        if model.currentJudgeProblemId != nil {
                            codePanel
                        }
                        chatSection
                    }
                    .padding(16)
                }
                .onChange(of: model.messages.count) { _, _ in
                    if let last = model.messages.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider().overlay(Color.divider)
            if session.status == .active {
                inputBar
            } else {
                finishedBanner
            }
        }
    }

    // MARK: 状态卡

    private func headerCard(_ session: SessionRow) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if session.status == .active {
                    StatusPill(.active, "进行中")
                } else {
                    StatusPill(.done, "已结束")
                }
                Text(session.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                if session.status == .active {
                    Button(role: .destructive) {
                        confirmingFinish = true
                    } label: {
                        Text("结束本场")
                            .font(.caption.weight(.medium))
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.accent600)
                    .disabled(model.finishing)
                } else {
                    NavigationLink(value: InterviewRoute.report(session.id, assumeFinished: true)) {
                        Text("查看评估报告")
                            .font(.caption.weight(.medium))
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.accent600)
                }
            }

            HStack(spacing: 8) {
                Text("第 \(min(session.currentIndex + 1, session.questionIds.count))/\(session.questionIds.count) 题")
                    .font(.mono(.caption))
                    .foregroundStyle(Color.muted)
                if let question = model.currentQuestion {
                    Text("追问 \(session.followUpIndex)/4")
                        .font(.mono(.caption))
                        .foregroundStyle(Color.muted)
                    Text("·")
                        .font(.caption)
                        .foregroundStyle(Color.faint)
                    Text(question.title)
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                        .lineLimit(1)
                }
            }

            let total = max(1, session.questionIds.count)
            ProgressBarView(value: Double(session.status == .finished ? total : session.currentIndex) / Double(total), height: 5)
        }
        .cardStyle(padding: 14)
        .confirmationDialog(
            "结束本场面试？评估报告生成可能需要数十秒。",
            isPresented: $confirmingFinish,
            titleVisibility: .visible
        ) {
            Button("结束并生成报告", role: .destructive) {
                Task {
                    await model.finish()
                    onFinished(sessionId)
                }
            }
        }
    }

    // MARK: 题面卡

    private func problemCard(_ question: QuestionDTO) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { problemExpanded.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Text(question.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.ink)
                        .lineLimit(1)
                    DifficultyBadge(difficulty: question.difficulty)
                    Spacer()
                    Image(systemName: problemExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(Color.faint)
                }
            }
            .buttonStyle(.plain)

            if problemExpanded {
                MarkdownView(text: question.content)
            }
        }
        .cardStyle(padding: 14)
    }

    // MARK: 代码面板

    private var codePanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("代码作答")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.muted)
                Spacer()
                ForEach(JudgeLanguage.allCases) { language in
                    let spec = model.codeProblem?.spec(for: language)
                    Button {
                        model.switchLanguage(language)
                    } label: {
                        Text(language.label)
                            .font(.caption2.weight(.medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(model.codeLanguage == language ? Color.accent600 : Color.page, in: Capsule())
                            .foregroundStyle(model.codeLanguage == language ? Color.ink : Color.muted)
                    }
                    .buttonStyle(.plain)
                    .disabled(spec?.available != true)
                    .opacity(spec?.available == true ? 1 : 0.45)
                }
            }

            if model.codeLoading {
                HStack(spacing: 8) {
                    ProgressView().tint(Color.muted)
                    Text("加载评测上下文…")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                }
            } else if let problem = model.codeProblem {
                if problem.examples.isEmpty {
                    Text("该题未解析到示例用例，无法站内评测")
                        .font(.caption)
                        .foregroundStyle(Color.accent400)
                }
                TextEditor(text: $model.code)
                    .font(.mono(.footnote))
                    .frame(minHeight: 160)
                    .padding(6)
                    .scrollContentBackground(.hidden)
                    .background(Color.page, in: RoundedRectangle(cornerRadius: 8))

                HStack(spacing: 10) {
                    Button {
                        Task { await model.runJudge() }
                    } label: {
                        Group {
                            switch model.runPhase {
                            case .queued, .running:
                                ProgressView().tint(Color.ink)
                                Text("评测中…")
                            default:
                                Image(systemName: "play.fill")
                                Text("评测")
                            }
                        }
                        .font(.footnote.weight(.medium))
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.accent600)
                    .disabled(!model.canRunJudge)

                    Button {
                        Task { await model.sendCode() }
                    } label: {
                        Label("提交代码", systemImage: "paperplane.fill")
                            .font(.footnote.weight(.medium))
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.accent600)
                    .disabled(model.sending)

                    Spacer()
                }

                if case .terminal(let result) = model.runPhase {
                    JudgeResultView(result: result)
                }
            }
        }
        .cardStyle(padding: 14)
    }

    // MARK: 聊天流

    private var chatSection: some View {
        VStack(spacing: 10) {
            ForEach(model.messages) { message in
                MessageBubble(role: message.role, content: message.content)
                    .id(message.id)
            }
            if model.sending {
                TypingBubble()
            }
            if model.messages.isEmpty && !model.sending {
                EmptyBoxView(text: "面试官准备中…")
            }
        }
    }

    // MARK: 输入区

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("输入你的回答，可粘贴代码", text: $model.inputText, axis: .vertical)
                .font(.mono(.footnote))
                .lineLimit(1...5)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line))
                .disabled(model.sending)

            Button {
                Task { await model.send() }
            } label: {
                Group {
                    if model.sending {
                        ProgressView().tint(Color.ink)
                    } else {
                        Image(systemName: "paperplane.fill")
                    }
                }
                .frame(width: 42, height: 42)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.accent600)
            .disabled(!model.canSend)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.page)
    }

    private var finishedBanner: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.seal")
                    .foregroundStyle(Color.accent600)
                Text("本场面试已结束，评估报告生成中（可能需要数十秒）")
                    .font(.footnote)
                    .foregroundStyle(Color.muted)
            }
            NavigationLink(value: InterviewRoute.report(sessionId, assumeFinished: true)) {
                Text("查看评估报告")
                    .font(.footnote.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.accent600)
        }
        .padding(14)
    }
}
