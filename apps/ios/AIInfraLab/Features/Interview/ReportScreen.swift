import SwiftUI

// ---------------------------------------------------------------------------
// 评估报告（web /report/:id）：总评大字等级 + 生成进度轮询（2s）+ 报告卡片
// + 对话回放；失败可重新生成。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class ReportModel {
    let sessionId: Int
    let assumeFinished: Bool

    var session: SessionRow?
    var report: ReportRow?
    var messages: [InterviewMessageDTO] = []
    var questions: [Int: QuestionDTO] = [:]
    var progress: ReportProgress?
    var loadError: String?
    var regenerating = false

    private var pollTask: Task<Void, Never>?

    init(sessionId: Int, assumeFinished: Bool) {
        self.sessionId = sessionId
        self.assumeFinished = assumeFinished
    }

    /// 需要继续轮询：本地视为已结束（刚点完结束）或服务端已结束但报告未落库且未失败
    var needsPolling: Bool {
        guard let session else { return false }
        guard session.status == .finished || assumeFinished else { return false }
        guard report == nil else { return false }
        return progress?.stage != "failed"
    }

    var stageText: String {
        switch progress?.stage {
        case "evaluating": return "正在评估你的回答…（LLM 推理，可能需要数十秒）"
        case "rendering": return "正在生成报告…"
        case "failed": return "报告生成失败"
        default: return "排队等待评估…"
        }
    }

    func load() async {
        do {
            let data = try await Services.shared.api.interviewGet(sessionId: sessionId)
            session = data.session
            report = data.report
            messages = data.messages
            questions = data.questions
            progress = data.reportProgress
            loadError = nil
        } catch let error as TRPCError {
            loadError = error.message
        } catch {
            loadError = "网络异常，请稍后重试"
        }
        startPollingIfNeeded()
    }

    private func startPollingIfNeeded() {
        pollTask?.cancel()
        guard needsPolling else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard let self, !Task.isCancelled else { return }
                await self.fetchQuietly()
                if !self.needsPolling { return }
            }
        }
    }

    private func fetchQuietly() async {
        guard let data = try? await Services.shared.api.interviewGet(sessionId: sessionId) else { return }
        session = data.session
        report = data.report
        messages = data.messages
        questions = data.questions
        progress = data.reportProgress
    }

    /// 重新生成（服务端幂等：已结束无报告时重新评估）
    func regenerate() async {
        guard !regenerating else { return }
        regenerating = true
        defer { regenerating = false }
        progress = ReportProgress(stage: "evaluating", error: nil)
        do {
            _ = try await Services.shared.api.finishInterview(sessionId: sessionId)
        } catch let error as TRPCError {
            progress = ReportProgress(stage: "failed", error: error.message)
            return
        } catch {
            progress = ReportProgress(stage: "failed", error: "网络异常，请稍后重试")
            return
        }
        await fetchQuietly()
        startPollingIfNeeded()
    }

    func cancelPolling() {
        pollTask?.cancel()
    }
}

struct ReportScreen: View {
    let sessionId: Int
    var assumeFinished = false

    @State private var model: ReportModel
    @State private var tab = 0

    init(sessionId: Int, assumeFinished: Bool) {
        self.sessionId = sessionId
        self.assumeFinished = assumeFinished
        _model = State(initialValue: ReportModel(sessionId: sessionId, assumeFinished: assumeFinished))
    }

    var body: some View {
        Group {
            if let error = model.loadError {
                ErrorBoxView(message: error) {
                    Task { await model.load() }
                }
                .padding(24)
            } else if let session = model.session {
                if session.status == .finished || model.report != nil {
                    reportBody(session)
                } else if assumeFinished {
                    progressView(model.stageText)
                } else {
                    notFinishedView
                }
            } else {
                LoadingView(text: "加载报告…")
            }
        }
        .background(Color.page)
        .navigationTitle("评估报告")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .onDisappear { model.cancelPolling() }
    }

    private func reportBody(_ session: SessionRow) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let report = model.report {
                    gradeCard(session, report)
                    Picker("视图", selection: $tab) {
                        Text("评估报告").tag(0)
                        Text("对话回放").tag(1)
                    }
                    .pickerStyle(.segmented)
                    if tab == 0 {
                        ReportBodyView(
                            text: report.report,
                            session: session,
                            messages: model.messages,
                            questions: model.questions
                        )
                    } else {
                        replayList
                    }
                } else if model.progress?.stage == "failed" {
                    VStack(alignment: .leading, spacing: 12) {
                        ErrorBoxView(message: model.progress?.error ?? "报告生成失败（LLM 评估异常）")
                        Button {
                            Task { await model.regenerate() }
                        } label: {
                            Group {
                                if model.regenerating {
                                    ProgressView().tint(Color.ink)
                                } else {
                                    Label("重新生成报告", systemImage: "arrow.clockwise")
                                }
                            }
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.accent600)
                    }
                } else {
                    progressView(model.stageText)
                }
            }
            .padding(16)
        }
        .refreshable { await model.load() }
    }

    private func progressView(_ text: String) -> some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
                .tint(Color.accent600)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Color.muted)
                .multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 8) {
                progressStep("1", "评估对话", reached: model.progress?.stage != "pending")
                progressStep("2", "生成报告", reached: model.progress?.stage == "rendering" || model.report != nil)
            }
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }

    private func progressStep(_ index: String, _ text: String, reached: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: reached ? "checkmark.circle.fill" : "circle.dotted")
                .font(.footnote)
                .foregroundStyle(reached ? Color.accent600 : Color.faint)
            Text("\(index). \(text)")
                .font(.footnote)
                .foregroundStyle(reached ? Color.ink : Color.muted)
        }
    }

    private var notFinishedView: some View {
        VStack(spacing: 14) {
            Image(systemName: "clock.badge.exclamationmark")
                .font(.title)
                .foregroundStyle(Color.faint)
            Text("本场面试尚未结束")
                .font(.subheadline.weight(.medium))
            NavigationLink(value: InterviewRoute.room(sessionId)) {
                Text("返回面试间")
                    .font(.footnote.weight(.medium))
            }
            .buttonStyle(.bordered)
            .tint(Color.accent600)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 64)
    }

    private func gradeCard(_ session: SessionRow, _ report: ReportRow) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(report.overallGrade ?? session.overallGrade ?? "-")
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .foregroundStyle(gradeColor(report.overallGrade ?? session.overallGrade ?? ""))
            VStack(alignment: .leading, spacing: 4) {
                Text("完成于 \(Fmt.date(report.createdAt)) · LLM 评估")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                if !report.weakPoints.isEmpty {
                    HStack(spacing: 4) {
                        Text("薄弱点:")
                            .font(.caption2)
                            .foregroundStyle(Color.faint)
                        ForEach(report.weakPoints.prefix(3), id: \.self) { ChipView(text: $0, accent: true) }
                    }
                }
            }
            Spacer()
        }
        .cardStyle(padding: 18)
    }

    private func gradeColor(_ grade: String) -> Color {
        switch grade {
        case "A", "B": return Color(hex: 0x3fb950)
        case "C": return Color(hex: 0xd29922)
        default: return Color.accent600
        }
    }

    private var replayList: some View {
        VStack(spacing: 10) {
            ForEach(model.messages) { message in
                MessageBubble(role: message.role, content: message.content)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 报告正文（卡片化渲染）
// ---------------------------------------------------------------------------

struct ReportBodyView: View {
    let text: String
    let session: SessionRow
    let messages: [InterviewMessageDTO]
    let questions: [Int: QuestionDTO]

    var body: some View {
        let sections = ReportParser.splitSections(text)
        return Group {
            if sections.isEmpty {
                card { MarkdownView(text: text) }
            } else {
                VStack(spacing: 12) {
                    ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                        if ReportParser.isQuestionSection(section.heading) {
                            questionCard(section)
                        } else {
                            genericCard(section)
                        }
                    }
                }
            }
        }
    }

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            content()
        }
        .cardStyle()
    }

    private func genericCard(_ section: ReportParser.Section) -> some View {
        card {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 1).fill(Color.accent600).frame(width: 4, height: 14)
                if let grade = ReportParser.overallGrade(from: section.heading) {
                    Text("总评")
                        .font(.subheadline.weight(.semibold))
                    GradeBadge(grade: grade)
                } else {
                    Text(section.heading)
                        .font(.subheadline.weight(.semibold))
                }
            }
            MarkdownView(text: section.body)
        }
    }

    private func questionCard(_ section: ReportParser.Section) -> some View {
        let index = ReportParser.questionIndex(section.heading)
        let questionId = index.flatMap { index in
            (0 <= index && index < session.questionIds.count) ? session.questionIds[index] : nil
        }
        let question = questionId.flatMap { questions[$0] }
        let askedQuestions = messages
            .filter { $0.questionId == questionId && $0.role == .interviewer }
            .map { ReportParser.stripChatPrefix($0.content) }
        let blocks = ReportParser.parseQuestionBody(section.body)

        return card {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 1).fill(Color.accent600).frame(width: 4, height: 14)
                Text(questionHeadingText(section.heading))
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                if let category = questionCategory(section.heading) {
                    ChipView(text: category)
                }
            }
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block, question: question, askedQuestions: askedQuestions)
            }
        }
    }

    private func questionHeadingText(_ heading: String) -> String {
        guard let match = captureGroups(#"^第\s*(\d+)\s*题：(.*?)(?:（([^（）]*)）)?$"#, in: heading),
              match.count >= 2 else {
            return heading
        }
        return "第 \(match[0]) 题：\(match[1])"
    }

    private func questionCategory(_ heading: String) -> String? {
        guard let match = captureGroups(#"^第\s*(\d+)\s*题：(.*?)(?:（([^（）]*)）)?$"#, in: heading),
              match.count == 3 else { return nil }
        return Category(rawValue: match[2])?.label ?? match[2]
    }

    @ViewBuilder
    private func blockView(_ block: ReportParser.QBlock, question: QuestionDTO?, askedQuestions: [String]) -> some View {
        switch block {
        case .dims(let dims):
            HStack(spacing: 6) {
                ForEach(Array(dims.enumerated()), id: \.offset) { _, dim in
                    HStack(spacing: 4) {
                        Text(dim.name)
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        GradeBadge(grade: dim.grade)
                    }
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Color.page, in: RoundedRectangle(cornerRadius: 6))
                }
            }
        case .labeled(let label, let text):
            VStack(alignment: .leading, spacing: 6) {
                Text(label)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(label == "诊断" ? Color.accent300 : Color.muted)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(label == "诊断" ? Color.accent50 : Color.page, in: RoundedRectangle(cornerRadius: 6))
                if label == "参考答案" {
                    ReferenceAnswerView(text: text, question: question, askedQuestions: askedQuestions)
                } else {
                    MarkdownView(text: text)
                }
            }
            .padding(.leading, 10)
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color.line)
                    .frame(width: 3)
            }
        case .md(let text):
            MarkdownView(text: text)
        }
    }
}

/// 参考答案：新格式（【答】分段）一问一答配对；旧格式整段
private struct ReferenceAnswerView: View {
    let text: String
    let question: QuestionDTO?
    let askedQuestions: [String]

    var body: some View {
        if let answers = ReportParser.splitAnswers(text) {
            let count = max(askedQuestions.count, answers.count)
            VStack(alignment: .leading, spacing: 10) {
                ForEach(0..<count, id: \.self) { index in
                    VStack(alignment: .leading, spacing: 4) {
                        if index < askedQuestions.count {
                            Text(index == 0 ? "主问题" : "追问 \(index)")
                                .font(.caption2)
                                .foregroundStyle(Color.faint)
                            MessageBubble(role: .interviewer, content: askedQuestions[index], compact: true)
                        }
                        if index < answers.count {
                            MarkdownView(text: answers[index])
                                .padding(.leading, 12)
                                .overlay(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 1)
                                        .fill(Color.accent200)
                                        .frame(width: 3)
                                }
                        }
                    }
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                if !askedQuestions.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("原问题")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Color.muted)
                        ForEach(Array(askedQuestions.enumerated()), id: \.offset) { index, asked in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(index == 0 ? "主问题" : "追问 \(index)")
                                    .font(.caption2)
                                    .foregroundStyle(Color.faint)
                                MessageBubble(role: .interviewer, content: asked, compact: true)
                            }
                        }
                    }
                    .padding(10)
                    .background(Color.page, in: RoundedRectangle(cornerRadius: 8))
                } else if let question {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("原问题")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Color.muted)
                        MarkdownView(text: question.content.isEmpty ? question.title : question.content)
                    }
                    .padding(10)
                    .background(Color.page, in: RoundedRectangle(cornerRadius: 8))
                }
                MarkdownView(text: text)
            }
        }
    }
}
