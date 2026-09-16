import SwiftUI

// ---------------------------------------------------------------------------
// 全站搜索（web /search）：300ms 防抖 + 类型筛选 + 结果外链。
// ---------------------------------------------------------------------------

@MainActor
@Observable
final class SearchModel {
    var query = ""
    var type: ContentType?
    var result: SearchResult?
    var searching = false
    var searched = false
    var errorMessage: String?

    private var searchTask: Task<Void, Never>?

    func onQueryChange() {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            result = nil
            searched = false
            return
        }
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await search()
        }
    }

    func onTypeChange() {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        Task { await search() }
    }

    func search() async {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        searching = true
        errorMessage = nil
        defer { searching = false }
        do {
            result = try await Services.shared.api.search(q: trimmed, type: type)
            searched = true
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}

struct SearchScreen: View {
    @State private var model = SearchModel()
    @FocusState private var queryFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "magnifyingglass")
                            .font(.footnote)
                            .foregroundStyle(Color.faint)
                        TextField("搜索学习内容、题解、面试题…", text: $model.query)
                            .font(.subheadline)
                            .focused($queryFocused)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .submitLabel(.search)
                            .onChange(of: model.query) { model.onQueryChange() }
                            .onSubmit { Task { await model.search() } }
                        if !model.query.isEmpty {
                            Button {
                                model.query = ""
                                model.result = nil
                                model.searched = false
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.footnote)
                                    .foregroundStyle(Color.faint)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 42)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(queryFocused ? Color.accent600 : Color.line))

                    Picker("类型", selection: Binding(
                        get: { model.type },
                        set: {
                            model.type = $0
                            model.onTypeChange()
                        }
                    )) {
                        Text("全部").tag(ContentType?.none)
                        ForEach(ContentType.allCases) { Text($0.label).tag(ContentType?.some($0)) }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 10)

                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        if model.searching && model.result == nil {
                            LoadingView(text: "搜索中…")
                        } else if let error = model.errorMessage {
                            ErrorBoxView(message: error) { Task { await model.search() } }
                        } else if let result = model.result {
                            if result.items.isEmpty {
                                EmptyBoxView(text: "没有找到「\(model.query)」相关内容")
                            } else {
                                Text("共 \(result.total) 条结果")
                                    .font(.caption)
                                    .foregroundStyle(Color.muted)
                                    .padding(.horizontal, 16)
                                ForEach(result.items) { item in
                                    searchRow(item)
                                }
                            }
                        } else {
                            VStack(spacing: 10) {
                                Image(systemName: "magnifyingglass")
                                    .font(.largeTitle)
                                    .foregroundStyle(Color.faint)
                                Text("统一搜索学习内容、题解与论文")
                                    .font(.subheadline)
                                    .foregroundStyle(Color.muted)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.top, 96)
                        }
                    }
                    .padding(.vertical, 10)
                }
            }
            .background(Color.page)
            .navigationTitle("搜索")
            .onAppear { queryFocused = true }
        }
    }

    private func searchRow(_ item: SearchItem) -> some View {
        Button {
            Services.shared.links.open(item.url, title: item.title)
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    ChipView(text: item.type.label, accent: true)
                    Text(item.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption2)
                        .foregroundStyle(Color.faint)
                }
                if !item.knowledgePoints.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(item.knowledgePoints.prefix(3), id: \.self) { ChipView(text: $0, accent: true) }
                    }
                }
                if !item.summary.isEmpty {
                    Text(item.summary)
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                        .lineLimit(2)
                }
            }
            .padding(12)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.divider))
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
    }
}

// ---------------------------------------------------------------------------
// 设置（服务器地址，本地开发用）
// ---------------------------------------------------------------------------

struct SettingsScreen: View {
    @State private var baseURLText = AppConfig.baseURL.absoluteString
    @State private var saved = false

    var body: some View {
        Form {
            Section {
                TextField("服务器地址", text: $baseURLText)
                    .font(.mono(.footnote))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                Button("保存并生效") {
                    if let url = URL(string: baseURLText.trimmingCharacters(in: .whitespaces)), url.scheme != nil {
                        AppConfig.setBaseURL(url)
                        saved = true
                        Haptics.success()
                    }
                }
                .disabled(baseURLText.trimmingCharacters(in: .whitespaces) == AppConfig.baseURL.absoluteString)
                if saved {
                    Text("已保存，下一次请求即生效")
                        .font(.caption)
                        .foregroundStyle(Color(hex: 0x3fb950))
                }
            } header: {
                Text("服务器")
            } footer: {
                Text("默认指向生产环境 http://47.93.85.170:8080；本地开发可改为 http://localhost:5173 代理地址")
            }

            Section {
                LabeledContent("产品", value: "AIInfra Lab iOS")
                LabeledContent("后端", value: "tRPC over HTTP · superjson · Cookie 会话")
            } header: {
                Text("关于")
            }
        }
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            baseURLText = AppConfig.baseURL.absoluteString
            saved = false
        }
    }
}
