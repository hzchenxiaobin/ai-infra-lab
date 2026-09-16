import Foundation
import SwiftUI

/// 全局服务容器（API + 会话 + 外链）
@MainActor
final class Services {
    static let shared = Services()

    let api = API()
    let links = LinkStore()
    let session: SessionStore

    private init() {
        session = SessionStore(api: api)
    }
}

/// 登录态：ailab_session Cookie 持久化在系统 CookieStore，
/// 冷启动 auth.me 静默恢复；任何业务 401 由全局通知置为未登录。
@MainActor
@Observable
final class SessionStore {
    enum State {
        case unknown
        case loggedOut
        case loggedIn(User)
    }

    private(set) var state: State = .unknown

    private let api: API

    init(api: API) {
        self.api = api
    }

    /// 全局 401（非 auth.me 探测）→ RootView.onReceive 调用，回到登录页
    func expire() {
        if case .loggedIn = state {
            state = .loggedOut
        }
    }

    func bootstrap() async {
        do {
            let user = try await api.me()
            state = .loggedIn(user)
        } catch {
            state = .loggedOut
        }
    }

    func login(email: String, password: String) async throws {
        let user = try await api.login(email: email, password: password)
        state = .loggedIn(user)
    }

    func register(email: String, password: String, code: String, name: String?) async throws {
        let user = try await api.register(email: email, password: password, code: code, name: name)
        state = .loggedIn(user)
    }

    func logout() async {
        try? await api.logout()
        HTTPCookieStorage.shared.removeCookies(since: .distantPast)
        state = .loggedOut
    }
}
