import SwiftUI

// ---------------------------------------------------------------------------
// 通用组件族（对齐 web ui.tsx：Card / Badge / Chip / Pill / ProgressBar / 状态盒）
// ---------------------------------------------------------------------------

struct CardBackground: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color.divider, lineWidth: 1)
            )
    }
}

extension View {
    func cardStyle(padding: CGFloat = 16) -> some View {
        modifier(CardBackground(padding: padding))
    }
}

/// 区块标题：红色竖条 + 标题 + 描述
struct SectionHeaderView: View {
    let title: String
    var subtitle: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            RoundedRectangle(cornerRadius: 1)
                .fill(Color.accent600)
                .frame(width: 4, height: 16)
            Text(title)
                .font(.system(.headline))
            Spacer()
            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                    .lineLimit(1)
            }
        }
    }
}

/// 评级徽标（A–D，A/B 绿 C/D 黄红）
struct GradeBadge: View {
    let grade: String

    private var color: Color {
        switch grade {
        case "A", "B": return Color(hex: 0x3fb950)
        case "C": return Color(hex: 0xd29922)
        default: return Color.accent600
        }
    }

    var body: some View {
        Text(grade)
            .font(.system(.caption2, design: .monospaced).weight(.bold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 5))
    }
}

/// 难度徽标
struct DifficultyBadge: View {
    let difficulty: Difficulty

    private var color: Color {
        switch difficulty {
        case .easy: return Color(hex: 0x3fb950)
        case .medium: return Color(hex: 0xd29922)
        case .hard: return Color.accent600
        }
    }

    var body: some View {
        Text(difficulty.label)
            .font(.caption2.weight(.medium))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 5))
    }
}

/// 标签 / 知识点 chip
struct ChipView: View {
    let text: String
    var accent = false

    var body: some View {
        Text(text)
            .font(.caption2)
            .lineLimit(1)
            .foregroundStyle(accent ? Color.accent300 : Color.muted)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(accent ? Color.accent50 : Color.page, in: RoundedRectangle(cornerRadius: 6))
    }
}

/// 状态胶囊：active 进行中（呼吸点）/ done 已完成 / ac 已通过
struct StatusPill: View {
    enum Kind { case active, done, ac }

    let kind: Kind
    var text: String

    init(_ kind: Kind, _ text: String) {
        self.kind = kind
        self.text = text
    }

    var body: some View {
        HStack(spacing: 5) {
            if kind == .active {
                Circle()
                    .fill(Color.accent600)
                    .frame(width: 5, height: 5)
                    .opacity(0.55)
            }
            Text(text)
                .font(.caption2.weight(kind == .ac ? .medium : .regular))
        }
        .foregroundStyle(kind == .done ? Color.muted : Color.accent300)
        .padding(.horizontal, 9)
        .padding(.vertical, 3)
        .background(
            kind == .done ? AnyShapeStyle(Color.surface) : AnyShapeStyle(Color.accent50),
            in: Capsule()
        )
        .overlay(
            Capsule().strokeBorder(kind == .done ? Color.line : .clear, lineWidth: 1)
        )
    }
}

struct ProgressBarView: View {
    let value: Double
    var tint: Color = .accent600
    var height: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.divider)
                Capsule()
                    .fill(tint)
                    .frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: height)
    }
}

struct LoadingView: View {
    var text: String = "加载中…"

    var body: some View {
        VStack(spacing: 12) {
            ProgressView().tint(Color.muted)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Color.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }
}

struct ErrorBoxView: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(Color.accent600)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.ink)
                .multilineTextAlignment(.center)
            if let retry {
                Button("重试", action: retry)
                    .font(.subheadline.weight(.medium))
                    .buttonStyle(.bordered)
                    .tint(Color.accent600)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(Color.accent50, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12).strokeBorder(Color.accent200.opacity(0.4))
        )
    }
}

struct EmptyBoxView: View {
    let text: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.title2)
                .foregroundStyle(Color.faint)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Color.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
    }
}

/// 大统计数字
struct StatBlock: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(.title2, design: .rounded).weight(.bold))
                .foregroundStyle(Color.ink)
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 筛选菜单按钮（下拉单选；options 为 展示文案 → 值，value=nil 表示"全部"）
struct FilterMenu: View {
    struct Option {
        let label: String
        let value: String?

        init(_ label: String, _ value: String? = nil) {
            self.label = label
            self.value = value
        }
    }

    let title: String
    @Binding var selection: String?
    let options: [Option]

    private var currentLabel: String? {
        options.first { $0.value == selection }?.label
    }

    var body: some View {
        Menu {
            ForEach(options, id: \.label) { option in
                Button {
                    selection = option.value
                } label: {
                    if selection == option.value {
                        Label(option.label, systemImage: "checkmark")
                    } else {
                        Text(option.label)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                Text(currentLabel ?? title)
                    .lineLimit(1)
            }
            .font(.footnote)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(selection == nil ? Color.surface : Color.accent50, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.line))
            .foregroundStyle(selection == nil ? Color.muted : Color.accent300)
        }
    }
}
