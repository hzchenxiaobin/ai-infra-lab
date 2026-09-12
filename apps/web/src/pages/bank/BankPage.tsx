import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CATEGORIES, CATEGORY_LABELS, DIFFICULTIES, type Category, type Difficulty } from "@ailab/contracts";
import { queryClient, trpc, type QuestionListItem } from "../../lib/trpc";
import { Button, EmptyBox, ErrorBox, Loading, PageHeader, SegmentedControl } from "../../components/ui";
import { DIFFICULTY_LABELS } from "../../lib/format";
import { QuestionCard } from "./QuestionCard";
import { QuestionFormModal } from "./QuestionFormModal";
import { ImportModal } from "./ImportModal";

const PAGE_SIZE = 10;

export default function BankPage() {
  const [category, setCategory] = useState<"all" | Category>("all");
  const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionListItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useQuery(
    trpc.question.list.queryOptions({
      category: category === "all" ? undefined : category,
      difficulty: difficulty === "all" ? undefined : difficulty,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  const seed = useMutation(
    trpc.question.seed.mutationOptions({
      onSuccess: (r) => {
        setNotice(`播种完成：新增 ${r.seeded} 题，跳过已存在 ${r.skipped} 题`);
        queryClient.invalidateQueries();
      },
      onError: (e) => setNotice(`播种失败：${e.message}`),
    }),
  );

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <PageHeader
        label="Question Bank · 题库"
        title="题库管理"
        description="维护题目或批量导入。"
        actions={
          <>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              新增题目
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              批量导入
            </Button>
            <Button
              variant="secondary"
              disabled={seed.isPending}
              onClick={() => {
                setNotice(null);
                seed.mutate();
              }}
            >
              {seed.isPending ? "播种中…" : "一键播种"}
            </Button>
          </>
        }
      />

      {notice && (
        <div className="animate-fade-up rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-soft">
          {notice}
        </div>
      )}

      {/* 筛选 */}
      <section
        className="flex animate-fade-up flex-wrap items-center gap-3"
        style={{ animationDelay: "0.16s" }}
      >
        <SegmentedControl
          value={category}
          onChange={(c) => {
            setCategory(c);
            setPage(1);
          }}
          options={(["all", ...CATEGORIES] as const).map((c) => ({
            value: c,
            label: c === "all" ? "全部" : CATEGORY_LABELS[c],
          }))}
        />
        <select
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value as "all" | Difficulty);
            setPage(1);
          }}
          className="input"
        >
          <option value="all">全部难度</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索标题…"
          className="input w-48"
        />
      </section>

      {/* 列表 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.24s" }}>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox error={list.error} />
        ) : list.data === undefined ? null : list.data.items.length === 0 ? (
          <EmptyBox text="没有符合条件的题目，可尝试新增、批量导入或一键播种" />
        ) : (
          <>
            <div className="space-y-2">
              {list.data.items.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  onEdit={() => {
                    setEditing(q);
                    setFormOpen(true);
                  }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>
                共 {list.data.total} 题 · 第 {list.data.page}/{totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {formOpen && <QuestionFormModal initial={editing} onClose={() => setFormOpen(false)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}
