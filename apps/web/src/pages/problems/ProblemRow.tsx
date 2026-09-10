import { useMutation } from "@tanstack/react-query";
import { queryClient, trpc } from "../../lib/trpc";
import { Button, DifficultyBadge } from "../../components/ui";

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
    <div className="group flex items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-[#fafbfc]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {prefix ? (
            <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">
              {prefix}
            </span>
          ) : (
            problem.number > 0 && (
              <span className="font-mono text-xs text-faint">#{problem.number}</span>
            )
          )}
          <a
            href={problem.url}
            className="text-[15px] font-medium transition-colors duration-150 hover:text-accent-600"
          >
            {problem.title}
          </a>
          <DifficultyBadge difficulty={problem.difficulty} />
          {problem.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-md bg-page px-1.5 py-0.5 text-[11px] text-muted">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-faint">
          <span className="font-mono">{problem.id}</span>
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
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-100 px-3 py-1 text-xs font-medium text-accent-600">
          ✓ AC
        </span>
      ) : (
        <Button
          variant="secondary"
          disabled={mark.isPending}
          onClick={() => mark.mutate({ contentId: problem.id, status: "ac" })}
          className="shrink-0"
        >
          {mark.isPending ? "标记中…" : "标记 AC"}
        </Button>
      )}
    </div>
  );
}
