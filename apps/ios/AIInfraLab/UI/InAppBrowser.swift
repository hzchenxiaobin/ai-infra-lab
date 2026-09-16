import SwiftUI
import WebKit

/// 外链中心：
/// - docs 站同源路径（/learn、/problems/{algo|gpu|contest|lists}）→ 原生阅读器
/// - 其余外部域（leetgpu.com、leetcode.cn 等）→ App 内 WebView
@Observable
final class LinkStore {
    enum Target: Identifiable {
        case browser(title: String, url: URL)
        case doc(title: String, url: URL)

        var id: String {
            switch self {
            case .browser(let title, let url): return "browser:\(title):\(url.absoluteString)"
            case .doc(let title, let url): return "doc:\(title):\(url.absoluteString)"
            }
        }
    }

    var active: Target?

    /// docs 站正文路径前缀（对齐 Caddy 路由表 deploy/Caddyfile）
    private static let docsPrefixes = [
        "/learn/", "/problems/algo/", "/problems/gpu/",
        "/problems/contest/", "/problems/lists/",
    ]

    static func isDocsURL(_ url: URL) -> Bool {
        let base = AppConfig.baseURL
        guard url.host == base.host, url.port == base.port ?? (url.scheme == "http" ? 80 : 443) else {
            return false
        }
        let path = url.path.isEmpty ? "/" : url.path
        return path == "/learn" || docsPrefixes.contains { path == $0 || path.hasPrefix($0) }
    }

    func open(_ urlString: String, title: String = "内容") {
        guard let url = AppConfig.resolve(urlString) else { return }
        if Self.isDocsURL(url) {
            var target = url
            if let anchorRange = url.absoluteString.range(of: "#"),
               let stripped = URL(string: String(url.absoluteString[..<anchorRange.lowerBound])) {
                target = stripped
            }
            active = .doc(title: title, url: target)
        } else if url.scheme == "http" || url.scheme == "https" {
            active = .browser(title: title, url: url)
        }
    }
}

struct InAppBrowserView: View {
    let title: String
    let url: URL
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            WebView(url: url)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("完成", action: onDismiss)
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
        }
        .preferredColorScheme(.dark)
    }
}

struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.preferredContentMode = .mobile
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.backgroundColor = UIColor(Color.page)
        webView.isOpaque = false
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
