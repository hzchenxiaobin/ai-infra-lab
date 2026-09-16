import SwiftUI

/// 面试消息气泡：interviewer 左侧卡片（Markdown）/ candidate 右侧等宽深色卡 / system 居中灰字
struct MessageBubble: View {
    let role: MessageRole
    let content: String
    /// 紧凑模式（报告内嵌原问题展示）
    var compact = false

    var body: some View {
        switch role {
        case .interviewer:
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("面试官")
                        .font(.caption2)
                        .foregroundStyle(Color.faint)
                    MarkdownView(text: content)
                }
                .padding(compact ? 10 : 12)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line, lineWidth: 1)
                )
                .frame(maxWidth: 640, alignment: .leading)
                Spacer(minLength: 0)
            }
        case .candidate:
            HStack(alignment: .top, spacing: 8) {
                Spacer(minLength: 0)
                ScrollView(.horizontal, showsIndicators: false) {
                    Text(content)
                        .font(.mono(compact ? .footnote : .subheadline))
                        .foregroundStyle(Color.ink)
                        .textSelection(.enabled)
                }
                .padding(compact ? 10 : 12)
                .background(Color.accent100, in: RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12).strokeBorder(Color.accent200.opacity(0.45), lineWidth: 1)
                )
                .frame(maxWidth: 640, alignment: .trailing)
            }
        case .system:
            Text(content)
                .font(.caption)
                .foregroundStyle(Color.muted)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .padding(.vertical, 4)
        }
    }
}

/// 「面试官正在输入…」打字指示气泡
struct TypingBubble: View {
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    TypingDot(delay: Double(index) * 0.18)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line))
            Text("面试官正在输入…")
                .font(.caption)
                .foregroundStyle(Color.faint)
            Spacer(minLength: 0)
        }
    }
}

private struct TypingDot: View {
    let delay: Double
    @State private var visible = false

    var body: some View {
        Circle()
            .fill(Color.muted)
            .frame(width: 5, height: 5)
            .opacity(visible ? 1 : 0.25)
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(0.5 + delay))
                    visible.toggle()
                    try? await Task.sleep(for: .seconds(0.25))
                    visible.toggle()
                }
            }
    }
}
