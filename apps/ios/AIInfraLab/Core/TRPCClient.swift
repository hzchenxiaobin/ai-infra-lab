import Foundation

/// tRPC over HTTP 客户端（协议已对线上实测校准）：
/// - query：GET {base}/trpc/{path}?input=<urlencoded {"json": input}>
/// - mutation：POST {base}/trpc/{path}，body 为 {"json": input}
/// - 成功：{"result":{"data":{"json": ...}}}；错误：{"error":{"json":{"message","data":{"code"}}}}
/// - Date 以 ISO 字符串在线上（superjson meta 仅类型标记，可忽略）
/// - 会话由 ailab_session HttpOnly Cookie 维持，URLSession CookieStorage 自动携带与续期
struct TRPCError: LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { message }
    var isUnauthorized: Bool { code == "UNAUTHORIZED" }
}

extension Notification.Name {
    static let sessionExpired = Notification.Name("ailab.sessionExpired")
}

enum TRPCMethod {
    case query
    case mutation
}

final class TRPCClient: @unchecked Sendable {
    private let urlSession: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = 360
        config.timeoutIntervalForResource = 720
        urlSession = URLSession(configuration: config)
    }

    /// 无输入过程
    func call<Output: Decodable>(
        _ path: String,
        method: TRPCMethod = .query,
        retryOnNetworkError: Bool = true
    ) async throws -> Output {
        try await run(path: path, method: method, envelope: #"{"json":null}"#, retry: retryOnNetworkError)
    }

    func call<Input: Encodable, Output: Decodable>(
        _ path: String,
        input: Input,
        method: TRPCMethod = .query,
        retryOnNetworkError: Bool = true
    ) async throws -> Output {
        let envelope = try Self.encodeEnvelope(input)
        return try await run(path: path, method: method, envelope: envelope, retry: retryOnNetworkError)
    }

    private func run<Response: Decodable>(
        path: String, method: TRPCMethod, envelope: String, retry: Bool
    ) async throws -> Response {
        do {
            return try await perform(path: path, method: method, envelope: envelope)
        } catch let error as URLError where error.errorCode != NSURLErrorCancelled {
            guard retry else { throw error }
            try? await Task.sleep(for: .milliseconds(600))
            return try await perform(path: path, method: method, envelope: envelope)
        }
    }

    private func perform<Response: Decodable>(
        path: String, method: TRPCMethod, envelope: String
    ) async throws -> Response {
        let base = AppConfig.baseURL.appendingPathComponent("trpc/\(path)")
        let request: URLRequest
        switch method {
        case .query:
            var components = URLComponents(url: base, resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "input", value: envelope)]
            request = URLRequest(url: components.url!)
        case .mutation:
            var req = URLRequest(url: base)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = Data(envelope.utf8)
            request = req
        }

        let (data, response) = try await urlSession.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        if let err = try? JSONDecoder.flexible.decode(TRPCErrorEnvelope.self, from: data),
           let message = err.message {
            let code = err.code ?? "UNKNOWN"
            if code == "UNAUTHORIZED", err.path != "auth.me" {
                NotificationCenter.default.post(name: .sessionExpired, object: nil)
            }
            throw TRPCError(code: code, message: message)
        }
        guard (200..<300).contains(status) else {
            throw TRPCError(code: "HTTP_\(status)", message: "服务异常（HTTP \(status)）")
        }

        do {
            return try JSONDecoder.flexible.decode(TRPCEnvelope<Response>.self, from: data).result.data.json
        } catch {
            throw TRPCError(code: "DECODE", message: "响应解析失败：\(error.localizedDescription)")
        }
    }

    /// input → superjson 信封字符串 {"json": <input>}
    private static func encodeEnvelope<Input: Encodable>(_ input: Input) throws -> String {
        let payload = try JSONEncoder().encode(input)
        let object = try JSONSerialization.jsonObject(with: payload)
        let body = try JSONSerialization.data(withJSONObject: ["json": object])
        return String(decoding: body, as: UTF8.self)
    }
}

private struct TRPCErrorEnvelope: Decodable {
    struct ErrorData: Decodable {
        let code: String?
        let httpStatus: Int?
        let path: String?
    }

    struct Inner: Decodable {
        let message: String?
        let data: ErrorData?
    }

    /// superjson 包装（error.json）与裸形态（error.message）双兼容
    struct ErrBox: Decodable {
        let json: Inner?
        let message: String?
        let data: ErrorData?
    }

    let error: ErrBox

    var message: String? { error.json?.message ?? error.message }
    var code: String? { error.json?.data?.code ?? error.data?.code }
    var path: String? { error.json?.data?.path ?? error.data?.path }
}

private struct TRPCEnvelope<T: Decodable>: Decodable {
    struct ResultBox: Decodable {
        struct DataBox: Decodable { let json: T }
        let data: DataBox
    }
    let result: ResultBox
}

extension JSONDecoder {
    /// superjson 的 Date 走 ISO 字符串（毫秒/无毫秒都兼容）
    static let flexible: JSONDecoder = {
        let decoder = JSONDecoder()
        let withFrac = ISO8601DateFormatter()
        withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        decoder.dateDecodingStrategy = .custom { d in
            let container = try d.singleValueContainer()
            let s = try container.decode(String.self)
            if let date = withFrac.date(from: s) ?? plain.date(from: s) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "非法日期：\(s)")
        }
        return decoder
    }()
}
