import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { CATEGORY_LABELS, type Category } from "@ailab/contracts";
import { queryClient, trpc, type InterviewGetData } from "../lib/trpc";
import { Button, Card, ErrorBox, Loading, PageHeader, SegmentedControl } from "../components/ui";
import { ReportBody } from "../components/ReportBody";
import { MessageBubble } from "../components/MessageBubble";
import { durationMinutes, formatDateTime, gradeTextColor } from "../lib/format";

type ReportProgress = InterviewGetData["reportProgress"];

const PROGRESS_STEPS = ["评估对话", "生成报告"] as const;
const PROGRESS_TEXT: Record<string, string> = {
  pending: "报告排队生成中，请稍候…",
  evaluating: "正在评估你的回答…（LLM 推理，可能需要数十秒）",
  rendering: "正在生成报告…",
};

/** 报告未落库时的进度卡片：展示当前阶段；失败时给出原因和「重新生成」入口 */
function ReportPendingCard({
  sessionId,
  progress,
}: {
  sessionId: number;
  progress: ReportProgress;
}) {
  const regenerate = useMutation(
    trpc.interview.finish.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  if (progress.stage === "failed") {
    return (
      <Card className="py-8 text-center">
        <p className="text-sm text-accent-400">评估失败：{progress.error ?? "未知错误"}</p>
        <Button
          className="mt-4"
          disabled={regenerate.isPending}
          onClick={() => regenerate.mutate({ sessionId })}
        >
          {regenerate.isPending ? "生成中…" : "重新生成报告"}
        </Button>
        {regenerate.error && (
          <p className="mt-3 text-sm text-accent-400">生成失败：{regenerate.error.message}</p>
        )}
      </Card>
    );
  }

  const activeStep = progress.stage === "rendering" ? 1 : 0;
  return (
    <Card className="py-8 text-center">
      <div className="flex items-center justify-center gap-2 text-sm text-muted">
        <span className="size-1.5 animate-pulse-dot rounded-full bg-accent-600" />
        {PROGRESS_TEXT[progress.stage] ?? PROGRESS_TEXT.pending}
      </div>
      <div className="mt-4 flex items-center justify-center gap-3 text-xs">
        {PROGRESS_STEPS.map((label, i) => (
          <span
            key={label}
            className={
              i < activeStep
                ? "text-accent-600"
                : i === activeStep
                  ? "font-medium text-ink"
                  : "text-faint"
            }
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>
      {/* 进度丢失（如服务端重启）时允许手动触发 */}
      {progress.stage === "pending" && (
        <Button
          className="mt-4"
          disabled={regenerate.isPending}
          onClick={() => regenerate.mutate({ sessionId })}
        >
          {regenerate.isPending ? "生成中…" : "重新生成报告"}
        </Button>
      )}
      {regenerate.error && (
        <p className="mt-3 text-sm text-accent-400">生成失败：{regenerate.error.message}</p>
      )}
    </Card>
  );
}

export default function ReportPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return <ErrorBox error={new Error("无效的场次 ID")} />;
  }
  return <ReportView key={sessionId} sessionId={sessionId} />;
}

function ReportView({ sessionId }: { sessionId: number }) {
  const [tab, setTab] = useState<"report" | "transcript">("report");
  const get = useQuery({
    ...trpc.interview.get.queryOptions({ sessionId }),
    // 报告未落库时轮询，实时刷新生成进度
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.session.status === "finished" && !d.report ? 2000 : false;
    },
  });

  if (get.isLoading) return <Loading text="加载报告…" />;
  if (get.error) return <ErrorBox error={get.error} />;
  if (!get.data) return null;

  const { session, report, messages, questions } = get.data;

  if (session.status !== "finished") {
    return (
      <Card className="py-12 text-center">
        <p className="text-muted">本场面试尚未结束，评估报告还未生成。</p>
        <Link
          to={`/interview/${sessionId}`}
          className="mt-4 inline-block text-sm text-accent-600 transition-colors hover:text-accent-700"
        >
          返回面试间继续 →
        </Link>
      </Card>
    );
  }

  const duration = durationMinutes(session.createdAt, session.finishedAt);
  const cats = session.categories.map((c) => CATEGORY_LABELS[c as Category] ?? c).join(" / ");
  const evaluatedByText =
    report?.evaluatedBy === "llm"
      ? "LLM 评估"
      : report?.evaluatedBy === "rule"
        ? "规则引擎评估"
        : null;

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <PageHeader
        label="Report · 报告"
        title={session.title}
        description={`方向：${cats} · 题数：${session.questionIds.length}${duration != null ? ` · 时长：${duration} 分钟` : ""}`}
      />

      {/* 总评卡片 */}
      <section className="animate-fade-up" style={{ animationDelay: "0.08s" }}>
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-6">
            <div className={`text-6xl font-black tracking-tight ${gradeTextColor(session.overallGrade)}`}>
              {session.overallGrade ?? "?"}
            </div>
            <div className="space-y-1 text-sm text-muted">
              <div className="text-base font-semibold tracking-tight text-ink">总评等级</div>
              <div className="text-xs text-muted">
                完成于 {formatDateTime(session.finishedAt)}
                {evaluatedByText ? ` · ${evaluatedByText}` : ""}
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Tab 切换 */}
      <SegmentedControl
        className="w-fit animate-fade-up"
        value={tab}
        onChange={setTab}
        itemClassName="px-4 py-1.5"
        options={[
          { value: "report", label: "评估报告" },
          { value: "transcript", label: "对话回放" },
        ]}
      />

      {tab === "report" ? (
        report?.report ? (
          <ReportBody
            text={report.report}
            questionIds={session.questionIds}
            questions={questions}
            messages={messages}
          />
        ) : (
          <ReportPendingCard sessionId={sessionId} progress={get.data.reportProgress} />
        )
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
        </div>
      )}
    </div>
  );
}
