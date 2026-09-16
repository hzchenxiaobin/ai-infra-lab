import Foundation

// ---------------------------------------------------------------------------
// 报告解析器（移植 web ReportBody.tsx）：把 renderReportMarkdown 的整段
// markdown 按 `## ` 拆成卡片模块；维度行 → chips；「【答】」分段与提问配对。
// ---------------------------------------------------------------------------

enum ReportParser {
    struct Section {
        let heading: String
        let body: String
    }

    struct Dim: Equatable {
        let name: String
        let grade: String
    }

    enum QBlock {
        case dims([Dim])
        case labeled(label: String, text: String)
        case md(String)
    }

    struct ParsedReport {
        let sections: [Section]
        let questionBlocks: [Int: [QBlock]]
    }

    static let knownLabels: Set<String> = ["诊断", "改进建议", "参考答案", "要点对照"]

    static func splitSections(_ text: String) -> [Section] {
        var sections: [(heading: String, body: [String])] = []
        var current: (heading: String, body: [String])?
        for line in text.components(separatedBy: "\n") {
            if line.hasPrefix("# ") { continue }
            if let heading = headingText(line, marker: "## ") {
                current = (heading, [])
                sections.append(current!)
            } else if current != nil {
                current?.body.append(line)
            }
        }
        return sections
            .map { Section(heading: $0.heading, body: $0.body.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)) }
            .filter { !$0.heading.isEmpty || !$0.body.isEmpty }
    }

    private static func headingText(_ line: String, marker: String) -> String? {
        guard line.hasPrefix(marker) else { return nil }
        let text = String(line.dropFirst(marker.count)).trimmingCharacters(in: .whitespaces)
        return text
    }

    /// 「准确性 C · 深度 C」形式的维度评分行
    static func parseDims(_ content: String) -> [Dim]? {
        var dims: [Dim] = []
        for segment in content.components(separatedBy: " · ") {
            let trimmed = segment.trimmingCharacters(in: .whitespaces)
            guard let match = captureGroups(#"^(.+?)\s+([ABCD])$"#, in: trimmed), match.count == 2 else {
                return nil
            }
            dims.append(Dim(name: match[0], grade: match[1]))
        }
        return dims.isEmpty ? nil : dims
    }

    /// 题目卡片正文：维度行 → chips；带标签 bullet → 子块；续行并入上一块
    static func parseQuestionBody(_ body: String) -> [QBlock] {
        var blocks: [QBlock] = []
        var dimsDone = false
        for line in body.components(separatedBy: "\n") {
            if line.hasPrefix("- ") {
                let content = String(line.dropFirst(2))
                if !dimsDone, let dims = parseDims(content) {
                    blocks.append(.dims(dims))
                    dimsDone = true
                    continue
                }
                if let label = labeledBlock(content) {
                    blocks.append(.labeled(label: label.0, text: label.1))
                    continue
                }
                blocks.append(.md(line))
                continue
            }
            if let last = blocks.last, case .md(let existing) = last {
                blocks[blocks.count - 1] = .md(existing + "\n" + line)
            } else if !line.trimmingCharacters(in: .whitespaces).isEmpty {
                blocks.append(.md(line))
            }
        }
        return blocks
    }

    private static func labeledBlock(_ content: String) -> (String, String)? {
        guard let match = captureGroups(#"^(\S{2,6})：([\s\S]*)$"#, in: content), match.count == 2,
              knownLabels.contains(match[0]) else { return nil }
        return (match[0], match[1])
    }

    /// 新格式参考答案按行首「【答】」拆成每问一条；旧格式返回 nil
    static func splitAnswers(_ text: String) -> [String]? {
        var answers: [String] = []
        for line in text.components(separatedBy: "\n") {
            if line.hasPrefix("【答】") {
                answers.append(String(line.dropFirst("【答】".count)))
            } else if !answers.isEmpty {
                answers[answers.count - 1] += "\n" + line
            }
        }
        if answers.isEmpty { return nil }
        let trimmed = answers.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        return trimmed.contains { !$0.isEmpty } ? trimmed : nil
    }

    /// 去掉面试官消息里的寒暄 / 换题前缀
    static func stripChatPrefix(_ content: String) -> String {
        var result = content
        result = replace(prefixPattern: #"^\s*你好，我是今天的面试官[\s\S]*?我们开始第一题：\s*"#, in: result)
        result = replace(prefixPattern: #"^好的，进入第\s*\d+\s*题：\s*"#, in: result)
        return result
    }

    private static func replace(prefixPattern: String, in text: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: prefixPattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(match.range, in: text) else {
            return text
        }
        return String(text[range.upperBound...])
    }

    /// 报告题目模块序号 → session.questionIds 对齐
    static func isQuestionSection(_ heading: String) -> Bool {
        captureGroups(#"^第\s*\d+\s*题"#, in: heading) != nil
            || heading.hasPrefix("第 ")
    }

    /// 提取「第 N 题」的题号（1-based）
    static func questionIndex(_ heading: String) -> Int? {
        guard let match = captureGroups(#"^第\s*(\d+)\s*题"#, in: heading), let index = Int(match[0]) else {
            return nil
        }
        return index - 1
    }

    /// 「总评：X」→ 等级
    static func overallGrade(from heading: String) -> String? {
        guard let match = captureGroups(#"^总评[：:]\s*([ABCD])$"#, in: heading) else { return nil }
        return match[0]
    }
}
