import Foundation

// ---------------------------------------------------------------------------
// docs 站原生阅读：轻量 HTML 解析器（零依赖）。
// 抓取 VitePress SSR 页面，提取 <main> 正文，转换为原生块模型渲染。
// 覆盖子集：h1-h6 / p / ul-ol-li（可嵌套）/ blockquote / hr / details /
// table / shiki 代码块（language-* div）/ img（svg、data-uri、png）/ 行内
// strong-em-code-a-br / KaTeX 降级取文本。
// ---------------------------------------------------------------------------

// MARK: - 块模型

enum DocInline: Equatable {
    case text(String)
    case bold(String)
    case italic(String)
    case code(String)
    case link(text: String, url: String)
}

struct DocImageSpec: Equatable {
    let src: String
    let alt: String
    let width: Double?
    let height: Double?
}

indirect enum DocBlock {
    case heading(level: Int, inline: [DocInline])
    case paragraph([DocInline])
    case listItem([DocInline], children: [DocBlock])
    case list(items: [DocBlock], ordered: Bool, start: Int)
    case code(text: String, language: String?)
    case quote([DocBlock])
    case table(header: [[DocInline]], rows: [[[DocInline]]])
    case image(DocImageSpec)
    case hr
    case details(summary: [DocInline], body: [DocBlock])
}

// MARK: - HTML 节点树

final class HTMLNode {
    static let voidElements: Set<String> = [
        "br", "hr", "img", "input", "meta", "link", "source",
        "area", "base", "col", "embed", "track", "wbr",
    ]

    let name: String
    var attrs: [String: String]
    var children: [HTMLNode]

    init(name: String, attrs: [String: String] = [:], children: [HTMLNode] = []) {
        self.name = name
        self.attrs = attrs
        self.children = children
    }

    var className: String { attrs["class"] ?? "" }

    var isTextNode: Bool { name == "#text" }

    var rawText: String {
        if isTextNode { return attrs["#text"] ?? "" }
        return children.map(\.rawText).joined()
    }
}

enum HTMLTreeParser {
    static func parse(_ html: String) -> HTMLNode {
        let root = HTMLNode(name: "#root")
        var stack: [HTMLNode] = [root]
        let chars = Array(html)
        let count = chars.count
        var i = 0

        func appendText(_ text: String) {
            guard !text.isEmpty else { return }
            stack[stack.count - 1].children.append(HTMLNode(name: "#text", attrs: ["#text": unescapeEntities(text)]))
        }

        while i < count {
            guard chars[i] == "<" else {
                // 文本直到下一个 '<'
                var j = i
                while j < count, chars[j] != "<" { j += 1 }
                appendText(String(chars[i..<j]))
                i = j
                continue
            }

            // 注释
            if matches(chars, at: i, "<!--") {
                if let end = find(chars, "-->", from: i + 4) {
                    i = end + 3
                } else {
                    i = count
                }
                continue
            }
            // doctype / CDATA 等声明
            if i + 1 < count, chars[i + 1] == "!" || chars[i + 1] == "?" {
                if let end = find(chars, ">", from: i + 2) {
                    i = end + 1
                } else {
                    i = count
                }
                continue
            }
            // 闭合标签
            if i + 1 < count, chars[i + 1] == "/" {
                if let end = find(chars, ">", from: i + 2) {
                    let name = String(chars[(i + 2)..<end]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    // 回退到匹配的开标签（容错未配对标签）
                    for index in stride(from: stack.count - 1, through: 1, by: -1) {
                        if stack[index].name == name {
                            stack.removeSubrange(index...)
                            break
                        }
                    }
                    i = end + 1
                } else {
                    i = count
                }
                continue
            }

            // 开始标签：解析标签名与属性
            var j = i + 1
            while j < count, !chars[j].isWhitespace, chars[j] != ">" { j += 1 }
            let name = String(chars[(i + 1)..<j]).lowercased()
            guard isNameCharacter(name) else {
                // 非法 '<'（如 a<b 数学比较），按文本处理
                appendText("<")
                i += 1
                continue
            }

            var attrs: [String: String] = [:]
            var selfClosing = false
            // 扫描属性
            while j < count {
                while j < count, chars[j].isWhitespace { j += 1 }
                if j < count, chars[j] == ">" {
                    j += 1
                    break
                }
                if j + 1 < count, chars[j] == "/", chars[j + 1] == ">" {
                    selfClosing = true
                    j += 2
                    break
                }
                // 属性名
                var k = j
                while k < count, !chars[k].isWhitespace, chars[k] != "=", chars[k] != ">" { k += 1 }
                let attrName = String(chars[j..<k]).lowercased()
                j = k
                var value = ""
                if j < count, chars[j] == "=" {
                    j += 1
                    if j < count, chars[j] == "\"" || chars[j] == "'" {
                        let quote = chars[j]
                        j += 1
                        let start = j
                        while j < count, chars[j] != quote { j += 1 }
                        value = String(chars[start..<j])
                        j += 1
                    } else {
                        let start = j
                        while j < count, !chars[j].isWhitespace, chars[j] != ">" { j += 1 }
                        value = String(chars[start..<j])
                    }
                }
                if !attrName.isEmpty {
                    attrs[attrName] = unescapeEntities(value)
                }
            }

            i = j

            // script / style 内容整体跳过
            if name == "script" || name == "style" {
                let closeTag = "</\(name)"
                if let end = find(chars, closeTag, from: i) {
                    i = end
                } else {
                    i = count
                }
                continue
            }

            let node = HTMLNode(name: name, attrs: attrs)
            stack[stack.count - 1].children.append(node)
            if !selfClosing, !HTMLNode.voidElements.contains(name) {
                stack.append(node)
            }
        }
        return root
    }

    private static func isNameCharacter(_ name: String) -> Bool {
        guard let first = name.first else { return false }
        return first.isLetter
    }

    private static func matches(_ chars: [Character], at index: Int, _ prefix: String) -> Bool {
        let p = Array(prefix)
        guard index + p.count <= chars.count else { return false }
        return Array(chars[index..<(index + p.count)]) == p
    }

    private static func find(_ chars: [Character], _ needle: String, from: Int) -> Int? {
        let n = Array(needle)
        guard !n.isEmpty else { return nil }
        var i = from
        while i + n.count <= chars.count {
            if Array(chars[i..<(i + n.count)]) == n {
                return i
            }
            i += 1
        }
        return nil
    }
}

// MARK: - 实体解码

func unescapeEntities(_ s: String) -> String {
    guard s.contains("&") else { return s }
    var result = ""
    result.reserveCapacity(s.count)
    let chars = Array(s)
    var i = 0
    let named: [String: String] = [
        "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'",
        "nbsp": "\u{00a0}", "hellip": "…", "mdash": "—", "ndash": "–", "minus": "−",
        "ldquo": "“", "rdquo": "”", "lsquo": "‘", "rsquo": "’",
        "middot": "·", "times": "×", "divide": "÷", "plusmn": "±", "deg": "°",
        "larr": "←", "rarr": "→", "uarr": "↑", "darr": "↓", "harr": "↔",
        "ne": "≠", "le": "≤", "ge": "≥", "infin": "∞", "radic": "√",
        "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "theta": "θ",
        "lambda": "λ", "mu": "μ", "pi": "π", "sigma": "σ", "omega": "ω",
        "copy": "©", "reg": "®", "trade": "™", "bull": "•", "dagger": "†",
        "prime": "′", "Prime": "″", "ensp": " ", "emsp": " ", "thinsp": " ",
        "checkmark": "✓", "cross": "✗", "star": "☆", "bigstar": "★",
    ]
    while i < chars.count {
        if chars[i] == "&" {
            if i + 1 < chars.count, chars[i + 1] == "#" {
                // 数字实体 &#123; &#x7B;
                var j = i + 2
                var hex = false
                if j < chars.count, chars[j] == "x" || chars[j] == "X" {
                    hex = true
                    j += 1
                }
                let start = j
                while j < chars.count, chars[j] != ";" { j += 1 }
                if j < chars.count, j > start {
                    let digits = String(chars[start..<j])
                    let code = UInt32(hex ? "0x" + digits : digits, radix: hex ? 16 : 10) ?? 0
                    if let scalar = Unicode.Scalar(code) {
                        result.unicodeScalars.append(scalar)
                        i = j + 1
                        continue
                    }
                }
                result.append("&")
                i += 1
                continue
            }
            // 命名实体
            var j = i + 1
            while j < chars.count, chars[j].isLetter || chars[j].isNumber, j - i <= 10 { j += 1 }
            if j < chars.count, chars[j] == ";", j > i + 1 {
                let name = String(chars[(i + 1)..<j])
                if let mapped = named[name] {
                    result += mapped
                    i = j + 1
                    continue
                }
            }
            result.append("&")
            i += 1
        } else {
            result.append(chars[i])
            i += 1
        }
    }
    return result
}

// MARK: - 页面 → DocBlock

enum DocHTMLParser {
    /// 解析整页 HTML：提取 <main> 正文与标题
    static func parse(pageHTML html: String) -> (blocks: [DocBlock], title: String) {
        let title = pageTitle(html)
        let main = mainSlice(html)
        let tree = HTMLTreeParser.parse(main)
        let blocks = convertBlocks(tree.children)
        return (blocks, title)
    }

    private static func mainSlice(_ html: String) -> String {
        if let mainStart = html.range(of: "<main") {
            if let mainEnd = html.range(of: "</main>"), mainEnd.lowerBound > mainStart.lowerBound {
                return String(html[mainStart.lowerBound..<mainEnd.upperBound])
            }
        }
        if let bodyStart = html.range(of: "<body") {
            return String(html[bodyStart.lowerBound...])
        }
        return html
    }

    private static func pageTitle(_ html: String) -> String {
        guard let startTag = html.range(of: "<title"),
              let tagClose = html.range(of: ">", range: startTag.upperBound..<html.endIndex),
              let end = html.range(of: "</title>", range: tagClose.upperBound..<html.endIndex)
        else { return "" }
        let raw = String(html[tagClose.upperBound..<end.lowerBound])
        let text = unescapeEntities(raw)
            .trimmingCharacters(in: CharacterSet(charactersIn: " \t\n\r>"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        // VitePress 标题形如「xxx | 站名」，取首段
        if let bar = text.range(of: " | ") {
            return String(text[..<bar.lowerBound])
        }
        return text
    }

    // MARK: 块转换

    private static func convertBlocks(_ nodes: [HTMLNode]) -> [DocBlock] {
        var blocks: [DocBlock] = []
        for node in nodes {
            blocks.append(contentsOf: convertBlock(node))
        }
        return blocks
    }

    private static func convertBlock(_ node: HTMLNode) -> [DocBlock] {
        if node.isTextNode {
            let text = collapseText(node.rawText)
            return text.isEmpty ? [] : [.paragraph([.text(text)])]
        }

        switch node.name {
        case "h1", "h2", "h3", "h4", "h5", "h6":
            let level = Int(String(node.name.last!)) ?? 2
            let (inline, images) = convertInline(node.children)
            var blocks: [DocBlock] = []
            blocks.append(contentsOf: images.map { .image($0) })
            if !inline.isEmpty {
                blocks.insert(.heading(level: level, inline: inline), at: 0)
            }
            return blocks

        case "p":
            let (inline, images) = convertInline(node.children)
            var blocks: [DocBlock] = []
            if !inline.isEmpty { blocks.append(.paragraph(inline)) }
            blocks.append(contentsOf: images.map { .image($0) })
            return blocks

        case "ul", "ol":
            let ordered = node.name == "ol"
            let start = Int(node.attrs["start"] ?? "") ?? 1
            let items = node.children.filter { $0.name == "li" }.map { li in
                // li = 行内内容 + 可能的嵌套块（列表/表格/代码块/引用/折叠块）
                var inline: [DocInline] = []
                var children: [DocBlock] = []
                for child in li.children {
                    if child.isTextNode {
                        let t = collapseText(child.rawText)
                        if !t.isEmpty { inline.append(.text(t)) }
                    } else if child.name == "ul" || child.name == "ol" || child.name == "p" || child.name == "details"
                        || child.name == "table" || child.name == "blockquote" || child.name == "pre" || child.name == "div" {
                        children.append(contentsOf: convertBlock(child))
                    } else if child.name == "img" {
                        if let spec = imageSpec(child) { children.append(.image(spec)) }
                    } else if child.name == "hr" {
                        children.append(.hr)
                    } else {
                        let (childInline, childImages) = convertInline([child])
                        inline.append(contentsOf: childInline)
                        children.append(contentsOf: childImages.map { .image($0) })
                    }
                }
                return DocBlock.listItem(inline, children: children)
            }
            return items.isEmpty ? [] : [.list(items: items, ordered: ordered, start: start)]

        case "blockquote":
            let inner = convertBlocks(node.children)
            return inner.isEmpty ? [] : [.quote(inner)]

        case "table":
            return [tableBlock(node)].compactMap { $0 }

        case "hr":
            return [.hr]

        case "details":
            let summaryNode = node.children.first { $0.name == "summary" }
            let (summary, _) = convertInline(summaryNode?.children ?? [])
            let body = convertBlocks(node.children.filter { $0.name != "summary" })
            return [.details(summary: summary, body: body)]

        case "pre":
            return [.code(text: codeText(node), language: nil)]

        case "img":
            if let spec = imageSpec(node) { return [.image(spec)] }
            return []

        case "div":
            // 代码块容器：<div class="language-cpp line-numbers-mode">
            if let language = codeLanguage(node) {
                let pre = node.children.first { $0.name == "pre" } ?? node
                return [.code(text: codeText(pre), language: language)]
            }
            if node.className.contains("line-numbers-wrapper") { return [] }
            return convertBlocks(node.children)

        case "button":
            return []

        case "span":
            if node.className == "lang" { return [] }
            return convertBlocks(node.children)

        case "br":
            return []

        case "figure":
            return convertBlocks(node.children)

        default:
            return convertBlocks(node.children)
        }
    }

    private static func codeLanguage(_ div: HTMLNode) -> String? {
        for cls in div.className.split(separator: " ") {
            if cls.hasPrefix("language-") {
                let lang = String(cls.dropFirst("language-".count))
                return lang.isEmpty || lang == "text" ? nil : lang
            }
        }
        return nil
    }

    /// shiki 代码块：每个 <span class="line"> 一行；无结构时取纯文本
    private static func codeText(_ pre: HTMLNode) -> String {
        let code = pre.children.first { $0.name == "code" } ?? pre
        let lines = code.children.filter { $0.name == "span" && $0.className == "line" }
        if lines.isEmpty {
            return code.rawText
        }
        return lines.map { $0.rawText }.joined(separator: "\n")
    }

    private static func tableBlock(_ table: HTMLNode) -> DocBlock? {
        var header: [[DocInline]] = []
        var rows: [[[DocInline]]] = []
        for section in table.children {
            guard section.name == "thead" || section.name == "tbody" || section.name == "tr" else { continue }
            let trs: [HTMLNode]
            if section.name == "tr" {
                trs = [section]
            } else {
                trs = section.children.filter { $0.name == "tr" }
            }
            for tr in trs {
                let cells = tr.children
                    .filter { $0.name == "th" || $0.name == "td" }
                    .map { convertInline($0.children).inline }
                if section.name == "thead" || (header.isEmpty && section.name == "tr" && tr.children.contains(where: { $0.name == "th" })) {
                    header = cells
                } else {
                    rows.append(cells)
                }
            }
        }
        if header.isEmpty && rows.isEmpty { return nil }
        return .table(header: header, rows: rows)
    }

    private static func imageSpec(_ img: HTMLNode) -> DocImageSpec? {
        guard let src = img.attrs["src"], !src.isEmpty else { return nil }
        return DocImageSpec(
            src: src,
            alt: img.attrs["alt"] ?? "",
            width: Double(img.attrs["width"] ?? ""),
            height: Double(img.attrs["height"] ?? "")
        )
    }

    // MARK: 行内转换

    private static func convertInline(_ nodes: [HTMLNode]) -> (inline: [DocInline], images: [DocImageSpec]) {
        var inline: [DocInline] = []
        var images: [DocImageSpec] = []

        func append(_ segment: DocInline) {
            inline.append(segment)
        }

        func walk(_ nodes: [HTMLNode]) {
            for node in nodes {
                if node.isTextNode {
                    let t = collapseText(node.rawText)
                    if !t.isEmpty { append(.text(t)) }
                    continue
                }
                switch node.name {
                case "strong", "b":
                    let t = collapseText(node.rawText)
                    if !t.isEmpty { append(.bold(t)) }
                case "em", "i":
                    let t = collapseText(node.rawText)
                    if !t.isEmpty { append(.italic(t)) }
                case "code":
                    append(.code(node.rawText))
                case "a":
                    if node.className.contains("header-anchor") { break }
                    let href = node.attrs["href"] ?? ""
                    let text = collapseText(node.rawText)
                    if !href.isEmpty || !text.isEmpty {
                        append(.link(text: text, url: href))
                    }
                case "img":
                    if let spec = imageSpec(node) { images.append(spec) }
                case "br":
                    append(.text("\n"))
                case "span":
                    // KaTeX：优先取 annotation 里的 LaTeX 源码，否则拼接可见文本
                    if node.className.contains("katex") {
                        if let tex = firstDescendant(node, name: "annotation")?.rawText, !tex.isEmpty {
                            append(.code(collapseText(tex)))
                        } else {
                            let visible = node.rawText
                            if !visible.isEmpty { append(.text(visible)) }
                        }
                        break
                    }
                    if node.className == "lang" { break }
                    walk(node.children)
                case "button":
                    break
                case "sup", "sub":
                    let t = collapseText(node.rawText)
                    if !t.isEmpty { append(.text(t)) }
                default:
                    walk(node.children)
                }
            }
        }

        walk(nodes)

        // 合并相邻纯文本段
        var merged: [DocInline] = []
        for segment in inline {
            if case .text(let t) = segment, case .text(let prev)? = merged.last {
                merged[merged.count - 1] = .text(prev + t)
            } else {
                merged.append(segment)
            }
        }
        if case .text(let t)? = merged.first, t.isEmpty { merged.removeFirst() }
        if case .text(let t)? = merged.last, t.isEmpty { merged.removeLast() }
        return (merged, images)
    }

    private static func firstDescendant(_ node: HTMLNode, name: String) -> HTMLNode? {
        for child in node.children {
            if child.name == name { return child }
            if let found = firstDescendant(child, name: name) { return found }
        }
        return nil
    }

    /// HTML 文本折叠：换行/连续空白 → 单空格；去零宽字符
    private static func collapseText(_ s: String) -> String {
        var result = ""
        var lastWasSpace = false
        for ch in s {
            if ch == "\u{200b}" || ch == "\u{feff}" { continue }
            if ch.isWhitespace {
                if !lastWasSpace { result.append(" ") }
                lastWasSpace = true
            } else {
                result.append(ch)
                lastWasSpace = false
            }
        }
        return result.trimmingCharacters(in: .whitespaces)
    }
}
