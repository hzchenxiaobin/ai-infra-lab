import Foundation

/// 类型化 API 层：App 消费的全部 tRPC procedure（裁剪 admin / content-kit 管线）。
/// query 走 GET、mutation 走 POST；mutation 默认不自动重试（interview.reply 无幂等保护），
/// 幂等操作（finish / mark / setNote / getResult / logout）显式保留重试。
final class API: @unchecked Sendable {
    let client = TRPCClient()

    // MARK: - auth

    func sendCode(email: String) async throws {
        struct In: Codable { let email: String }
        let _: OkResult = try await client.call("auth.sendCode", input: In(email: email),
                                                method: .mutation, retryOnNetworkError: false)
    }

    func register(email: String, password: String, code: String, name: String?) async throws -> User {
        struct In: Codable { let email: String; let password: String; let code: String; let name: String? }
        struct Out: Codable { let user: User }
        let out: Out = try await client.call(
            "auth.register",
            input: In(email: email, password: password, code: code, name: name),
            method: .mutation,
            retryOnNetworkError: false
        )
        return out.user
    }

    func login(email: String, password: String) async throws -> User {
        struct In: Codable { let email: String; let password: String }
        struct Out: Codable { let user: User }
        let out: Out = try await client.call(
            "auth.login",
            input: In(email: email, password: password),
            method: .mutation,
            retryOnNetworkError: false
        )
        return out.user
    }

    func logout() async throws {
        let _: OkResult = try await client.call("auth.logout", method: .mutation)
    }

    func me() async throws -> User {
        struct Out: Codable { let user: User }
        let out: Out = try await client.call("auth.me")
        return out.user
    }

    // MARK: - interview

    func startInterview(categories: [Category], count: Int, scope: String?) async throws -> StartInterviewResult {
        struct In: Codable { let categories: [Category]; let count: Int; let scope: String? }
        return try await client.call(
            "interview.start",
            input: In(categories: categories, count: count, scope: scope),
            method: .mutation,
            retryOnNetworkError: false
        )
    }

    func reply(sessionId: Int, content: String) async throws -> ReplyResult {
        struct In: Codable { let sessionId: Int; let content: String }
        return try await client.call(
            "interview.reply",
            input: In(sessionId: sessionId, content: content),
            method: .mutation,
            retryOnNetworkError: false
        )
    }

    func finishInterview(sessionId: Int) async throws -> FinishResult {
        struct In: Codable { let sessionId: Int }
        return try await client.call("interview.finish", input: In(sessionId: sessionId), method: .mutation)
    }

    func removeInterview(sessionId: Int) async throws {
        struct In: Codable { let sessionId: Int }
        let _: OkResult = try await client.call(
            "interview.remove",
            input: In(sessionId: sessionId),
            method: .mutation,
            retryOnNetworkError: false
        )
    }

    func interviewList() async throws -> [SessionRow] {
        try await client.call("interview.list")
    }

    func interviewStats() async throws -> InterviewStats {
        try await client.call("interview.stats")
    }

    func interviewGet(sessionId: Int) async throws -> InterviewGetData {
        struct In: Codable { let sessionId: Int }
        return try await client.call("interview.get", input: In(sessionId: sessionId))
    }

    // MARK: - question（面试题库）

    func questionList(category: Category?, difficulty: Difficulty?, search: String?, page: Int, pageSize: Int = 10) async throws -> QuestionListResult {
        struct In: Codable {
            let category: Category?
            let difficulty: Difficulty?
            let search: String?
            let page: Int
            let pageSize: Int
        }
        return try await client.call(
            "question.list",
            input: In(category: category, difficulty: difficulty, search: search,
                      page: page, pageSize: pageSize)
        )
    }

    func questionStats() async throws -> QuestionStats {
        try await client.call("question.stats")
    }

    func questionScopes() async throws -> QuestionScopes {
        try await client.call("question.scopes")
    }

    func questionCreate(_ question: QuestionInput) async throws -> Int {
        struct Out: Codable { let id: Int }
        let out: Out = try await client.call("question.create", input: question,
                                             method: .mutation, retryOnNetworkError: false)
        return out.id
    }

    func questionUpdate(id: Int, data: QuestionInput) async throws {
        struct In: Codable { let id: Int; let data: QuestionInput }
        let _: OkResult = try await client.call(
            "question.update",
            input: In(id: id, data: data),
            method: .mutation,
            retryOnNetworkError: false
        )
    }

    func questionRemove(id: Int) async throws {
        struct In: Codable { let id: Int }
        let _: OkResult = try await client.call("question.remove", input: In(id: id),
                                                method: .mutation, retryOnNetworkError: false)
    }

    func questionBulkImport(_ items: [QuestionInput]) async throws -> Int {
        struct In: Codable { let items: [QuestionInput] }
        let out: BulkImportResult = try await client.call(
            "question.bulkImport",
            input: In(items: items),
            method: .mutation,
            retryOnNetworkError: false
        )
        return out.imported
    }

    func questionSeed() async throws -> SeedResult {
        try await client.call("question.seed", method: .mutation, retryOnNetworkError: false)
    }

    // MARK: - problem（刷题题库）

    func problemList(difficulty: Difficulty?, source: ProblemSource?, judgeType: JudgeType?, tag: String?,
                     knowledgePoint: String?, search: String?, progress: ProgressStatus?,
                     page: Int, pageSize: Int = 50) async throws -> ProblemListResult {
        struct In: Codable {
            let difficulty: Difficulty?
            let source: ProblemSource?
            let judgeType: JudgeType?
            let tag: String?
            let knowledgePoint: String?
            let search: String?
            let progress: ProgressStatus?
            let page: Int
            let pageSize: Int
        }
        return try await client.call(
            "problem.list",
            input: In(difficulty: difficulty, source: source, judgeType: judgeType,
                      tag: tag, knowledgePoint: knowledgePoint, search: search,
                      progress: progress, page: page, pageSize: pageSize)
        )
    }

    func problemFacets(source: ProblemSource?) async throws -> ProblemFacets {
        struct In: Codable { let source: ProblemSource? }
        return try await client.call("problem.facets", input: In(source: source))
    }

    func problemLists() async throws -> [ProblemListMeta] {
        try await client.call("problem.lists")
    }

    func problemGetList(slug: String) async throws -> ProblemListDetail {
        struct In: Codable { let slug: String }
        return try await client.call("problem.getList", input: In(slug: slug))
    }

    func contestSessions() async throws -> [ContestSession] {
        try await client.call("problem.contestSessions")
    }

    func contestProblems(session: Int) async throws -> ContestDetail {
        struct In: Codable { let session: Int }
        return try await client.call("problem.contestProblems", input: In(session: session))
    }

    // MARK: - judge（在线评测）

    func judgeGetProblem(problemId: String) async throws -> JudgeProblem {
        struct In: Codable { let problemId: String }
        return try await client.call("judge.getProblem", input: In(problemId: problemId))
    }

    func judgeSubmit(problemId: String, language: JudgeLanguage, code: String) async throws -> Int {
        struct In: Codable { let problemId: String; let language: JudgeLanguage; let code: String }
        let out: SubmissionIdResult = try await client.call(
            "judge.submit",
            input: In(problemId: problemId, language: language, code: code),
            method: .mutation,
            retryOnNetworkError: false
        )
        return out.submissionId
    }

    func judgeGetResult(submissionId: Int) async throws -> JudgeResultDTO {
        struct In: Codable { let submissionId: Int }
        return try await client.call("judge.getResult", input: In(submissionId: submissionId))
    }

    // MARK: - learn / progress / quota / search

    func learnOverview() async throws -> LearnOverview {
        try await client.call("learn.overview")
    }

    func progressMark(contentId: String, status: ProgressStatus) async throws {
        struct In: Codable { let contentId: String; let status: ProgressStatus }
        let _: OkResult = try await client.call("progress.mark", input: In(contentId: contentId, status: status),
                                                method: .mutation)
    }

    func progressSetNote(contentId: String, note: String) async throws {
        struct In: Codable { let contentId: String; let note: String }
        let _: OkResult = try await client.call("progress.setNote", input: In(contentId: contentId, note: note),
                                                method: .mutation)
    }

    func progressOverview() async throws -> ProgressOverview {
        try await client.call("progress.overview")
    }

    func quotaMe() async throws -> QuotaMe {
        try await client.call("quota.me")
    }

    func search(q: String, type: ContentType?, limit: Int = 50) async throws -> SearchResult {
        struct In: Codable { let q: String; let type: ContentType?; let limit: Int }
        return try await client.call("search.query", input: In(q: q, type: type, limit: limit))
    }
}

/// 进度变化通知：mark / setNote / 评测 AC 后广播，各列表页据此刷新
extension Notification.Name {
    static let progressChanged = Notification.Name("ailab.progressChanged")
}
