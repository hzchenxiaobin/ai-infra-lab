import Foundation

/// 全局配置：服务器地址（默认生产入口，可用 UserDefaults 覆盖以便本地开发）
enum AppConfig {
    static let defaultBase = "http://47.93.85.170:8080"
    private static let baseURLKey = "ailab.baseURL"

    static var baseURL: URL {
        if let s = UserDefaults.standard.string(forKey: baseURLKey), let u = URL(string: s), u.scheme != nil {
            return u
        }
        return URL(string: defaultBase)!
    }

    static func setBaseURL(_ url: URL) {
        UserDefaults.standard.set(url.absoluteString, forKey: baseURLKey)
    }

    /// 相对路径（docs 站）→ 完整 URL；完整 URL 原样返回
    static func resolve(_ urlString: String) -> URL? {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            return URL(string: trimmed)
        }
        return URL(string: trimmed, relativeTo: baseURL)?.absoluteURL
    }
}
