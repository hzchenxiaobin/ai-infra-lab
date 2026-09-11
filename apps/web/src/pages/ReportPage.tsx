import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { CATEGORY_LABELS, type Category } from "@ailab/contracts";
import { trpc } from "../lib/trpc";
import { Card, ErrorBox, Loading } from "../components/ui";
import { ReportBody } from "../components/ReportBody";
import { MessageBubble } from "../components/MessageBubble";
import { durationMinutes, formatDateTime, gradeTextColor } from "../lib/format";

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
  const get = useQuery(trpc.interview.get.queryOptions({ sessionId }));

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
      <section className="animate-fade-up">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-600">
          Report · 报告
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">{session.title}</h1>
        <p className="mt-2 text-sm text-muted">
          方向：{cats} · 题数：{session.questionIds.length}
          {duration != null ? ` · 时长：${duration} 分钟` : ""}
        </p>
      </section>

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
      <div className="flex w-fit animate-fade-up gap-0.5 rounded-full bg-divider p-1" style={{ animationDelay: "0.16s" }}>
        {(
          [
            ["report", "评估报告"],
            ["transcript", "对话回放"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors duration-150 ${
              tab === key ? "bg-ink font-medium text-page" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "report" ? (
        report?.report ? (
          <ReportBody
            text={report.report}
            questionIds={session.questionIds}
            questions={questions}
            messages={messages}
          />
        ) : (
          <Card>
            <p className="text-sm text-muted">报告内容为空。</p>
          </Card>
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
