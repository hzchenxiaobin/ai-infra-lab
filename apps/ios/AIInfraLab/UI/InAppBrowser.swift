import SwiftUI
import WebKit

/// 外链中心：docs 站题解 / 学习正文 / leetgpu.com，统一走 App 内 WebView
@Observable
final class LinkStore {
    struct Target: Identifiable {
        let id = UUID()
        let title: String
        let url: URL
    }

    var active: Target?

    func open(_ urlString: String, title: String = "内容") {
        guard let url = AppConfig.resolve(urlString) else { return }
        active = Target(title: title, url: url)
    }
}

struct InAppBrowserView: View {
    let target: LinkStore.Target
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            WebView(url: target.url)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(target.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("完成", action: onDismiss)
                            .fontWeight(.medium)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            UIApplication.shared.open(target.url)
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
