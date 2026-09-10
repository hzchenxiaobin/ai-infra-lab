import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@ailab/server";
import superjson from "superjson";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // dev/web.md §3：认证后的 401 全局跳 /login
    onError: (error) => {
      if ((error as { data?: { code?: string } }).data?.code === "UNAUTHORIZED") {
        window.location.href = "/login";
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if ((error as { data?: { code?: string } }).data?.code === "UNAUTHORIZED") {
        window.location.href = "/login";
      }
    },
  }),
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      transformer: superjson,
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

// ---------------------------------------------------------------------------
// 常用返回类型（从 trpcClient 推导，避免引入 @trpc/server）
// ---------------------------------------------------------------------------

export type QuestionListData = Awaited<ReturnType<typeof trpcClient.question.list.query>>;
export type QuestionListItem = QuestionListData["items"][number];
export type SessionListItem = Awaited<ReturnType<typeof trpcClient.interview.list.query>>[number];
export type InterviewGetData = Awaited<ReturnType<typeof trpcClient.interview.get.query>>;
export type InterviewStatsData = Awaited<ReturnType<typeof trpcClient.interview.stats.query>>;
export type ProblemListData = Awaited<ReturnType<typeof trpcClient.problem.list.query>>;
export type ProblemFacetsData = Awaited<ReturnType<typeof trpcClient.problem.facets.query>>;
export type LearnOverviewData = Awaited<ReturnType<typeof trpcClient.learn.overview.query>>;
export type ProgressOverviewData = Awaited<ReturnType<typeof trpcClient.progress.overview.query>>;
export type QuotaMeData = Awaited<ReturnType<typeof trpcClient.quota.me.query>>;
