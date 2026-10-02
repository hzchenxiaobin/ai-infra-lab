import { Markdown } from "./Markdown";
import { MessageBubble } from "./MessageBubble";

// ---------------------------------------------------------------------------
// 报告渲染共享原子：StructuredReportBody（结构化数据渲染）与 ReportBody
// （存量报告的 markdown 解析渲染）共用的展示件。
// 纯函数（stripChatPrefix）在 lib/report.ts——组件文件混出非组件会破坏 fast refresh。
// ---------------------------------------------------------------------------

/** 面试官提问与参考答案一一配对展示（主问题/追问 j ↔ answers[j]） */
export function AnswerPairs({ askedQuestions, answers }: { askedQuestions: string[]; answers: string[] }) {
  const n = Math.max(askedQuestions.length, answers.length);
  return (
    <div className="mt-2 space-y-3">
      {Array.from({ length: n }, (_, j) => (
        <div key={j}>
          {j < askedQuestions.length && (
            <>
              <div className="mb-1 text-xs text-faint">{j === 0 ? "主问题" : `追问 ${j}`}</div>
              <MessageBubble role="interviewer" content={askedQuestions[j]} flat />
            </>
          )}
          {j < answers.length && (
            <div className="ml-4 mt-1.5 border-l-2 border-accent-200 pl-3">
              <Markdown text={answers[j]} className="space-y-2 text-sm leading-relaxed text-ink" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 卡片标题：竖条 + 标题 */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-4 w-1 rounded-full bg-accent-600" />
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
    </div>
  );
}
