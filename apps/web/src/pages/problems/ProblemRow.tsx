import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { queryClient, trpc } from "../../lib/trpc";
import { Button, Chip, DifficultyBadge, StatusPill } from "../../components/ui";

// ---------------------------------------------------------------------------
// 题目行（题库/题单/周赛共用）：标题跳 docs 题解页，leetgpu-com 题附外站评测链接，
// 行内 AC 标记（progress.mark，成功后失效全部查询）。
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
  ac: boolean;
}

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

  return (
    <div className="group flex items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-page">
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
        </div>
      </div>
      {problem.ac ? (
        <span className="shrink-0">
          <StatusPill variant="ac">✓ AC</StatusPill>
        </span>
      ) : (
        <Button
          variant="secondary"
          disabled={mark.isPending}
          onClick={() => mark.mutate({ contentId: problem.id, status: "ac" })}
          className="shrink-0"
          title={
            problem.judgeType === "leetgpu-com"
              ? "在 leetgpu.com 完成评测后，回站点此标记通过"
              : "标记本题已通过"
          }
        >
          {mark.isPending ? "标记中…" : problem.judgeType === "leetgpu-com" ? "完成后标记" : "标记 AC"}
        </Button>
      )}
    </div>
  );
}
