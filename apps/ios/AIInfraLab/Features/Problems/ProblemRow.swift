import SwiftUI

// ---------------------------------------------------------------------------
// 题目行（题库 / 题单 / 周赛共用）：标题外链 docs、入口（站内评测 / leetgpu）、
// 三态掌握切换（progress.mark）、行内备注（progress.setNote）。
// ---------------------------------------------------------------------------

struct ProblemRow: View {
    let problem: ProblemListItem
    /// 序号徽标文案（周赛 Q1 等），nil 时显示 #number
    var prefix: String?
    /// leetgpu 题 AC 提示文案
    var showTierBadge = true

    @State private var editingNote = false
    @State private var noteDraft = ""
    @State private var marking = false
    @State private var savingNote = false
    @State private var rowError: String?

    private let progressStates: [(value: String, label: String)] = [
        ("unseen", "没写过"),
        ("seen", "需复习"),
        ("ac", "已完全掌握"),
    ]

    private var currentStatusValue: String {
        problem.progressStatus == .mastered ? "ac" : problem.progressStatus.rawValue
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if let prefix {
                            Text(prefix)
                                .font(.mono(.caption2).weight(.medium))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.ink, in: RoundedRectangle(cornerRadius: 5))
                                .foregroundStyle(Color.page)
                        } else if problem.number > 0 {
                            Text("#\(problem.number)")
                                .font(.mono(.caption2))
                                .foregroundStyle(Color.faint)
                        }
                        Button {
                            Services.shared.links.open(problem.url, title: problem.title)
                        } label: {
                            Text(problem.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.ink)
                                .multilineTextAlignment(.leading)
                                .lineLimit(2)
                        }
                        DifficultyBadge(difficulty: problem.difficulty)
                        if showTierBadge, problem.tier == "high" {
                            Text("高频")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(Color.accent600)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(Color.accent50, in: Capsule())
                        }
                        if showTierBadge, problem.tier == "mid" {
                            ChipView(text: "中频")
                        }
                    }

                    HStack(spacing: 8) {
                        Text(problem.id)
                            .font(.mono(.caption2))
                            .foregroundStyle(Color.faint)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        if problem.judgeType == .internal {
                            NavigationLink(value: ProblemsRoute.judge(problem.id)) {
                                Text("站内评测 →")
                                    .font(.caption2)
                                    .foregroundStyle(Color.accent400)
                            }
                        }
                        if problem.judgeType == .leetgpuCom, !problem.externalUrl.isEmpty {
                            Button {
                                Services.shared.links.open(problem.externalUrl, title: problem.title)
                            } label: {
                                Text("leetgpu 评测 ↗")
                                    .font(.caption2)
                                    .foregroundStyle(Color.accent400)
                            }
                        }
                        Button {
                            if editingNote {
                                editingNote = false
                            } else {
                                noteDraft = problem.note ?? ""
                                editingNote = true
                            }
                        } label: {
                            HStack(spacing: 3) {
                                Text("备注")
                                if problem.note != nil {
                                    Circle().fill(Color.accent600).frame(width: 4, height: 4)
                                }
                            }
                            .font(.caption2)
                            .foregroundStyle(Color.muted)
                        }
                    }

                    if !problem.tags.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(problem.tags.prefix(3), id: \.self) { ChipView(text: $0) }
                        }
                    }
                }

                Spacer(minLength: 8)

                HStack(spacing: 4) {
                    ForEach(progressStates, id: \.value) { state in
                        let active = currentStatusValue == state.value
                        Button {
                            mark(state.value)
                        } label: {
                            Text(state.label)
                                .font(.system(size: 10))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(
                                    active ? AnyShapeStyle(Color.accent600) : AnyShapeStyle(Color.surface),
                                    in: Capsule()
                                )
                                .foregroundStyle(active ? Color.ink : Color.muted)
                        }
                        .buttonStyle(.plain)
                        .disabled(marking || active)
                    }
                }
            }

            if editingNote {
                VStack(alignment: .leading, spacing: 8) {
                    TextEditor(text: $noteDraft)
                        .font(.footnote)
                        .frame(minHeight: 66)
                        .padding(6)
                        .scrollContentBackground(.hidden)
                        .background(Color.page, in: RoundedRectangle(cornerRadius: 8))
                    HStack(spacing: 10) {
                        Button {
                            saveNote()
                        } label: {
                            if savingNote {
                                ProgressView().tint(Color.ink)
                            } else {
                                Text("保存").font(.footnote.weight(.medium))
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.accent600)
                        .disabled(savingNote)

                        Button("取消") { editingNote = false }
                            .font(.footnote)
                            .foregroundStyle(Color.muted)

                        if let rowError {
                            Text(rowError)
                                .font(.caption2)
                                .foregroundStyle(Color.accent400)
                        }
                    }
                }
            } else if let note = problem.note {
                Button {
                    noteDraft = note
                    editingNote = true
                } label: {
                    Text(note)
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.page, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func mark(_ value: String) {
        guard let status = ProgressStatus(rawValue: value), !marking else { return }
        marking = true
        rowError = nil
        Task {
            defer { marking = false }
            do {
                try await Services.shared.api.progressMark(contentId: problem.id, status: status)
                Haptics.success()
                NotificationCenter.default.post(name: .progressChanged, object: nil)
            } catch {
                rowError = "标记失败"
            }
        }
    }

    private func saveNote() {
        guard !savingNote else { return }
        savingNote = true
        rowError = nil
        Task {
            defer { savingNote = false }
            do {
                try await Services.shared.api.progressSetNote(contentId: problem.id, note: noteDraft)
                editingNote = false
                NotificationCenter.default.post(name: .progressChanged, object: nil)
            } catch {
                rowError = "保存失败"
            }
        }
    }
}
