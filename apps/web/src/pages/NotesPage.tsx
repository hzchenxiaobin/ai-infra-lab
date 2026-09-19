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
  SegmentedControl,
} from "../components/ui";
import { Markdown } from "../components/Markdown";
import { extractHeadings } from "../lib/markdown-blocks";
import { formatDateTime } from "../lib/format";

// ---------------------------------------------------------------------------
// 面试复盘笔记：以 markdown 记录每次面试过程（模拟面试复盘 / 真实面经）。
// 语雀式三栏布局：左侧全部笔记列表，中间阅读/编辑正文，右侧大纲目录。
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const remove = useMutation(
    trpc.note.remove.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const list = notes.data ?? [];
  const selected = list.find((n) => n.id === selectedId) ?? null;

  const openNote = (id: number) => {
    setSelectedId(id);
    setCreating(false);
    setEditing(false);
    window.scrollTo({ top: 0 });
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(false);
    setSelectedId(null);
  };

  const onDelete = (note: NoteListItem) => {
    if (window.confirm(`确定删除笔记「${note.title}」？不可恢复。`)) {
      if (note.id === selectedId) setSelectedId(null);
      remove.mutate({ id: note.id });
    }
  };

  const onSaved = (id: number) => {
    queryClient.invalidateQueries();
    setCreating(false);
    setEditing(false);
    setSelectedId(id);
  };

  return (
    <div className="flex items-start gap-8">
      {/* 左栏：全部笔记 */}
      <aside className="sticky top-24 flex max-h-[calc(100vh-8rem)] w-64 shrink-0 flex-col">
        <MicroLabel>Notes · 复盘笔记</MicroLabel>
        <Button className="mt-3 w-full" onClick={startCreate}>
          写复盘
        </Button>
        {notes.isLoading ? (
          <Loading />
        ) : notes.error ? (
          <ErrorBox error={notes.error} />
        ) : list.length === 0 ? (
          <p className="mt-4 text-xs text-faint">还没有复盘笔记</p>
        ) : (
          <nav className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {list.map((note) => {
              const active = note.id === selectedId;
              return (
                <button
                  key={note.id}
                  onClick={() => openNote(note.id)}
                  className={`block w-full rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
                    active
                      ? "border-line bg-surface shadow-soft"
                      : "border-transparent hover:bg-surface/70"
                  }`}
                >
                  <div className="truncate text-sm font-medium">{note.title}</div>
                  <div className="mt-0.5 text-xs text-faint">{formatDateTime(note.updatedAt)}</div>
                </button>
              );
            })}
          </nav>
        )}
      </aside>

      {/* 中栏：正文（阅读 / 编辑） */}
      <div className="min-w-0 flex-1">
        {creating || (editing && selected) ? (
          <NoteEditor
            key={editing ? `edit-${selectedId}` : "new"}
            initial={editing ? selected : null}
            onSaved={onSaved}
            onCancel={() => {
              setCreating(false);
              setEditing(false);
            }}
          />
        ) : selected ? (
          <NoteReader note={selected} onEdit={() => setEditing(true)} onDelete={() => onDelete(selected)} />
        ) : (
          <div className="rounded-2xl border border-line bg-surface shadow-soft">
            <EmptyBox text="从左侧选择一篇笔记，或点击「写复盘」记录第一次面试" />
          </div>
        )}
      </div>

      {/* 右栏：大纲目录（仅阅读态、宽屏显示） */}
      {!creating && !editing && selected && <Toc content={selected.content} />}
    </div>
  );
}

/** 右侧大纲：从 markdown 提取标题，点击平滑滚动到对应锚点 */
function Toc({ content }: { content: string }) {
  const headings = extractHeadings(content).filter((h) => h.level <= 3);
  if (headings.length === 0) return null;
  return (
    <aside className="sticky top-24 hidden max-h-[calc(100vh-8rem)] w-56 shrink-0 overflow-y-auto xl:block">
      <MicroLabel>大纲</MicroLabel>
      <nav className="mt-3 space-y-1 border-l border-line">
        {headings.map((h) => (
          <button
            key={h.index}
            onClick={() =>
              document.getElementById(`note-h-${h.index}`)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            className={`block w-full truncate text-left text-xs text-muted transition-colors duration-150 hover:text-ink ${
              h.level === 1 ? "pl-3 font-medium" : h.level === 2 ? "pl-6" : "pl-9"
            }`}
          >
            {h.text.replace(/[#>*`]+/g, "").trim()}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function NoteReader({
  note,
  onEdit,
  onDelete,
}: {
  note: NoteListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="animate-fade-up" key={note.id}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">{note.title}</h2>
          <p className="mt-1 text-xs text-faint">
            创建于 {formatDateTime(note.createdAt)} · 更新于 {formatDateTime(note.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={onDelete}>
            删除
          </Button>
          <Button size="sm" onClick={onEdit}>
            编辑
          </Button>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-8 shadow-soft">
        <Markdown text={note.content} headingIdPrefix="note-h" />
      </div>
    </div>
  );
}

function NoteEditor({
  initial,
  onSaved,
  onCancel,
}: {
  /** null 表示新增 */
  initial: NoteListItem | null;
  onSaved: (id: number) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [preview, setPreview] = useState<"write" | "preview">("write");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(
    trpc.note.create.mutationOptions({ onSuccess: (data) => onSaved(data.id) }),
  );
  const update = useMutation(
    trpc.note.update.mutationOptions({ onSuccess: () => initial && onSaved(initial.id) }),
  );
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

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">{initial ? "编辑笔记" : "写复盘"}</h2>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" disabled={pending} onClick={submit}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-soft">
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
            placeholder={NOTE_PLACEHOLDER}
            className={`${inputCls} min-h-[60vh] font-mono text-sm leading-relaxed`}
          />
        ) : content.trim() ? (
          <div className="min-h-[60vh] rounded-lg border border-line bg-page p-4">
            <Markdown text={content} />
          </div>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted">
            还没有内容，切回「编辑」开始书写
          </div>
        )}

        {(error || mutationError) && <InlineError>{error ?? mutationError?.message}</InlineError>}
      </div>
    </div>
  );
}
