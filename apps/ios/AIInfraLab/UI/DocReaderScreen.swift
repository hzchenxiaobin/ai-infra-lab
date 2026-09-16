import SwiftUI
import WebKit

// ---------------------------------------------------------------------------
// docs 原生阅读器（题解 / 教程）：抓取 VitePress SSR 页面 → DocBlock → 原生渲染。
// 站内链接继续原生 push；外部链接走内置浏览器。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class DocReaderModel {
    enum Phase {
        case loading
        case ready([DocBlock], String)
        case failed(String)
    }

    let url: URL
    var phase: Phase = .loading

    init(url: URL) {
        self.url = url
    }

    var title: String {
        if case .ready(_, let t) = phase { return t }
        return ""
    }

    var blocks: [DocBlock] {
        if case .ready(let blocks, _) = phase { return blocks }
        return []
    }

    func load() async {
        if case .ready = phase { return }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let html = String(data: data, encoding: .utf8)
            else {
                phase = .failed("页面加载失败（HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)）")
                return
            }
            let (blocks, title) = DocHTMLParser.parse(pageHTML: html)
            phase = .ready(blocks, title)
        } catch {
            phase = .failed("网络异常：\(error.localizedDescription)")
        }
    }
}

/// 阅读器容器：NavigationStack + 站内链接原生 push + 外链浏览器
struct DocReaderScreen: View {
    let url: URL
    let title: String

    @Environment(\.dismiss) private var dismiss
    @State private var path: [DocRoute] = []
    @State private var externalLink: BrowserLink?

    struct DocRoute: Hashable {
        let url: URL
        let title: String
    }

    struct BrowserLink: Identifiable {
        let id = UUID()
        let title: String
        let url: URL
    }

    var body: some View {
        NavigationStack(path: $path) {
            DocPageView(url: url, fallbackTitle: title, onLink: handleLink)
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestination(for: DocRoute.self) { route in
                    DocPageView(url: route.url, fallbackTitle: route.title, onLink: handleLink)
                }
        }
        .preferredColorScheme(.dark)
        .sheet(item: $externalLink) { link in
            InAppBrowserView(title: link.title, url: link.url) {
                externalLink = nil
            }
        }
    }

    private func handleLink(_ url: URL) {
        // 纯锚点（页内定位）暂不支持，忽略
        guard url.host != nil || url.path.count > 1 else { return }
        if LinkStore.isDocsURL(url) {
            var target = url
            // 去掉 #锚点（原生阅读暂不做页内滚动定位）
            if let anchorRange = target.absoluteString.range(of: "#") {
                if let stripped = URL(string: String(target.absoluteString[..<anchorRange.lowerBound])) {
                    target = stripped
                }
            }
            path.append(DocRoute(url: target, title: ""))
        } else if url.scheme == "http" || url.scheme == "https" {
            externalLink = BrowserLink(title: url.host ?? "外部链接", url: url)
        }
    }
}

// MARK: - 单页

private struct DocPageView: View {
    let url: URL
    let fallbackTitle: String
    let onLink: (URL) -> Void

    @State private var model: DocReaderModel

    init(url: URL, fallbackTitle: String, onLink: @escaping (URL) -> Void) {
        self.url = url
        self.fallbackTitle = fallbackTitle
        self.onLink = onLink
        _model = State(initialValue: DocReaderModel(url: url))
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                LoadingView(text: "加载内容…")
            case .failed(let message):
                ErrorBoxView(message: message) {
                    model.phase = .loading
                    Task { await model.load() }
                }
                .padding(24)
            case .ready:
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        DocBlocksView(blocks: model.blocks, pageURL: url)
                    }
                    .padding(16)
                    .padding(.bottom, 24)
                }
                .refreshable { model.phase = .loading; await model.load() }
            }
        }
        .background(Color.page)
        .navigationTitle(model.title.isEmpty ? fallbackTitle : model.title)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("完成") { dismissReader() }
                    .fontWeight(.medium)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIApplication.shared.open(url)
                } label: {
                    Image(systemName: "safari")
                }
                .accessibilityLabel("在 Safari 打开")
            }
        }
        .task { await model.load() }
        .environment(\.openURL, OpenURLAction { url in
            onLink(url)
            return .handled
        })
    }

    @Environment(\.dismiss) private var dismiss

    private func dismissReader() {
        dismiss()
    }
}

// MARK: - 块渲染

struct DocBlocksView: View {
    let blocks: [DocBlock]
    let pageURL: URL

    var body: some View {
        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
            DocBlockView(block: block, pageURL: pageURL)
        }
    }
}

private struct DocBlockView: View {
    let block: DocBlock
    let pageURL: URL

    var body: some View {
        switch block {
        case .heading(let level, let inline):
            DocInlineText(inline, pageURL: pageURL)
                .font(headingFont(level))
                .padding(.top, level <= 2 ? 6 : 2)
        case .paragraph(let inline):
            DocInlineText(inline, pageURL: pageURL)
                .font(.subheadline)
        case .list(let items, let ordered, let start):
            DocListView(items: items, ordered: ordered, start: start, pageURL: pageURL)
        case .listItem:
            EmptyView()
        case .code(let text, let language):
            DocCodeBlock(text: text, language: language)
        case .quote(let inner):
            VStack(alignment: .leading, spacing: 8) {
                DocBlocksView(blocks: inner, pageURL: pageURL)
            }
            .padding(.leading, 10)
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 1).fill(Color.accent200).frame(width: 3)
            }
        case .table(let header, let rows):
            DocTableView(header: header, rows: rows, pageURL: pageURL)
        case .image(let spec):
            DocImageView(spec: spec, pageURL: pageURL)
        case .hr:
            Divider().overlay(Color.divider)
        case .details(let summary, let body):
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 10) {
                    DocBlocksView(blocks: body, pageURL: pageURL)
                }
                .padding(.top, 6)
            } label: {
                DocInlineText(summary, pageURL: pageURL)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.accent300)
            }
            .tint(Color.accent600)
            .padding(12)
            .background(Color.page, in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title3.weight(.bold)
        case 2: return .headline
        case 3: return .subheadline.weight(.semibold)
        case 4: return .subheadline.weight(.medium)
        default: return .footnote.weight(.medium)
        }
    }
}

private struct DocListView: View {
    let items: [DocBlock]
    let ordered: Bool
    let start: Int
    let pageURL: URL

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if case .listItem(let inline, let children) = item {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(ordered ? "\(start + index)." : "•")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.accent600)
                        VStack(alignment: .leading, spacing: 6) {
                            if !inline.isEmpty {
                                DocInlineText(inline, pageURL: pageURL)
                                    .font(.subheadline)
                            }
                            if !children.isEmpty {
                                DocBlocksView(blocks: children, pageURL: pageURL)
                                    .padding(.leading, 4)
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct DocCodeBlock: View {
    let text: String
    let language: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let language {
                Text(language)
                    .font(.caption2)
                    .foregroundStyle(Color.muted)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                Text(text)
                    .font(.mono(.footnote))
                    .foregroundStyle(Color.ink)
                    .textSelection(.enabled)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.divider))
    }
}

private struct DocTableView: View {
    let header: [[DocInline]]
    let rows: [[[DocInline]]]
    let pageURL: URL

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
                if !header.isEmpty {
                    GridRow {
                        ForEach(Array(header.enumerated()), id: \.offset) { _, cell in
                            DocInlineText(cell, pageURL: pageURL)
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 8)
                                .frame(minWidth: 90, maxWidth: 280, alignment: .leading)
                                .background(Color.accent50)
                        }
                    }
                }
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                            DocInlineText(cell, pageURL: pageURL)
                                .font(.footnote)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 8)
                                .frame(minWidth: 90, maxWidth: 280, alignment: .leading)
                                .background(Color.surface)
                        }
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.divider))
        }
    }
}

// MARK: - 图片（SVG 走 WKWebView，位图走 AsyncImage）

struct DocImageView: View {
    let spec: DocImageSpec
    let pageURL: URL

    private var isSVG: Bool {
        spec.src.hasSuffix(".svg") || spec.src.hasPrefix("data:image/svg")
    }

    private var resolvedURL: URL? {
        if spec.src.hasPrefix("data:") {
            return nil
        }
        return URL(string: spec.src, relativeTo: pageURL)?.absoluteURL
    }

    var body: some View {
        Group {
            if isSVG {
                SVGImageView(spec: spec, pageURL: pageURL)
            } else if let url = resolvedURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ZStack {
                            RoundedRectangle(cornerRadius: 10).fill(Color.surface)
                            ProgressView().tint(Color.muted)
                        }
                        .frame(height: 160)
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    case .failure:
                        ZStack {
                            RoundedRectangle(cornerRadius: 10).fill(Color.surface)
                            Image(systemName: "photo")
                                .foregroundStyle(Color.faint)
                        }
                        .frame(height: 120)
                    @unknown default:
                        EmptyView()
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .accessibilityLabel(spec.alt)
    }
}

/// SVG（文件或 data URI）用 WKWebView 的 <img> 渲染（系统 UIImage 不支持任意 SVG）
private struct SVGImageView: View {
    let spec: DocImageSpec
    let pageURL: URL

    private var aspectRatio: Double {
        guard let w = spec.width, let h = spec.height, w > 0, h > 0 else { return 16.0 / 10.0 }
        return w / h
    }

    private var html: String {
        let src: String
        if spec.src.hasPrefix("data:") {
            src = spec.src
        } else if let absolute = URL(string: spec.src, relativeTo: pageURL)?.absoluteURL.absoluteString {
            src = absolute
        } else {
            src = spec.src
        }
        let alt = spec.alt.replacingOccurrences(of: "\"", with: "&quot;")
        return """
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="margin:0;padding:0;background:transparent">
        <img id="d" src="\(src)" alt="\(alt)" style="width:100%;height:auto;display:block">
        </body></html>
        """
    }

    var body: some View {
        // 阅读页正文左右各 16pt 边距（App 为 iPhone 竖屏布局）
        let width = UIScreen.main.bounds.width - 32
        SVGWebView(html: html)
            .frame(width: width, height: width / aspectRatio)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                // WKWebView 圆角裁剪偶有失效，补一层边框
                RoundedRectangle(cornerRadius: 10).strokeBorder(Color.divider)
            )
    }
}

private struct SVGWebView: UIViewRepresentable {
    let html: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.loadHTMLString(html, baseURL: nil)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - 行内渲染

struct DocInlineText: View {
    let segments: [DocInline]
    var pageURL: URL?

    init(_ segments: [DocInline], pageURL: URL? = nil) {
        self.segments = segments
        self.pageURL = pageURL
    }

    var body: some View {
        segments.reduce(Text("")) { acc, segment in
            switch segment {
            case .text(let t):
                return acc + Text(t).foregroundColor(Color.ink)
            case .bold(let t):
                return acc + Text(t).bold().foregroundColor(Color.ink)
            case .italic(let t):
                return acc + Text(t).italic().foregroundColor(Color.ink)
            case .code(let t):
                return acc + Text(t).font(.mono(.footnote)).foregroundColor(Color.accent300)
            case .link(let text, let url):
                // 相对链接按页面 URL 解析（docs 正文内链多为相对路径）
                var resolved: URL?
                if let pageURL {
                    resolved = URL(string: url, relativeTo: pageURL)?.absoluteURL
                }
                resolved = resolved ?? URL(string: url)
                var attributed = AttributedString(text)
                if let resolved {
                    attributed.link = resolved
                }
                attributed.foregroundColor = .accent400
                attributed.underlineStyle = .single
                return acc + Text(attributed)
            }
        }
    }
}
