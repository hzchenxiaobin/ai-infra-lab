import SwiftUI

// ---------------------------------------------------------------------------
// 题目表单（新增 / 编辑共用）与 JSON 批量导入
// ---------------------------------------------------------------------------

struct QuestionFormSheet: View {
    var editing: BankQuestion?
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var category: Category = .knowledge
    @State private var difficulty: Difficulty = .medium
    @State private var title = ""
    @State private var content = ""
    @State private var followUpsText = ""
    @State private var keyPoints = ""
    @State private var tags = ""
    @State private var source = ""
    @State private var saving = false
    @State private var errorMessage: String?

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !saving
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("方向", selection: $category) {
                        ForEach(Category.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    Picker("难度", selection: $difficulty) {
                        ForEach(Difficulty.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    FormField(label: "标题 *") {
                        TextField("题目标题", text: $title)
                            .font(.subheadline)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("题目内容 *")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        TextEditor(text: $content)
                            .font(.mono(.footnote))
                            .frame(minHeight: 120)
                            .padding(6)
                            .scrollContentBackground(.hidden)
                            .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("预设追问（每行一条）")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        TextEditor(text: $followUpsText)
                            .font(.footnote)
                            .frame(minHeight: 70)
                            .padding(6)
                            .scrollContentBackground(.hidden)
                            .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
                    }

                    FormField(label: "考察要点") {
                        TextField("评分要点（面试官追问参考）", text: $keyPoints)
                            .font(.subheadline)
                    }

                    FormField(label: "标签（逗号分隔）") {
                        TextField("如: cuda,attention", text: $tags)
                            .font(.subheadline)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }

                    FormField(label: "来源") {
                        TextField("如 leetcode/0001", text: $source)
                            .font(.subheadline)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(Color.accent400)
                    }
                }
                .padding(16)
            }
            .background(Color.page)
            .navigationTitle(editing == nil ? "新增题目" : "编辑题目")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("保存") { save() }
                        .fontWeight(.semibold)
                        .disabled(!canSave)
                }
            }
            .onAppear(perform: fillIfEditing)
        }
    }

    private func fillIfEditing() {
        guard let editing, title.isEmpty else { return }
        category = editing.category
        difficulty = editing.difficulty
        title = editing.title
        content = editing.content
        followUpsText = editing.followUps.joined(separator: "\n")
        keyPoints = editing.keyPoints
        tags = editing.tags
        source = editing.source
    }

    private func save() {
        let input = QuestionInput(
            category: category,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            content: content,
            difficulty: difficulty,
            tags: tags,
            followUps: followUpsText
                .components(separatedBy: "\n")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty },
            keyPoints: keyPoints,
            source: source
        )
        saving = true
        errorMessage = nil
        Task {
            defer { saving = false }
            do {
                if let editing {
                    try await Services.shared.api.questionUpdate(id: editing.id, data: input)
                } else {
                    _ = try await Services.shared.api.questionCreate(input)
                }
                Haptics.success()
                onSaved()
            } catch let error as TRPCError {
                errorMessage = error.message
            } catch {
                errorMessage = "网络异常，请稍后重试"
            }
        }
    }
}

private struct FormField<Content: View>: View {
    let label: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.muted)
            content
                .padding(.horizontal, 10)
                .frame(height: 40)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.line))
        }
    }
}

// ---------------------------------------------------------------------------
// JSON 批量导入
// ---------------------------------------------------------------------------

struct ImportSheet: View {
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var jsonText = ""
    @State private var importing = false
    @State private var errorMessage: String?

    private struct RawItem: Decodable {
        let category: String
        let title: String
        let content: String
        let difficulty: String
        let tags: String?
        let followUps: [String]?
        let keyPoints: String?
        let source: String?
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("粘贴 JSON 数组，每条包含 category（leetcode/cuda/knowledge）、difficulty（easy/medium/hard）、title、content，可选 followUps / keyPoints / tags / source")
                    .font(.caption)
                    .foregroundStyle(Color.muted)

                TextEditor(text: $jsonText)
                    .font(.mono(.footnote))
                    .frame(maxHeight: .infinity)
                    .padding(8)
                    .scrollContentBackground(.hidden)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.line))

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Color.accent400)
                }

                Button {
                    runImport()
                } label: {
                    Group {
                        if importing {
                            ProgressView().tint(Color.ink)
                        } else {
                            Text("导入").fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.accent600)
                .disabled(jsonText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || importing)
            }
            .padding(16)
            .background(Color.page)
            .navigationTitle("批量导入")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") { dismiss() }
                }
            }
        }
    }

    private func runImport() {
        errorMessage = nil
        importing = true
        Task {
            defer { importing = false }
            do {
                let data = Data(jsonText.utf8)
                let rawItems = try JSONDecoder().decode([RawItem].self, from: data)
                var items: [QuestionInput] = []
                for (index, raw) in rawItems.enumerated() {
                    guard let category = Category(rawValue: raw.category) else {
                        throw TRPCError(code: "VALIDATE", message: "第 \(index + 1) 条 category 非法：\(raw.category)")
                    }
                    guard let difficulty = Difficulty(rawValue: raw.difficulty) else {
                        throw TRPCError(code: "VALIDATE", message: "第 \(index + 1) 条 difficulty 非法：\(raw.difficulty)")
                    }
                    guard !raw.title.trimmingCharacters(in: .whitespaces).isEmpty,
                          !raw.content.trimmingCharacters(in: .whitespaces).isEmpty else {
                        throw TRPCError(code: "VALIDATE", message: "第 \(index + 1) 条 title/content 不能为空")
                    }
                    items.append(QuestionInput(
                        category: category,
                        title: raw.title,
                        content: raw.content,
                        difficulty: difficulty,
                        tags: raw.tags ?? "",
                        followUps: raw.followUps ?? [],
                        keyPoints: raw.keyPoints ?? "",
                        source: raw.source ?? ""
                    ))
                }
                let imported = try await Services.shared.api.questionBulkImport(items)
                onDone("成功导入 \(imported) 题")
            } catch let error as TRPCError {
                errorMessage = error.message
            } catch is DecodingError {
                errorMessage = "JSON 解析失败：需要对象数组，且 category/difficulty/title/content 必填"
            } catch {
                errorMessage = "网络异常，请稍后重试"
            }
        }
    }
}
