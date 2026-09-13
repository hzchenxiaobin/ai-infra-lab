import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { queryClient, trpc } from "../../lib/trpc";
import { Button, Chip, DifficultyBadge } from "../../components/ui";
import { SEGMENTED_CLASS, segmentedItemClass } from "../../lib/segmented";

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
    <div className="group px-5 py-3 transition-colors duration-150 hover:bg-page">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {prefix ? (
              <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-xs font-medium text-page">
                {prefix}
              </span>
            ) : (
              problem.number > 0 && (
                <span className="font-mono text-xs text-faint">#{problem.number}</span>
              )
            )}
            <a
              href={problem.url}
              className="text-base font-semibold transition-colors duration-150 hover:text-accent-600"
            >
              {problem.title}
            </a>
            <DifficultyBadge difficulty={problem.difficulty} />
            {problem.tier === "high" && (
              <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-600">
                高频
              </span>
            )}
            {problem.tier === "mid" && <Chip>中频</Chip>}
            {problem.tags.slice(0, 3).map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-faint">
            <span className="font-mono">{problem.id}</span>
            {problem.judgeType === "internal" && (
              <Link
                to={`/judge/${problem.id}`}
                className="text-accent-600 transition-colors duration-150 hover:text-accent-700"
              >
                站内评测 →
              </Link>
            )}
            {problem.judgeType === "leetgpu-com" && problem.externalUrl && (
              <a
                href={problem.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-150 hover:text-accent-600"
              >
                leetgpu 评测 ↗
              </a>
            )}
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : openEditor())}
              className="inline-flex items-center gap-1 transition-colors duration-150 hover:text-accent-600"
              title={problem.note ? "查看 / 编辑备注" : "添加备注（注意事项、易错点）"}
            >
              备注
              {problem.note && <span className="size-1.5 rounded-full bg-accent-600" />}
            </button>
          </div>
        </div>
        <div className={`${SEGMENTED_CLASS} shrink-0`} role="group" aria-label="掌握状态">
          {PROGRESS_STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={mark.isPending || problem.progressStatus === s.value}
              onClick={() => mark.mutate({ contentId: problem.id, status: s.value })}
              className={`rounded-full px-3 py-1 text-xs ${segmentedItemClass(problem.progressStatus === s.value)}`}
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
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="记录本题的注意事项、易错点、关键思路…"
            className="input w-full resize-y text-sm"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={setNote.isPending}
              onClick={() => setNote.mutate({ contentId: problem.id, note: draft })}
            >
              {setNote.isPending ? "保存中…" : "保存"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              取消
            </Button>
            {setNote.error && (
              <span className="text-xs text-accent-600">{setNote.error.message}</span>
            )}
          </div>
        </div>
      ) : (
        problem.note && (
          <button
            type="button"
            onClick={openEditor}
            className="mt-2 block w-full rounded-lg bg-page px-3 py-2 text-left text-xs whitespace-pre-wrap text-muted transition-colors duration-150 hover:text-ink"
            title="点击编辑备注"
          >
            {problem.note}
          </button>
        )
      )}
    </div>
  );
}
