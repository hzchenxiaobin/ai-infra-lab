import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { queryClient, trpc } from "../../lib/trpc";
import { DIFFICULTY_LABELS } from "../../lib/format";
import "./problems.css";

// ---------------------------------------------------------------------------
// 题目行（题库/题单/周赛共用）：标题跳 docs 题解页，leetgpu-com 题附外站评测链接，
// 行尾掌握状态三态切换（没写过 = unseen / 需复习 = seen / 已完全掌握 = ac，progress.mark），
// 行内个人备注（progress.setNote，记录注意事项/易错点）。
// ---------------------------------------------------------------------------

export interface ProblemRowData {
  id: string;
  number: number;
  title: string;
  url: string;
  difficulty: string;
  judgeType: string;
  externalUrl: string;
  tags: string[];
  progressStatus: "unseen" | "seen" | "mastered" | "ac";
  note: string | null;
  /** GPU 面试题频次档（仅刷题 GPU 分区有值）：high 高频 / mid 中频 */
  tier?: "high" | "mid" | null;
}

const PROGRESS_STATES = [
  { value: "unseen", label: "没写过", hint: "完全没写过，点击重置为该状态（备注保留）" },
  { value: "seen", label: "需复习", hint: "写过但还没完全掌握，留待后续复习" },
  { value: "ac", label: "已完全掌握", hint: "已完全掌握（计入刷题统计）" },
] as const;

const DIFFICULTY_BADGE_CLASS: Record<string, string> = {
  easy: "pbadge--easy",
  medium: "pbadge--medium",
  hard: "pbadge--hard",
};

export function ProblemRow({
  problem,
  prefix,
}: {
  problem: ProblemRowData;
  /** 序号徽标文案（如周赛 Q1），设置后替代 #number 显示 */
  prefix?: string;
}) {
  const mark = useMutation(
    trpc.progress.mark.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );
  const setNote = useMutation(
    trpc.progress.setNote.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditing(false);
      },
    }),
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const openEditor = () => {
    setDraft(problem.note ?? "");
    setEditing(true);
  };

  return (
    <div className="problem-row">
      <div className="problem-row-flex">
        <div className="problem-row-main">
          <div className="problem-title-line">
            {prefix ? (
              <span className="pbadge pbadge--q">{prefix}</span>
            ) : (
              problem.number > 0 && <span className="problem-number">#{problem.number}</span>
            )}
            <a className="problem-title" href={problem.url}>
              {problem.title}
            </a>
            <span className={`pbadge ${DIFFICULTY_BADGE_CLASS[problem.difficulty] ?? ""}`}>
              {DIFFICULTY_LABELS[problem.difficulty as keyof typeof DIFFICULTY_LABELS] ??
                problem.difficulty}
            </span>
            {problem.tier === "high" && <span className="pbadge pbadge--high">高频</span>}
            {problem.tier === "mid" && <span className="pbadge">中频</span>}
            {problem.tags.slice(0, 3).map((t) => (
              <span className="pbadge" key={t}>
                {t}
              </span>
            ))}
          </div>
          <div className="problem-meta">
            <span className="problem-id">{problem.id}</span>
            {problem.judgeType === "internal" && (
              <Link className="problem-link" to={`/judge/${problem.id}`}>
                站内评测 →
              </Link>
            )}
            {problem.judgeType === "leetgpu-com" && problem.externalUrl && (
              <a
                className="problem-link"
                href={problem.externalUrl}
                target="_blank"
                rel="noreferrer"
              >
                leetgpu 评测 ↗
              </a>
            )}
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : openEditor())}
              className="problem-link"
              title={problem.note ? "查看 / 编辑备注" : "添加备注（注意事项、易错点）"}
            >
              备注
              {problem.note && <span className="problem-note-dot" />}
            </button>
          </div>
        </div>
        <div className="seg seg--sm" role="group" aria-label="掌握状态">
          {PROGRESS_STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={mark.isPending || problem.progressStatus === s.value}
              onClick={() => mark.mutate({ contentId: problem.id, status: s.value })}
              className={`seg-item${problem.progressStatus === s.value ? " is-active" : ""}`}
              title={
                s.value === "ac" && problem.judgeType === "leetgpu-com"
                  ? "在 leetgpu.com 完成评测后标记为已完全掌握"
                  : s.hint
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {editing ? (
        <div className="problem-note">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="记录本题的注意事项、易错点、关键思路…"
            className="problem-note-box"
            autoFocus
          />
          <div className="problem-note-actions">
            <button
              type="button"
              className="btn btn-primary btn--sm"
              disabled={setNote.isPending}
              onClick={() => setNote.mutate({ contentId: problem.id, note: draft })}
            >
              {setNote.isPending ? "保存中…" : "保存"}
            </button>
            <button type="button" className="btn btn-secondary btn--sm" onClick={() => setEditing(false)}>
              取消
            </button>
            {setNote.error && <span className="problem-form-error">{setNote.error.message}</span>}
          </div>
        </div>
      ) : (
        problem.note && (
          <button type="button" onClick={openEditor} className="problem-note-view" title="点击编辑备注">
            {problem.note}
          </button>
        )
      )}
    </div>
  );
}
