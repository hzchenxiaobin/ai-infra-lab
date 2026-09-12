import { Markdown } from "./Markdown";

/** 聊天气泡：面试官靠左暗卡细边、考生靠右亮卡（等宽字体便于代码）、system 居中。
 *  flat：嵌套在卡片内（如报告正文）时去掉 shadow-soft，避免阴影叠阴影。 */
export function MessageBubble({
  role,
  content,
  flat,
}: {
  role: string;
  content: string;
  flat?: boolean;
}) {
  const shadow = flat ? "" : "shadow-soft";
  if (role === "system") {
    return <div className="py-1 text-center text-xs text-faint">{content}</div>;
  }
  if (role === "candidate") {
    return (
      <div className="flex justify-end">
        <div
          className={`max-w-[80%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-page/95 ${shadow}`}
        >
          <div className="mb-1 text-xs uppercase tracking-wider text-page/50">考生</div>
          <div className="whitespace-pre-wrap font-mono text-sm">{content}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[80%] rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-2.5 ${shadow}`}
      >
        <div className="mb-1 text-xs uppercase tracking-wider text-muted">面试官</div>
        <Markdown text={content} className="space-y-2 text-sm leading-relaxed text-ink" />
      </div>
    </div>
  );
}
