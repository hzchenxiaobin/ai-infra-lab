import SwiftUI

// ---------------------------------------------------------------------------
// 题单列表（web /problems/lists）与题单详情（/problems/lists/:slug）
// ---------------------------------------------------------------------------

struct ProblemListsScreen: View {
    @State private var lists: [ProblemListMeta]?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let lists {
                if lists.isEmpty {
                    EmptyBoxView(text: "暂无题单")
                } else {
                    ScrollView {
                        VStack(spacing: 10) {
                            ForEach(lists) { list in
                                NavigationLink(value: ProblemsRoute.problemList(list.slug)) {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(list.title)
                                                .font(.subheadline.weight(.medium))
                                                .foregroundStyle(Color.ink)
                                            Text(list.slug)
                                                .font(.mono(.caption))
                                                .foregroundStyle(Color.faint)
                                        }
                                        Spacer()
                                        Text("\(list.problemCount) 题")
                                            .font(.caption)
                                            .foregroundStyle(Color.muted)
                                        Image(systemName: "chevron.right")
                                            .font(.caption)
                                            .foregroundStyle(Color.faint)
                                    }
                                    .padding(14)
                                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
                                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.divider))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(16)
                    }
                    .refreshable { await load() }
                }
            } else if let errorMessage {
                ErrorBoxView(message: errorMessage) { Task { await load() } }
                    .padding(24)
            } else {
                LoadingView(text: "加载题单…")
            }
        }
        .background(Color.page)
        .navigationTitle("题单")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            lists = try await Services.shared.api.problemLists()
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}

struct ProblemListDetailScreen: View {
    let slug: String

    @State private var detail: ProblemListDetail?
    @State private var errorMessage: String?

    private var acCount: Int {
        detail?.items.filter(\.ac).count ?? 0
    }

    var body: some View {
        Group {
            if let detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(detail.list.title)
                                .font(.title3.weight(.bold))
                            if !detail.list.url.isEmpty {
                                Button {
                                    Services.shared.links.open(detail.list.url, title: detail.list.title)
                                } label: {
                                    Label("题单编排说明", systemImage: "book")
                                        .font(.caption)
                                        .foregroundStyle(Color.accent400)
                                }
                            }
                            HStack {
                                Text("共 \(detail.list.problemCount) 道题 · 已 AC \(acCount)（\(detail.list.problemCount > 0 ? acCount * 100 / detail.list.problemCount : 0)%）")
                                    .font(.caption)
                                    .foregroundStyle(Color.muted)
                                Spacer()
                            }
                            ProgressBarView(
                                value: detail.list.problemCount > 0 ? Double(acCount) / Double(detail.list.problemCount) : 0,
                                height: 6
                            )
                        }
                        .cardStyle()

                        VStack(spacing: 0) {
                            ForEach(detail.items) { item in
                                ProblemRow(problem: item, showTierBadge: false)
                                Divider().overlay(Color.divider)
                            }
                        }
                        .background(Color.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.divider))

                        if detail.items.count < detail.list.problemCount {
                            Text("另有 \(detail.list.problemCount - detail.items.count) 道成员题缺少元数据，已自动跳过")
                                .font(.caption2)
                                .foregroundStyle(Color.faint)
                        }
                    }
                    .padding(16)
                }
                .refreshable { await load() }
            } else if let errorMessage {
                ErrorBoxView(message: errorMessage) { Task { await load() } }
                    .padding(24)
            } else {
                LoadingView(text: "加载题单…")
            }
        }
        .background(Color.page)
        .navigationTitle(slug)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            detail = try await Services.shared.api.problemGetList(slug: slug)
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}
