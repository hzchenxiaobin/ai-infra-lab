import SwiftUI

// ---------------------------------------------------------------------------
// 轻量 Markdown 渲染（对齐 web Markdown.tsx 子集：标题/列表/引用/代码块/
// 加粗/行内代码/链接；$KaTeX$ 保留原文展示）。
// ---------------------------------------------------------------------------

enum MDInline: Equatable {
    case text(String)
    case bold(String)
    case code(String)
    case link(text: String, url: String)
}

enum MDBlock: Equatable {
    case heading(Int, [MDInline])
    case paragraph([MDInline])
    case list([[MDInline]], ordered: Bool)
    case code(String, language: String?)
    case quote([[MDInline]])
}

enum MarkdownParser {
    static let inlineRegex = try! NSRegularExpression(
        pattern: #"\*\*(.+?)\*\*|`([^`\n]+)`|\[([^\]]+)\]\(([^)\s]+)\)"#
    )

    static func parseInline(_ text: String) -> [MDInline] {
        var segments: [MDInline] = []
        var cursor = text.startIndex
        let matches = inlineRegex.matches(in: text, range: NSRange(text.startIndex..., in: text))
        for match in matches {
            if let boldRange = Range(match.range(at: 1), in: text) {
                if cursor < boldRange.lowerBound {
                    segments.append(.text(String(text[cursor..<boldRange.lowerBound])))
                }
                segments.append(.bold(String(text[boldRange])))
                cursor = boldRange.upperBound
            } else if let codeRange = Range(match.range(at: 2), in: text) {
                if cursor < codeRange.lowerBound {
                    segments.append(.text(String(text[cursor..<codeRange.lowerBound])))
                }
                segments.append(.code(String(text[codeRange])))
                cursor = codeRange.upperBound
            } else if let textRange = Range(match.range(at: 3), in: text),
                      let urlRange = Range(match.range(at: 4), in: text) {
                if cursor < textRange.lowerBound {
                    segments.append(.text(String(text[cursor..<textRange.lowerBound])))
                }
                segments.append(.link(text: String(text[textRange]), url: String(text[urlRange])))
                cursor = urlRange.upperBound
            }
        }
        if cursor < text.endIndex {
            segments.append(.text(String(text[cursor...])))
        }
        return segments.filter { segment in
            if case .text(let t) = segment { return !t.isEmpty }
            return true
        }
    }

    static func parse(_ source: String) -> [MDBlock] {
        var blocks: [MDBlock] = []
        var paragraphLines: [String] = []
        var listItems: [[MDInline]] = []
        var listOrdered = false
        var quoteLines: [String] = []

        func flushParagraph() {
            guard !paragraphLines.isEmpty else { return }
            blocks.append(.paragraph(parseInline(paragraphLines.joined(separator: "\n"))))
            paragraphLines = []
        }

        func flushList() {
            guard !listItems.isEmpty else { return }
            blocks.append(.list(listItems, ordered: listOrdered))
            listItems = []
        }

        func flushQuote() {
            guard !quoteLines.isEmpty else { return }
            blocks.append(.quote(quoteLines.map { parseInline($0) }))
            quoteLines = []
        }

        func flushAll() {
            flushParagraph()
            flushList()
            flushQuote()
        }

        let lines = source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var i = 0
        while i < lines.count {
            let raw = lines[i]
            let line = raw.trimmingCharacters(in: .whitespaces)

            if line.isEmpty {
                flushAll()
                i += 1
                continue
            }

            // 围栏代码块
            if line.hasPrefix("```") {
                flushAll()
                let language = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                var codeLines: [String] = []
                i += 1
                while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    codeLines.append(lines[i])
                    i += 1
                }
                blocks.append(.code(codeLines.joined(separator: "\n"), language: language.isEmpty ? nil : language))
                i += 1
                continue
            }

            // 标题
            if let level = headingLevel(line) {
                flushAll()
                blocks.append(.heading(level, parseInline(String(line.drop { $0 == "#" || $0 == " " }))))
                i += 1
                continue
            }

            // 引用
            if line.hasPrefix(">") {
                flushParagraph()
                flushList()
                quoteLines.append(String(line.dropFirst()).trimmingCharacters(in: .whitespaces))
                i += 1
                continue
            }

            // 列表
            if line.hasPrefix("- ") || line.hasPrefix("* ") {
                if listOrdered { flushList() }
                flushParagraph()
                flushQuote()
                listOrdered = false
                listItems.append(parseInline(String(line.dropFirst(2))))
                i += 1
                continue
            }
            if let numberItem = orderedListItem(line) {
                if !listOrdered { flushList() }
                flushParagraph()
                flushQuote()
                listOrdered = true
                listItems.append(parseInline(numberItem))
                i += 1
                continue
            }

            // 普通段落（延续列表项时并入上一项）
            if !listItems.isEmpty, raw.hasPrefix("  ") || raw.hasPrefix("\t") {
                if case .text(let t)? = parseInline(line).first {
                    var last = listItems.removeLast()
                    if case .text(let existing) = last.first {
                        last = [.text(existing + " " + t)] + Array(last.dropFirst())
                    } else {
                        last.insert(.text(t), at: 0)
                    }
                    listItems.append(last)
                } else {
                    listItems.append(parseInline(line))
                }
                i += 1
                continue
            }

            flushList()
            flushQuote()
            paragraphLines.append(line)
            i += 1
        }
        flushAll()
        return blocks
    }

    private static func headingLevel(_ line: String) -> Int? {
        guard line.hasPrefix("#") else { return nil }
        var level = 0
        for ch in line {
            if ch == "#" { level += 1 } else { break }
        }
        guard (1...6).contains(level), line.count > level, line[line.index(line.startIndex, offsetBy: level)] == " " else {
            return nil
        }
        return level
    }

    private static func orderedListItem(_ line: String) -> String? {
        let pattern = #"^\d{1,3}[.)]\s+(.*)$"#
        guard let match = captureGroups(pattern, in: line), match.count == 1 else { return nil }
        return match[0]
    }
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

struct MarkdownView: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(MarkdownParser.parse(text).enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .environment(\.openURL, OpenURLAction { url in
            Services.shared.links.open(url.absoluteString)
            return .handled
        })
    }

    @ViewBuilder
    private func blockView(_ block: MDBlock) -> some View {
        switch block {
        case .heading(let level, let inline):
            inlineText(inline)
                .font(headingFont(level))
                .padding(.top, level <= 2 ? 4 : 2)
        case .paragraph(let inline):
            inlineText(inline)
                .font(.subheadline)
                .foregroundStyle(Color.ink)
        case .list(let items, let ordered):
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(ordered ? "\(index + 1)." : "•")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.accent600)
                        inlineText(item)
                            .font(.subheadline)
                    }
                }
            }
        case .code(let code, let language):
            VStack(alignment: .leading, spacing: 6) {
                if let language {
                    Text(language)
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    Text(code)
                        .font(.mono(.footnote))
                        .foregroundStyle(Color.ink)
                        .textSelection(.enabled)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.page, in: RoundedRectangle(cornerRadius: 8))
        case .quote(let lines):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    inlineText(line)
                        .font(.subheadline)
                        .foregroundStyle(Color.muted)
                }
            }
            .padding(.leading, 10)
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 1).fill(Color.accent200).frame(width: 3)
            }
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title3.weight(.bold)
        case 2: return .headline
        case 3: return .subheadline.weight(.semibold)
        default: return .subheadline.weight(.medium)
        }
    }

    @ViewBuilder
    private func inlineText(_ segments: [MDInline]) -> some View {
        segments.reduce(Text("")) { acc, segment in
            switch segment {
            case .text(let t):
                return acc + Text(t).foregroundColor(Color.ink)
            case .bold(let t):
                return acc + Text(t).bold().foregroundColor(Color.ink)
            case .code(let t):
                return acc + Text(t).font(.mono(.footnote)).foregroundColor(Color.accent300)
            case .link(let text, let url):
                var attributed = AttributedString(text)
                attributed.link = URL(string: url)
                attributed.foregroundColor = .accent400
                attributed.underlineStyle = .single
                return acc + Text(attributed)
            }
        }
    }
}
