import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc, type NoteListItem } from "../lib/trpc";
import {
  Button,
  EmptyBox,
  ErrorBox,
  InlineError,
  Loading,
  MicroLabel,
  Modal,
  PageHeader,
  SegmentedControl,
} from "../components/ui";
import { Markdown } from "../components/Markdown";
import { formatDateTime } from "../lib/format";

// ---------------------------------------------------------------------------
// 面试复盘笔记：以 markdown 记录每次面试过程（模拟面试复盘 / 真实面经）。
// 列表 + 阅读/编辑弹窗（编辑态支持 markdown 实时预览）。
// ---------------------------------------------------------------------------

const inputCls = "input w-full";

const NOTE_PLACEHOLDER = `## 面试背景
- 公司 / 岗位 / 轮次

## 过程
- 聊了什么项目？
- 手撕了哪道题？

## 反思
- 哪里答得不好？
- 下次怎么改进？`;

export default function NotesPage() {
  const notes = useQuery(trpc.note.list.queryOptions());
  const [creating, setCreating] = useState(false);
  const [reading, setReading] = useState<NoteListItem | null>(null);

  const remove = useMutation(
    trpc.note.remove.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const onDelete = (note: NoteListItem) => {
    if (window.confirm(`确定删除笔记「${note.title}」？不可恢复。`)) {
      remove.mutate({ id: note.id });
    }
  };

  return (
    <div className="space-y-10">
      <PageHeader
        label="Notes · 复盘笔记"
        title="复盘笔记"
        description="用 markdown 记录每次面试的过程与反思，沉淀自己的面经。"
        actions={
          <Button onClick={() => setCreating(true)}>写复盘</Button>
        }
      />

      <section className="animate-fade-up" style={{ animationDelay: "0.08s" }}>
        <MicroLabel>All Notes</MicroLabel>
        <h3 className="mt-2 mb-5 text-lg font-semibold tracking-tight">全部笔记</h3>
        {notes.isLoading ? (
          <Loading />
        ) : notes.error ? (
          <ErrorBox error={notes.error} />
        ) : notes.data === undefined ? null : notes.data.length === 0 ? (
          <EmptyBox text="还没有复盘笔记，点击「写复盘」记录第一次面试吧" />
        ) : (
          <div className="divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
            {notes.data.map((note) => (
              <div
                key={note.id}
                onClick={() => setReading(note)}
                className="cursor-pointer px-5 py-4 transition-colors duration-150 hover:bg-page"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{note.title}</div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted">
                      {note.content.replace(/[#>*`\-\d.]+/g, " ").trim().slice(0, 120) || "（空）"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="whitespace-nowrap text-xs text-faint">
                      {formatDateTime(note.updatedAt)}
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(note);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {creating && <NoteModal initial={null} onClose={() => setCreating(false)} />}
      {reading && <NoteModal initial={reading} onClose={() => setReading(null)} />}
    </div>
  );
}

function NoteModal({ initial, onClose }: { initial: NoteListItem | null; onClose: () => void }) {
  /** null 表示新增；已有笔记默认进入阅读态 */
  const [mode, setMode] = useState<"read" | "edit">(initial ? "read" : "edit");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [preview, setPreview] = useState<"write" | "preview">("write");
  const [error, setError] = useState<string | null>(null);

  const onSaved = () => {
    queryClient.invalidateQueries();
    onClose();
  };
  const create = useMutation(trpc.note.create.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(trpc.note.update.mutationOptions({ onSuccess: onSaved }));
  const pending = create.isPending || update.isPending;

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("标题不能为空");
    if (!content.trim()) return setError("正文不能为空");
    const data = { title: title.trim(), content: content.trim() };
    if (initial) {
      update.mutate({ id: initial.id, data });
    } else {
      create.mutate(data);
    }
  };

  const mutationError = create.error ?? update.error;

  if (mode === "read" && initial) {
    return (
      <Modal title={initial.title} onClose={onClose} wide>
        <div className="space-y-5">
          <div className="flex items-center justify-between text-xs text-faint">
            <span>创建于 {formatDateTime(initial.createdAt)}</span>
            <span>更新于 {formatDateTime(initial.updatedAt)}</span>
          </div>
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            <Markdown text={initial.content} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
            <Button onClick={() => setMode("edit")}>编辑</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={initial ? "编辑笔记" : "写复盘"} onClose={onClose} wide>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">标题 *</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：9.17 某厂一面复盘"
            className={inputCls}
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">正文 *（markdown）</span>
          <SegmentedControl
            options={[
              { value: "write", label: "编辑" },
              { value: "preview", label: "预览" },
            ]}
            value={preview}
            onChange={setPreview}
          />
        </div>
        {preview === "write" ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            placeholder={NOTE_PLACEHOLDER}
            className={`${inputCls} font-mono text-xs leading-relaxed`}
          />
        ) : content.trim() ? (
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line bg-page p-4">
            <Markdown text={content} />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">
            还没有内容，切回「编辑」开始书写
          </div>
        )}

        {(error || mutationError) && <InlineError>{error ?? mutationError?.message}</InlineError>}
        <div className="flex justify-end gap-2 pt-1">
          {initial && (
            <Button variant="secondary" onClick={() => setMode("read")}>
              取消编辑
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button disabled={pending} onClick={submit}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
