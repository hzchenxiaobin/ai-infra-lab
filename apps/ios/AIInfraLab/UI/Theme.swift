import SwiftUI

/// 设计令牌（对齐 apps/web/src/index.css @theme：暗夜模式 + 单一红色强调）
extension Color {
    static let page = Color(hex: 0x0e1116)
    static let surface = Color(hex: 0x161b22)
    static let ink = Color(hex: 0xe6e9ef)
    static let muted = Color(hex: 0x949ead)
    static let line = Color(hex: 0x29313d)
    static let divider = Color(hex: 0x20262f)
    static let faint = Color(hex: 0x454e5c)

    static let accent50 = Color(hex: 0x251310)
    static let accent100 = Color(hex: 0x331a14)
    static let accent200 = Color(hex: 0xb04028)
    static let accent300 = Color(hex: 0xff9d80)
    static let accent400 = Color(hex: 0xff7a52)
    static let accent500 = Color(hex: 0xf4552e)
    static let accent600 = Color(hex: 0xf2502b)
    static let accent700 = Color(hex: 0xff6240)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue: Double(hex & 0xff) / 255,
            opacity: alpha
        )
    }
}

extension Font {
    static func mono(_ style: Font.TextStyle = .body) -> Font {
        .system(style, design: .monospaced)
    }
}
