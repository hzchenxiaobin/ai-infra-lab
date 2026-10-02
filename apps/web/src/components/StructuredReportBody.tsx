import { CATEGORY_LABELS, type InterviewMessage, type StructuredReport, type WeakPointRecommendation } from "@ailab/contracts";
import { Card, Chip, GradeBadge } from "./ui";
import { Markdown } from "./Markdown";
import { AnswerPairs, SectionHeading } from "./report-shared";
import { stripChatPrefix } from "../lib/report";

// ---------------------------------------------------------------------------
// 结构化报告正文（单一事实源 interview_reports.structured 的渲染）：
// 总评 / 逐题卡片（维度 chips + 诊断/建议/参考答案/要点对照）/ 专项训练建议。
// 提问与参考答案的配对直接按 questionId 关联消息，不依赖文本格式约定。
// ---------------------------------------------------------------------------

/** 「诊断」是报告的核心结论，用 Chip accent 强调；其余标签用默认 Chip */
const ACCENT_LABELS = new Set(["诊断"]);

function LabeledBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="border-l-2 border-line pl-3">
      <Chip accent={ACCENT_LABELS.has(label)}>{label}</Chip>
      <Markdown text={text} className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink" />
    </div>
  );
}

function QuestionCard({
  index,
  question,
  keyPoints,
  askedQuestions,
}: {
  index: number;
  question: StructuredReport["result"]["questions"][number];
  keyPoints: string;
  askedQuestions: string[];
}) {
  return (
    <Card>
      <SectionHeading>
        <span>
          第 {index + 1} 题：{question.title}
        </span>
        <Chip className="ml-2 align-middle font-normal">
          {CATEGORY_LABELS[question.category] ?? question.category}
        </Chip>
      </SectionHeading>
      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          {question.dimensions.map((d) => (
            <Chip key={d.name} className="inline-flex items-center gap-1">
              {d.name}
              <GradeBadge grade={d.grade} />
            </Chip>
          ))}
        </div>
        <LabeledBlock label="诊断" text={question.diagnosis} />
        <LabeledBlock label="改进建议" text={question.suggestion} />
        {question.answers.length > 0 && (
          <div className="border-l-2 border-line pl-3">
            <Chip>参考答案</Chip>
            <AnswerPairs askedQuestions={askedQuestions} answers={question.answers} />
          </div>
        )}
        {keyPoints && <LabeledBlock label="要点对照" text={keyPoints} />}
      </div>
    </Card>
  );
}

function RecommendationCard({
  weakDimensions,
  recommendations,
}: {
  weakDimensions: string[];
  recommendations: WeakPointRecommendation[];
}) {
  return (
    <Card>
      <SectionHeading>专项训练建议</SectionHeading>
      {weakDimensions.length > 0 && (
        <ol className="ml-4 list-decimal space-y-1 text-sm leading-relaxed text-ink">
          {weakDimensions.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ol>
      )}
      {recommendations.length > 0 && (
        <div className={weakDimensions.length > 0 ? "mt-4" : undefined}>
          <div className="text-xs font-medium text-muted">薄弱点 → 学习与练习</div>
          <div className="mt-2 space-y-2.5">
            {recommendations.map((rec) => (
              <div key={rec.name} className="text-sm leading-relaxed">
                <span className="font-semibold text-ink">{rec.name}</span>
                {rec.learn.length > 0 && (
                  <div className="mt-1 text-muted">
                    学习：
                    {rec.learn.map((l, i) => (
                      <span key={l.id}>
                        {i > 0 && "、"}
                        <a href={l.url} className="text-accent-600 transition-colors hover:text-accent-700">
                          {l.title}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
                {rec.problems.length > 0 && (
                  <div className="mt-1 text-muted">
                    练习：
                    {rec.problems.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && "、"}
                        <a href={p.url} className="text-accent-600 transition-colors hover:text-accent-700">
                          {p.title}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function StructuredReportBody({
  report,
  messages = [],
}: {
  report: StructuredReport;
  messages?: InterviewMessage[];
}) {
  const { result, keyPointsByQuestion, recommendations } = report;
  const askedOf = (questionId: number) =>
    messages
      .filter((m) => m.questionId === questionId && m.role === "interviewer")
      .map((m) => stripChatPrefix(m.content));
  return (
    <div className="space-y-4">
      <Card>
        <SectionHeading>
          <span className="flex items-center gap-2">
            总评
            <GradeBadge grade={result.overallGrade} />
          </span>
        </SectionHeading>
        <Markdown text={result.summary} />
        {result.evaluatedBy === "rule" && (
          <p className="mt-2 text-xs text-faint">注：本次由规则引擎评估（未启用 LLM 或 LLM 降级）。</p>
        )}
      </Card>

      {result.questions.map((q, i) => (
        <QuestionCard
          key={q.questionId}
          index={i}
          question={q}
          keyPoints={keyPointsByQuestion[String(q.questionId)] ?? ""}
          askedQuestions={askedOf(q.questionId)}
        />
      ))}

      {(result.weakDimensions.length > 0 || recommendations.length > 0) && (
        <RecommendationCard weakDimensions={result.weakDimensions} recommendations={recommendations} />
      )}
    </div>
  );
}
