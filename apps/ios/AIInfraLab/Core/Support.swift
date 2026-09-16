import Foundation
import UIKit

/// 轮询引擎：评测结果 1.5s / 报告进度 2s，任务取消即停止
enum Poller {
    @discardableResult
    static func loop<T>(
        interval: Duration,
        fetch: @escaping () async throws -> T,
        isTerminal: @escaping (T) -> Bool,
        onUpdate: @MainActor @escaping (T) -> Void
    ) async throws -> T {
        while true {
            let value = try await fetch()
            await onUpdate(value)
            if isTerminal(value) { return value }
            try await Task.sleep(for: interval)
        }
    }
}

enum Haptics {
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}

enum Fmt {
    static let shortDateTime: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MM-dd HH:mm"
        return f
    }()

    static let monthDay: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MM-dd"
        return f
    }()

    static func date(_ date: Date?) -> String {
        guard let date else { return "-" }
        return shortDateTime.string(from: date)
    }

    static func percent(_ value: Double) -> String {
        "\(Int((value * 100).rounded()))%"
    }

    static func masteryPercent(_ value: Double) -> String {
        "\(Int((value * 100).rounded()))%"
    }
}
