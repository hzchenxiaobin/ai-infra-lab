import SwiftUI

// ---------------------------------------------------------------------------
// 复盘笔记（web /notes）：以 markdown 记录每次面试过程（模拟面试复盘 / 真实面经）。
// 列表 → 阅读（Markdown 渲染 + 编辑/删除）→ 编辑器（标题 + 编辑/预览分段）。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class NotesModel {
    var notes: [InterviewNote] = []
    var loading = false
    var errorMessage: String?

    func load() async {
        loading = true
        errorMessage = nil
        defer { loading = false }
        do {
            notes = try await Services.shared.api.noteList()
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}

struct NotesScreen: View {
    @State private var model = NotesModel()
    @State private var creating = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if model.loading && model.notes.isEmpty {
                    LoadingView(text: "加载笔记…")
                } else if let error = model.errorMessage, model.notes.isEmpty {
                    ErrorBoxView(message: error) { Task { await model.load() } }
                } else if model.notes.isEmpty {
                    EmptyBoxView(text: "还没有复盘笔记，点击「写复盘」记录第一次面试")
                } else {
                    VStack(spacing: 8) {
                        ForEach(model.notes) { note in
                            NavigationLink {
                                NoteReaderScreen(note: note, onChange: { Task { await model.load() } })
                            } label: {
                                NoteRowView(note: note)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Color.page)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    creating = true
                } label: {
                    Label("写复盘", systemImage: "square.and.pencil")
                }
                .tint(Color.accent600)
            }
        }
        .sheet(isPresented: $creating) {
            NoteEditorSheet(note: nil) { _, _, _ in Task { await model.load() } }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

private struct NoteRowView: View {
    let note: InterviewNote

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(note.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                Text("更新于 \(Fmt.date(note.updatedAt))")
                    .font(.caption2)
                    .foregroundStyle(Color.faint)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(Color.faint)
        }
        .padding(12)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.divider))
    }
}

// ---------------------------------------------------------------------------
// 笔记阅读：标题 + 创建/更新时间 + Markdown 正文；工具栏编辑 / 删除。
// 编辑保存后原地更新（updatedAt 取本地时间），删除后 pop 回列表；
// 任一变更通过 onChange 通知列表刷新。
// ---------------------------------------------------------------------------

struct NoteReaderScreen: View {
    @State private var note: InterviewNote
    @State private var editing = false
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    let onChange: () -> Void

    init(note: InterviewNote, onChange: @escaping () -> Void) {
        _note = State(initialValue: note)
        self.onChange = onChange
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(note.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.ink)
                    Text("创建于 \(Fmt.date(note.createdAt)) · 更新于 \(Fmt.date(note.updatedAt))")
                        .font(.caption2)
                        .foregroundStyle(Color.faint)
                }
                MarkdownView(text: note.content)
                    .cardStyle(padding: 18)
                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Color.accent400)
                }
            }
            .padding(16)
        }
        .background(Color.page)
        .navigationTitle("复盘笔记")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    editing = true
                } label: {
                    Label("编辑", systemImage: "pencil")
                }
                .tint(Color.accent600)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    if deleting {
                        ProgressView()
                    } else {
                        Label("删除", systemImage: "trash")
                    }
                }
            }
        }
        .sheet(isPresented: $editing) {
            NoteEditorSheet(note: note) { _, title, content in
                note = InterviewNote(
                    id: note.id,
                    title: title,
                    content: content,
                    createdAt: note.createdAt,
                    updatedAt: Date()
                )
                onChange()
            }
        }
        .confirmationDialog(
            "确定删除笔记「\(note.title)」？不可恢复。",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("删除笔记", role: .destructive) {
                Task { await remove() }
            }
        }
    }

    private func remove() async {
        deleting = true
        defer { deleting = false }
        do {
            try await Services.shared.api.noteRemove(id: note.id)
            Haptics.success()
            dismiss()
            onChange()
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}

// ---------------------------------------------------------------------------
// 笔记编辑器（sheet）：标题 + 正文（编辑/预览分段切换）。
// note 为 nil 表示新建；保存成功回传（id, title, content）。
// ---------------------------------------------------------------------------

private let notePlaceholder = """
## 面试背景
- 公司 / 岗位 / 轮次

## 过程
- 聊了什么项目？
- 手撕了哪道题？

## 反思
- 哪里答得不好？
- 下次怎么改进？
"""

struct NoteEditorSheet: View {
    /// nil 表示新建
    let note: InterviewNote?
    let onSaved: (_ id: Int, _ title: String, _ content: String) -> Void

    @State private var title: String
    @State private var content: String
    @State private var preview = false
    @State private var saving = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    init(note: InterviewNote?, onSaved: @escaping (_ id: Int, _ title: String, _ content: String) -> Void) {
        self.note = note
        self.onSaved = onSaved
        _title = State(initialValue: note?.title ?? "")
        _content = State(initialValue: note?.content ?? "")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("标题 *")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        TextField("如：9.17 某厂一面复盘", text: $title)
                            .font(.subheadline)
                            .foregroundStyle(Color.ink)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Color.page, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.line))
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("正文 *（markdown）")
                                .font(.caption)
                                .foregroundStyle(Color.muted)
                            Spacer()
                            Picker("视图", selection: $preview) {
                                Text("编辑").tag(false)
                                Text("预览").tag(true)
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 132)
                        }
                        if preview {
                            Group {
                                if content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                    Text("还没有内容，切回「编辑」开始书写")
                                        .font(.subheadline)
                                        .foregroundStyle(Color.muted)
                                        .frame(maxWidth: .infinity, minHeight: 320, alignment: .center)
                                } else {
                                    MarkdownView(text: content)
                                }
                            }
                            .frame(minHeight: 320, alignment: .topLeading)
                            .padding(12)
                            .background(Color.page, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.line))
                        } else {
                            ZStack(alignment: .topLeading) {
                                TextEditor(text: $content)
                                    .font(.mono(.footnote))
                                    .foregroundStyle(Color.ink)
                                    .scrollContentBackground(.hidden)
                                    .frame(minHeight: 320)
                                    .padding(8)
                                if content.isEmpty {
                                    Text(notePlaceholder)
                                        .font(.mono(.footnote))
                                        .foregroundStyle(Color.faint)
                                        .padding(16)
                                        .allowsHitTesting(false)
                                }
                            }
                            .background(Color.page, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.line))
                        }
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(Color.accent400)
                    }
                }
                .padding(16)
            }
            .background(Color.surface)
            .navigationTitle(note == nil ? "写复盘" : "编辑笔记")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving {
                            ProgressView()
                        } else {
                            Text("保存")
                        }
                    }
                    .disabled(saving)
                }
            }
        }
    }

    private func save() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            errorMessage = "标题不能为空"
            Haptics.warning()
            return
        }
        guard !trimmedContent.isEmpty else {
            errorMessage = "正文不能为空"
            Haptics.warning()
            return
        }
        saving = true
        errorMessage = nil
        defer { saving = false }
        do {
            let id: Int
            if let note {
                try await Services.shared.api.noteUpdate(id: note.id, title: trimmedTitle, content: trimmedContent)
                id = note.id
            } else {
                id = try await Services.shared.api.noteCreate(title: trimmedTitle, content: trimmedContent)
            }
            Haptics.success()
            onSaved(id, trimmedTitle, trimmedContent)
            dismiss()
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}
