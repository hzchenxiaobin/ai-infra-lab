import SwiftUI

// ---------------------------------------------------------------------------
// 根视图：登录态分发 + 五 Tab 主界面（学习 / 刷题 / 面试 / 我的 / 搜索，
// 对齐 web 顶栏导航）。
// ---------------------------------------------------------------------------

struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(LinkStore.self) private var links

    var body: some View {
        ZStack {
            switch session.state {
            case .unknown:
                VStack(spacing: 12) {
                    Image(systemName: "circle.hexagongrid.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(Color.accent600)
                    Text("AIInfra Lab")
                        .font(.headline)
                        .foregroundStyle(Color.muted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.page)
            case .loggedOut:
                LoginScreen()
            case .loggedIn:
                MainTabView()
            }
        }
        // docs 正文 → 原生阅读器（fullScreenCover）；外部域 → 内置浏览器（sheet）
        .fullScreenCover(
            isPresented: Binding(
                get: {
                    if case .doc = links.active { return true }
                    return false
                },
                set: { if !$0 { links.active = nil } }
            )
        ) {
            if case .doc(let title, let url) = links.active {
                DocReaderScreen(url: url, title: title)
            }
        }
        .sheet(
            isPresented: Binding(
                get: {
                    if case .browser = links.active { return true }
                    return false
                },
                set: { if !$0 { links.active = nil } }
            )
        ) {
            if case .browser(let title, let url) = links.active {
                InAppBrowserView(title: title, url: url) { links.active = nil }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sessionExpired)) { _ in
            session.expire()
        }
    }
}

enum MainTab: Hashable {
    case learn, problems, interview, dashboard, search
}

struct MainTabView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        TabView {
            LearnScreen()
                .tabItem { Label("学习", systemImage: "book.fill") }
            ProblemsScreen()
                .tabItem { Label("刷题", systemImage: "square.stack.3d.up.fill") }
            InterviewHomeScreen()
                .tabItem { Label("面试", systemImage: "text.bubble.fill") }
            DashboardScreen()
                .tabItem { Label("我的", systemImage: "chart.bar.fill") }
            SearchScreen()
                .tabItem { Label("搜索", systemImage: "magnifyingglass") }
        }
    }
}
