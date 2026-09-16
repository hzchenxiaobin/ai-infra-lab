import Foundation

// ---------------------------------------------------------------------------
// 枚举（对齐 packages/contracts/src/index.ts）
// ---------------------------------------------------------------------------

enum Category: String, Codable, CaseIterable, Identifiable {
    case leetcode, cuda, knowledge
    var id: String { rawValue }
    var label: String {
        switch self {
        case .leetcode: return "Leetcode"
        case .cuda: return "CUDA"
        case .knowledge: return "专业知识"
        }
    }
}

enum Difficulty: String, Codable, CaseIterable, Identifiable {
    case easy, medium, hard
    var id: String { rawValue }
    var label: String {
        switch self {
        case .easy: return "简单"
        case .medium: return "中等"
        case .hard: return "困难"
        }
    }
}

enum MessageRole: String, Codable {
    case interviewer, candidate, system
}

enum ProgressStatus: String, Codable {
    case unseen, seen, mastered, ac
}

enum SessionStatus: String, Codable {
    case active, finished
}

enum JudgeType: String, Codable {
    case `internal`
    case leetgpuCom = "leetgpu-com"
    case none
}

enum ProblemSource: String, Codable {
    case leetcode, leetgpu, contest
}

enum JudgeLanguage: String, Codable, CaseIterable, Identifiable {
    case cpp, python
    var id: String { rawValue }
    var label: String { self == .cpp ? "C++" : "Python" }
}

enum JudgeStatus: String, Codable {
    case pending, running, ac, wa, ce, tle, mle, ie
    var isTerminal: Bool {
        switch self {
        case .pending, .running: return false
        default: return true
        }
    }
    var label: String {
        switch self {
        case .pending: return "排队中"
        case .running: return "运行中"
        case .ac: return "通过"
        case .wa: return "答案错误"
        case .ce: return "编译失败"
        case .tle: return "超时"
        case .mle: return "内存超限"
        case .ie: return "内部错误"
        }
    }
}

enum QuotaKind: String, Codable, CaseIterable, Identifiable {
    case judge, interview
    var id: String { rawValue }
    var label: String { self == .judge ? "评测提交" : "LLM 面试" }
}

enum ContentType: String, Codable, CaseIterable, Identifiable {
    case learn, problem, paper, profiling
    var id: String { rawValue }
    var label: String {
        switch self {
        case .learn: return "学习"
        case .problem: return "题目"
        case .paper: return "论文"
        case .profiling: return "Profiling"
        }
    }
}

// ---------------------------------------------------------------------------
// 账号域
// ---------------------------------------------------------------------------

struct User: Codable, Equatable, Identifiable {
    let id: Int
    let email: String?
    let name: String
    let avatar: String?
    let tier: String
    let emailVerified: Bool
}

// ---------------------------------------------------------------------------
// 面试题库（questions 表原始行 + 面试 Question DTO）
// ---------------------------------------------------------------------------

struct BankQuestion: Codable, Identifiable, Equatable {
    let id: Int
    let userId: Int?
    let category: Category
    let title: String
    let content: String
    let difficulty: Difficulty
    let tags: String
    let followUps: [String]
    let keyPoints: String
    let knowledgePoints: [String]?
    let source: String
    let sourceKey: String
    let stale: Int
    let createdAt: Date
    let updatedAt: Date

    var isShared: Bool { userId == nil }
}

/// interview.get 返回的题目快照（含 judgeProblemId 映射）
struct QuestionDTO: Codable, Identifiable, Equatable {
    let id: Int
    let category: Category
    let title: String
    let content: String
    let difficulty: Difficulty
    let tags: String
    let followUps: [String]
    let keyPoints: String
    let source: String
    let judgeProblemId: String?
}

struct InterviewMessageDTO: Codable, Identifiable, Equatable {
    let id: Int
    let sessionId: Int
    let questionId: Int?
    let role: MessageRole
    let content: String
    let createdAt: Date
}

struct InterviewStateDTO: Codable, Equatable {
    let sessionId: Int
    let status: SessionStatus
    let currentIndex: Int
    let followUpIndex: Int
    let totalQuestions: Int
}

struct SessionRow: Codable, Identifiable, Equatable {
    let id: Int
    let userId: Int
    let title: String
    let categories: [String]
    let questionIds: [Int]
    let currentIndex: Int
    let followUpIndex: Int
    let status: SessionStatus
    let overallGrade: String?
    let scopeKnowledgePoints: [String]?
    let createdAt: Date
    let finishedAt: Date?

    var durationMinutes: Int? {
        guard let finishedAt else { return nil }
        return max(1, Int(finishedAt.timeIntervalSince(createdAt) / 60))
    }
}

struct ReportRow: Codable, Equatable {
    let id: Int
    let sessionId: Int
    let userId: Int
    let overallGrade: String?
    let evaluatedBy: String?
    let report: String
    let weakPoints: [String]
    let createdAt: Date
}

struct ReportProgress: Codable, Equatable {
    let stage: String
    let error: String?
}

/// interview.get 聚合（questions 为数字键对象，需手工映射）
struct InterviewGetData: Equatable {
    let session: SessionRow
    let report: ReportRow?
    let messages: [InterviewMessageDTO]
    let questions: [Int: QuestionDTO]
    let reportProgress: ReportProgress
}

extension InterviewGetData: Decodable {
    private struct Raw: Decodable {
        let session: SessionRow
        let report: ReportRow?
        let messages: [InterviewMessageDTO]
        let questions: [String: QuestionDTO]?
        let reportProgress: ReportProgress
    }

    init(from decoder: Decoder) throws {
        let raw = try Raw(from: decoder)
        var questions: [Int: QuestionDTO] = [:]
        for (k, v) in raw.questions ?? [:] {
            if let key = Int(k) { questions[key] = v }
        }
        self.init(session: raw.session, report: raw.report, messages: raw.messages,
                  questions: questions, reportProgress: raw.reportProgress)
    }
}

struct StartInterviewResult: Codable {
    let state: InterviewStateDTO
    let messages: [InterviewMessageDTO]
}

struct ReplyResult: Codable {
    let state: InterviewStateDTO
    let interviewerMessage: String
}

struct FinishResult: Codable {
    let report: String
    let overallGrade: String?
}

struct InterviewStats: Codable, Equatable {
    struct CategoryAverage: Codable, Equatable, Identifiable {
        let category: String
        let average: Double
        let sessions: Int
        var id: String { category }
    }

    struct TrendPoint: Codable, Equatable, Identifiable {
        let sessionId: Int
        let title: String
        let overallGrade: String?
        let score: Int?
        let createdAt: Date
        let durationMinutes: Int?
        var id: Int { sessionId }
    }

    let totalFinished: Int
    let categoryAverages: [CategoryAverage]
    let trend: [TrendPoint]
}

struct QuestionStats: Codable, Equatable {
    struct ByCategory: Codable, Equatable {
        let leetcode: Int
        let cuda: Int
        let knowledge: Int
    }
    let byCategory: ByCategory
    let total: Int
}

struct QuestionListResult: Codable {
    let items: [BankQuestion]
    let total: Int
    let page: Int
    let pageSize: Int
}

struct QuestionScopes: Codable, Equatable {
    struct ScopeItem: Codable, Equatable, Identifiable {
        let name: String
        let count: Int
        let scope: String
        var id: String { scope }
    }

    struct DayItem: Codable, Equatable, Identifiable {
        let week: String
        let day: String
        let count: Int
        let scope: String
        var id: String { scope }
    }

    let topics: [ScopeItem]
    let weeks: [ScopeItem]
    let days: [DayItem]
}

/// 面试题输入（create / update / bulkImport 共用，对齐 questionInputSchema）
struct QuestionInput: Codable, Equatable {
    var category: Category
    var title: String
    var content: String
    var difficulty: Difficulty
    var tags: String
    var followUps: [String]
    var keyPoints: String
    var source: String
}

struct CreatedId: Codable { let id: Int }
struct OkResult: Codable { let ok: Bool }
struct BulkImportResult: Codable { let imported: Int }
struct SeedResult: Codable { let seeded: Int; let skipped: Int }

// ---------------------------------------------------------------------------
// 刷题题库（problems + contents 联查行）
// ---------------------------------------------------------------------------

struct ProblemListItem: Codable, Identifiable, Equatable {
    let id: String
    let source: ProblemSource
    let number: Int
    let difficulty: Difficulty
    let languages: [String]
    let judgeType: JudgeType
    let externalUrl: String
    let title: String
    let url: String
    let tags: [String]
    let knowledgePoints: [String]
    let progressStatus: ProgressStatus
    let note: String?
    let tier: String?
    let ac: Bool
}

struct ProblemListResult: Codable {
    let items: [ProblemListItem]
    let total: Int
    let page: Int
    let pageSize: Int
}

struct ProblemFacets: Codable, Equatable {
    struct Facet: Codable, Equatable, Identifiable {
        let value: String
        let count: Int
        var id: String { value }
    }
    let tags: [Facet]
    let knowledgePoints: [Facet]
}

struct ProblemListMeta: Codable, Identifiable, Equatable {
    let id: String
    let slug: String
    let title: String
    let url: String
    let problemCount: Int
}

struct ProblemListDetail: Codable {
    let list: ProblemListMeta
    let items: [ProblemListItem]
}

struct ContestSession: Codable, Identifiable, Equatable {
    let session: Int
    let problemCount: Int
    var id: Int { session }
}

struct ContestDetail: Codable {
    let session: Int
    let items: [ProblemListItem]
}

// ---------------------------------------------------------------------------
// 评测
// ---------------------------------------------------------------------------

struct JudgeProblem: Codable, Equatable {
    struct Problem: Codable, Equatable {
        let id: String
        let title: String
        let difficulty: Difficulty
        let source: ProblemSource
        let number: Int
        let url: String
        let externalUrl: String
    }

    struct LangSpec: Codable, Equatable {
        let available: Bool
        let reason: String?
        let starter: String?
    }

    struct Example: Codable, Equatable, Identifiable {
        struct Arg: Codable, Equatable {
            let name: String
            let value: String
        }
        let args: [Arg]
        let expected: String
        var id: String { args.map(\.value).joined() + expected }
    }

    let problem: Problem
    let examples: [Example]
    let cpp: LangSpec
    let python: LangSpec

    func spec(for language: JudgeLanguage) -> LangSpec {
        language == .cpp ? cpp : python
    }
}

struct JudgeVerdict: Codable, Equatable {
    struct Case: Codable, Equatable, Identifiable {
        let input: String
        let expected: String
        let actual: String
        let pass: Bool
        let error: String?
        var id: String { input + expected + actual }
    }
    let status: String?
    let compileError: String?
    let cases: [Case]?
    let passed: Int?
    let total: Int?
    let error: String?
}

struct JudgeResultDTO: Codable, Equatable {
    let submissionId: Int
    let status: JudgeStatus
    let language: JudgeLanguage
    let verdictDetail: JudgeVerdict?
    let runtimeMs: Int?
    let createdAt: Date
}

struct SubmissionIdResult: Codable { let submissionId: Int }

// ---------------------------------------------------------------------------
// 学习 / 进度 / 配额 / 搜索
// ---------------------------------------------------------------------------

struct LearnOverview: Codable, Equatable {
    struct Day: Codable, Equatable, Identifiable {
        let id: String
        let day: Int
        let title: String
        let url: String
        let status: ProgressStatus
    }

    struct Week: Codable, Equatable, Identifiable {
        let week: Int
        let title: String
        let url: String
        let seenDays: Int
        let days: [Day]
        var id: Int { week }
    }

    struct Topic: Codable, Equatable, Identifiable {
        let slug: String
        let title: String
        let url: String
        let totalDays: Int
        let seenDays: Int
        var id: String { slug }
    }

    struct Paper: Codable, Equatable, Identifiable {
        let id: String
        let title: String
        let url: String
    }

    let weeks: [Week]
    let topics: [Topic]
    let papers: [Paper]
}

struct ProgressOverview: Codable, Equatable {
    struct Learning: Codable, Equatable {
        let total: Int
        let seen: Int
        let mastered: Int
    }

    struct DifficultyBucket: Codable, Equatable {
        let total: Int
        let ac: Int
    }

    struct Practice: Codable, Equatable {
        let total: Int
        let ac: Int
        let byDifficulty: [String: DifficultyBucket]
    }

    struct Signals: Codable, Equatable {
        let learn: Double?
        let problem: Double?
        let interview: Double?
    }

    struct Mastery: Codable, Equatable, Identifiable {
        let knowledgePoint: String
        let mastery: Double
        let signals: Signals
        var id: String { knowledgePoint }
    }

    let learning: Learning
    let practice: Practice
    let mastery: [Mastery]
    let streakDays: Int
}

struct QuotaUsage: Codable, Equatable, Identifiable {
    let kind: QuotaKind
    let period: String
    let used: Int
    let quota: Int?
    var id: String { kind.rawValue + period }
}

struct QuotaMe: Codable, Equatable {
    let current: [QuotaUsage]
    let history: [QuotaUsage]
}

struct SearchItem: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let type: ContentType
    let url: String
    let tags: [String]
    let knowledgePoints: [String]
    let summary: String
    let score: Int
}

struct SearchResult: Codable {
    let items: [SearchItem]
    let total: Int
}

// ---------------------------------------------------------------------------
// 工具：leetcode sourceKey → 统一题目 ID（对齐 contracts.judgeProblemIdFromSourceKey）
// ---------------------------------------------------------------------------

func captureGroups(_ pattern: String, caseInsensitive: Bool = false, in string: String) -> [String]? {
    let options: NSRegularExpression.Options = caseInsensitive ? [.caseInsensitive] : []
    guard let regex = try? NSRegularExpression(pattern: pattern, options: options),
          let match = regex.firstMatch(in: string, range: NSRange(string.startIndex..., in: string))
    else { return nil }
    return (1..<match.numberOfRanges).compactMap { Range(match.range(at: $0), in: string).map { String(string[$0]) } }
}

func judgeProblemIdFromSourceKey(_ sourceKey: String) -> String? {
    if let g = captureGroups(#"^leetcode:solution/\d{4}-\d{4}/(\d+)_"#, in: sourceKey) {
        return String(format: "lc:%04d", Int(g[0]) ?? 0)
    }
    if let g = captureGroups(#"^leetcode:solution/\d{4}-\d{4}/LCOF(\d+)_"#, caseInsensitive: true, in: sourceKey) {
        return "lc:lcof:\(Int(g[0]) ?? 0)"
    }
    if let g = captureGroups(#"^leetcode:contest/(\d+)/Q(\d+)\."#, caseInsensitive: true, in: sourceKey) {
        return "lc:contest:\(Int(g[0]) ?? 0)q\(Int(g[1]) ?? 0)"
    }
    return nil
}
