import SwiftUI

// ---------------------------------------------------------------------------
// 周赛列表（web /problems/contest）与单场周赛（/problems/contest/:session）
// ---------------------------------------------------------------------------

struct ContestListScreen: View {
    @State private var sessions: [ContestSession]?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let sessions {
                if sessions.isEmpty {
                    EmptyBoxView(text: "暂无周赛数据")
                } else {
                    ScrollView {
                        VStack(spacing: 10) {
                            ForEach(sessions) { session in
                                NavigationLink(value: ProblemsRoute.contest(session.session)) {
                                    HStack {
                                        Text("第 \(session.session) 场")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(Color.ink)
                                        Text("Q1–Q\(session.problemCount)")
                                            .font(.mono(.caption))
                                            .foregroundStyle(Color.faint)
                                        Spacer()
                                        Text("\(session.problemCount) 题")
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
                LoadingView(text: "加载周赛…")
            }
        }
        .background(Color.page)
        .navigationTitle("周赛")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            sessions = try await Services.shared.api.contestSessions()
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}

struct ContestSessionScreen: View {
    let session: Int

    @State private var detail: ContestDetail?
    @State private var errorMessage: String?

    private var acCount: Int {
        detail?.items.filter(\.ac).count ?? 0
    }

    var body: some View {
        Group {
            if let detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("第 \(session) 场 · Q1–Q\(detail.items.count)")
                                .font(.headline)
                            Spacer()
                            StatusPill(.ac, "AC \(acCount)/\(detail.items.count)")
                        }
                        .cardStyle(padding: 14)

                        VStack(spacing: 0) {
                            ForEach(Array(detail.items.enumerated()), id: \.element.id) { index, item in
                                ProblemRow(problem: item, prefix: "Q\(index + 1)", showTierBadge: false)
                                Divider().overlay(Color.divider)
                            }
                        }
                        .background(Color.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.divider))
                    }
                    .padding(16)
                }
                .refreshable { await load() }
            } else if let errorMessage {
                ErrorBoxView(message: errorMessage) { Task { await load() } }
                    .padding(24)
            } else {
                LoadingView(text: "加载周赛题目…")
            }
        }
        .background(Color.page)
        .navigationTitle("第 \(session) 场")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            detail = try await Services.shared.api.contestProblems(session: session)
        } catch let error as TRPCError {
            errorMessage = error.message
        } catch {
            errorMessage = "网络异常，请稍后重试"
        }
    }
}
