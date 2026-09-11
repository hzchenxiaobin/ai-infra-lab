import { CATEGORY_LABELS, type Category, type InterviewMessage, type Question } from "@ailab/contracts";
import { Card, GradeBadge } from "./ui";
import { Markdown } from "./Markdown";
import { MessageBubble } from "./MessageBubble";

// ---------------------------------------------------------------------------
// 评估报告正文：把 renderReportMarkdown 生成的整段 markdown 按 `## ` 拆成
// 独立模块卡片；题目卡片内再拆出维度评分 chips 和「诊断/改进建议/参考答案/
// 要点对照」带标签的子块，避免整页文字堆叠。
// ---------------------------------------------------------------------------

interface Section {
  heading: string;
  body: string;
}

/** 按 `## ` 切分报告；`# ` 大标题与顶部总评卡片信息重复，直接跳过 */
function splitSections(text: string): Section[] {
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of text.split("\n")) {
    if (/^# /.test(line)) continue;
    const h = /^##\s+(.*)$/.exec(line);
    if (h) {
      current = { heading: h[1], body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections
    .map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }))
    .filter((s) => s.heading || s.body);
}

type QBlock =
  | { kind: "dims"; dims: { name: string; grade: string }[] }
  | { kind: "labeled"; label: string; text: string }
  | { kind: "md"; text: string };

const KNOWN_LABELS = ["诊断", "改进建议", "参考答案", "要点对照"];

/** 去掉面试官消息里的寒暄/换题前缀，只保留题目本身 */
function stripChatPrefix(content: string): string {
  return content
    .replace(/^你好，我是今天的面试官[\s\S]*?我们开始第一题：\s*/, "")
    .replace(/^好的，进入第\s*\d+\s*题：\s*/, "");
}

/** 新格式参考答案按行首「【答】」拆成每问一条；没有标记（旧报告）返回 null */
function splitAnswers(text: string): string[] | null {
  const answers: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("【答】")) {
      answers.push(line.slice("【答】".length));
    } else if (answers.length > 0) {
      answers[answers.length - 1] += "\n" + line;
    }
  }
  if (answers.length === 0) return null;
  const trimmed = answers.map((a) => a.trim());
  return trimmed.some(Boolean) ? trimmed : null;
}

/** 参考答案：新格式（【答】分段）按「一问一答」与提问配对展示；旧格式回退为整段 */
function ReferenceAnswer({
  text,
  askedQuestions,
  question,
}: {
  text: string;
  askedQuestions: string[];
  question?: Question;
}) {
  const answers = splitAnswers(text);
  if (answers) {
    const n = Math.max(askedQuestions.length, answers.length);
    return (
      <div className="mt-2 space-y-3">
        {Array.from({ length: n }, (_, j) => (
          <div key={j}>
            {j < askedQuestions.length && (
              <>
                <div className="mb-1 text-[11px] text-faint">
                  {j === 0 ? "主问题" : `追问 ${j}`}
                </div>
                <MessageBubble role="interviewer" content={askedQuestions[j]} />
              </>
            )}
            {j < answers.length && (
              <div className="ml-4 mt-1.5 border-l-2 border-accent-200 pl-3">
                <Markdown
                  text={answers[j]}
                  className="space-y-2 text-sm leading-relaxed text-ink"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  // 旧报告：参考答案为整段文本，先列全部问题再给答案
  return (
    <>
      {askedQuestions.length > 0 ? (
        <div className="mt-2 space-y-2 rounded-md border border-line bg-surface p-2.5">
          <div className="text-xs font-medium text-muted">原问题</div>
          {askedQuestions.map((q, j) => (
            <div key={j}>
              <div className="mb-1 mt-1 text-[11px] text-faint first:mt-0">
                {j === 0 ? "主问题" : `追问 ${j}`}
              </div>
              <MessageBubble role="interviewer" content={q} />
            </div>
          ))}
        </div>
      ) : (
        question && (
          <div className="mt-2 rounded-md border border-line bg-surface p-2.5">
            <div className="mb-1 text-xs font-medium text-muted">原问题</div>
            <Markdown
              text={question.content || question.title}
              className="space-y-2 text-[13px] leading-relaxed text-muted"
            />
          </div>
        )
      )}
      <Markdown text={text} className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink" />
    </>
  );
}

const LABEL_STYLES: Record<string, string> = {
  诊断: "bg-accent-50 text-accent-700 ring-accent-600/20",
  改进建议: "bg-surface text-muted ring-line",
  参考答案: "bg-surface text-muted ring-line",
  要点对照: "bg-surface text-muted ring-line",
};

/** 「准确性 C · 深度 C」形式的维度评分行；全部片段都匹配才认为是维度行 */
function parseDims(content: string): { name: string; grade: string }[] | null {
  const dims: { name: string; grade: string }[] = [];
  for (const seg of content.split(" · ")) {
    const m = /^(.+?)\s+([ABCD])$/.exec(seg.trim());
    if (!m) return null;
    dims.push({ name: m[1], grade: m[2] });
  }
  return dims.length > 0 ? dims : null;
}

/** 题目卡片正文：维度行 → chips，带标签的 bullet → 子块，续行并入上一块 */
function parseQuestionBody(body: string): QBlock[] {
  const blocks: QBlock[] = [];
  let dimsDone = false;
  for (const line of body.split("\n")) {
    const bullet = /^- (.*)$/.exec(line);
    if (bullet) {
      const content = bullet[1];
      if (!dimsDone) {
        const dims = parseDims(content);
        if (dims) {
          blocks.push({ kind: "dims", dims });
          dimsDone = true;
          continue;
        }
      }
      const lab = /^(\S{2,6})：([\s\S]*)$/.exec(content);
      if (lab && KNOWN_LABELS.includes(lab[1])) {
        blocks.push({ kind: "labeled", label: lab[1], text: lab[2] });
        continue;
      }
      blocks.push({ kind: "md", text: line });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.kind !== "dims") {
      last.text += "\n" + line;
    } else if (line.trim()) {
      blocks.push({ kind: "md", text: line });
    }
  }
  return blocks;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-4 w-1 rounded-full bg-accent-600" />
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
    </div>
  );
}

/** 「第 N 题：标题（category）」→ 题号 + 标题 + 方向标签 */
function QuestionHeading({ heading }: { heading: string }) {
  const m = /^第\s*(\d+)\s*题：(.*?)(?:（([^（）]*)）)?$/.exec(heading);
  if (!m) return <>{heading}</>;
  const catLabel = m[3] ? (CATEGORY_LABELS[m[3] as Category] ?? m[3]) : null;
  return (
    <>
      <span>第 {m[1]} 题：{m[2]}</span>
      {catLabel && (
        <span className="ml-2 rounded-full bg-divider px-2 py-0.5 align-middle text-xs font-normal text-muted">
          {catLabel}
        </span>
      )}
    </>
  );
}

function QuestionCard({
  section,
  question,
  askedQuestions,
}: {
  section: Section;
  question?: Question;
  askedQuestions: string[];
}) {
  const blocks = parseQuestionBody(section.body);
  return (
    <Card>
      <SectionHeading>
        <QuestionHeading heading={section.heading} />
      </SectionHeading>
      <div className="space-y-2.5">
        {blocks.map((b, i) => {
          if (b.kind === "dims") {
            return (
              <div key={i} className="flex flex-wrap gap-1.5">
                {b.dims.map((d) => (
                  <span
                    key={d.name}
                    className="inline-flex items-center gap-1 rounded-full bg-divider py-0.5 pl-2.5 pr-1 text-xs text-muted"
                  >
                    {d.name}
                    <GradeBadge grade={d.grade} />
                  </span>
                ))}
              </div>
            );
          }
          if (b.kind === "labeled") {
            return (
              <div key={i} className="rounded-lg bg-page p-3">
                <span
                  className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${LABEL_STYLES[b.label] ?? "bg-surface text-muted ring-line"}`}
                >
                  {b.label}
                </span>
                {b.label === "参考答案" ? (
                  <ReferenceAnswer
                    text={b.text}
                    askedQuestions={askedQuestions}
                    question={question}
                  />
                ) : (
                  <Markdown
                    text={b.text}
                    className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink"
                  />
                )}
              </div>
            );
          }
          return <Markdown key={i} text={b.text} />;
        })}
      </div>
    </Card>
  );
}

function GenericCard({ section }: { section: Section }) {
  // 「总评：X」的等级顶部卡片已展示，这里换成徽章
  const gradeM = /^(总评)[：:]\s*([ABCD])$/.exec(section.heading);
  return (
    <Card>
      <SectionHeading>
        {gradeM ? (
          <span className="flex items-center gap-2">
            {gradeM[1]}
            <GradeBadge grade={gradeM[2]} />
          </span>
        ) : (
          section.heading
        )}
      </SectionHeading>
      <Markdown text={section.body} />
    </Card>
  );
}

export function ReportBody({
  text,
  questionIds = [],
  questions = {},
  messages = [],
}: {
  text: string;
  questionIds?: number[];
  questions?: Record<number, Question>;
  messages?: InterviewMessage[];
}) {
  const sections = splitSections(text);
  if (sections.length === 0) {
    // 兜底：不符合预期结构时按整段 markdown 渲染
    return (
      <Card>
        <Markdown text={text} />
      </Card>
    );
  }
  // 题目模块的顺序与 session.questionIds 一致，按序取出对应原题
  let qIndex = 0;
  return (
    <div className="space-y-4">
      {sections.map((s, i) => {
        if (!/^第\s*\d+\s*题/.test(s.heading)) {
          return <GenericCard key={i} section={s} />;
        }
        const qid = questionIds[qIndex++];
        const askedQuestions = messages
          .filter((m) => m.questionId === qid && m.role === "interviewer")
          .map((m) => stripChatPrefix(m.content));
        return (
          <QuestionCard
            key={i}
            section={s}
            question={questions[qid]}
            askedQuestions={askedQuestions}
          />
        );
      })}
    </div>
  );
}
