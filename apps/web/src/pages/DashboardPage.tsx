import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@ailab/contracts";
import { queryClient, trpc } from "../lib/trpc";
import { EmptyBox, ErrorBox, Loading } from "../components/ui";
import { formatDateTime } from "../lib/format";

/** 方向卡片的英文小标签 */
const CATEGORY_EN: Record<Category, string> = {
  leetcode: "Algorithm",
  cuda: "Parallel Computing",
  knowledge: "Domain Knowledge",
};

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2.5 8h10" />
      <path d="M9 4l4 4-4 4" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2.5 6.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

/** 微型区块标签：大写、宽字距、强调色 */
function MicroLabel({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-600">
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const stats = useQuery(trpc.question.stats.queryOptions());
  const scopes = useQuery(trpc.question.scopes.queryOptions());
  const sessions = useQuery(trpc.interview.list.queryOptions());
  const [selected, setSelected] = useState<Category[]>([]);
  const [count, setCount] = useState(5);
  const [scope, setScope] = useState("");
  const [day, setDay] = useState("");

  const start = useMutation(
    trpc.interview.start.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        navigate(`/interview/${data.state.sessionId}`);
      },
    }),
  );

  const toggle = (c: Category) =>
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const byCategory = stats.data?.byCategory;
  const weekName = /daily\/(week\d+)\//.exec(scope)?.[1] ?? "";
  const dayOptions = scopes.data?.days.filter((d) => d.week === weekName) ?? [];
  const finalScope = day || scope;
  const canStart = finalScope !== "" || selected.length > 0;
  const onScopeChange = (s: string) => {
    setScope(s);
    setDay("");
  };

  const sessionTotal = sessions.data?.length ?? 0;
  const sessionDone = sessions.data?.filter((s) => s.status === "finished").length ?? 0;
  const sessionActive = sessionTotal - sessionDone;

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <section className="animate-fade-up">
        <MicroLabel>Start · 组卷</MicroLabel>
        <h1 className="mt-3 text-[40px] leading-tight font-bold tracking-tight">
          开始一场新面试
        </h1>
        <p className="mt-3 text-sm text-muted">
          勾选方向、定好范围与题量，系统即刻为你生成一场限时问答。
        </p>
      </section>

      {/* 组卷卡片 */}
      <section
        className="animate-fade-up rounded-2xl border border-line bg-white p-8 shadow-soft"
        style={{ animationDelay: "0.08s" }}
      >
        {/* 01 选择方向（选中考察范围后禁用） */}
        <div className="flex items-baseline gap-2.5">
          <span className="text-[13px] font-bold text-accent-600">01</span>
          <h2 className="text-[15px] font-semibold">选择方向</h2>
          <span className="text-xs text-muted">可多选</span>
        </div>
        <div
          className={`mt-5 grid gap-4 sm:grid-cols-3 ${finalScope ? "pointer-events-none opacity-40" : ""}`}
        >
          {CATEGORIES.map((c) => {
            const active = selected.includes(c);
            const n = byCategory?.[c] ?? 0;
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={`relative rounded-xl border p-4 text-left transition-all duration-150 ${
                  active
                    ? "border-accent-600 bg-accent-50 ring-1 ring-inset ring-accent-600/40"
                    : "border-line bg-white hover:border-faint"
                }`}
              >
                <div className="text-sm font-semibold">{CATEGORY_LABELS[c]}</div>
                <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                  {CATEGORY_EN[c]}
                </div>
                <div className="mt-5 flex items-baseline gap-1">
                  <span
                    className={`text-[28px] leading-none font-bold ${
                      n === 0 ? "text-faint" : active ? "text-accent-600" : ""
                    }`}
                  >
                    {n}
                  </span>
                  <span className="text-xs text-muted">题</span>
                </div>
                {active && (
                  <span className="absolute top-3 right-3 grid size-[18px] animate-pop-in place-items-center rounded-full bg-accent-600 text-white">
                    <CheckIcon className="size-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 02 考察范围 / 03 题量 */}
        <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5 border-t border-divider pt-7">
          <div>
            <div className="mb-3 flex items-baseline gap-2.5">
              <span className="text-[13px] font-bold text-accent-600">02</span>
              <h2 className="text-[15px] font-semibold">考察范围</h2>
            </div>
            <div className="flex gap-3">
              <select
                value={scope}
                onChange={(e) => onScopeChange(e.target.value)}
                className="input w-52"
              >
                <option value="">按方向（上方勾选）</option>
                {scopes.data && scopes.data.weeks.length > 0 && (
                  <optgroup label="按周（daily）">
                    {scopes.data.weeks.map((w) => (
                      <option key={w.scope} value={w.scope}>
                        {w.name.replace(/^week(\d+)$/, "Week $1")}（{w.count} 题）
                      </option>
                    ))}
                  </optgroup>
                )}
                {scopes.data && scopes.data.topics.length > 0 && (
                  <optgroup label="按专题（topics）">
                    {scopes.data.topics.map((t) => (
                      <option key={t.scope} value={t.scope}>
                        {t.name}（{t.count} 题）
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {weekName && (
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="input w-32"
                >
                  <option value="">整周</option>
                  {dayOptions.map((d) => (
                    <option key={d.scope} value={d.scope}>
                      {d.day.replace(/^day(\d+)$/, "Day $1")}（{d.count} 题）
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-baseline gap-2.5">
              <span className="text-[13px] font-bold text-accent-600">03</span>
              <h2 className="text-[15px] font-semibold">题量</h2>
            </div>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="input w-24"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} 题
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-5">
            <p className="text-xs text-muted">
              {canStart ? `已就绪，共 ${count} 题` : "请至少勾选一个方向，或选择一个考察范围"}
            </p>
            <button
              type="button"
              disabled={!canStart || start.isPending}
              onClick={() =>
                start.mutate(
                  finalScope
                    ? { categories: [], count, scope: finalScope }
                    : { categories: selected, count },
                )
              }
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-accent-600 px-7 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-[#eceff3] disabled:text-[#b3bccb]"
            >
              {start.isPending ? "创建中…" : "开始面试"}
              <ArrowIcon className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {start.error && (
          <p className="mt-5 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-sm text-red-600">
            {start.error.message}
          </p>
        )}
      </section>

      {/* 数据统计带 */}
      <section
        className="animate-fade-up grid grid-cols-3 divide-x divide-divider rounded-2xl border border-line bg-white shadow-soft"
        style={{ animationDelay: "0.16s" }}
      >
        {[
          { label: "累计场次", value: sessionTotal, red: false },
          { label: "已完成", value: sessionDone, red: false },
          { label: "进行中", value: sessionActive, red: true },
        ].map((item) => (
          <div key={item.label} className="flex items-baseline gap-2.5 px-7 py-5">
            <span
              className={`text-[32px] leading-none font-bold ${item.red ? "text-accent-600" : ""}`}
            >
              {item.value}
            </span>
            <span className="text-xs text-muted">{item.label} · 场</span>
          </div>
        ))}
      </section>

      {/* 最近场次 */}
      <section className="animate-fade-up" style={{ animationDelay: "0.24s" }}>
        <MicroLabel>Recent Sessions</MicroLabel>
        <div className="mt-2 mb-5 flex items-end justify-between">
          <h2 className="text-[22px] font-bold tracking-tight">最近场次</h2>
          <Link
            to="/history"
            className="group inline-flex items-center gap-1 text-sm font-medium text-accent-600 transition-colors duration-150 hover:text-accent-700"
          >
            查看全部
            <ArrowIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        </div>
        {sessions.isLoading ? (
          <Loading />
        ) : sessions.error ? (
          <ErrorBox error={sessions.error} />
        ) : sessions.data === undefined ? null : sessions.data.length === 0 ? (
          <EmptyBox text="还没有面试记录，勾选方向开始第一场吧" />
        ) : (
          <div className="divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
            {sessions.data.slice(0, 5).map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  navigate(s.status === "finished" ? `/report/${s.id}` : `/interview/${s.id}`)
                }
                className="group flex w-full items-center gap-5 px-6 py-4 text-left transition-colors duration-150 hover:bg-[#fafbfc]"
              >
                <span className="w-6 shrink-0 text-sm font-semibold text-faint transition-colors duration-150 group-hover:text-accent-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{s.title}</div>
                  <div className="mt-1 text-xs text-muted">
                    {formatDateTime(s.createdAt)} · {s.questionIds.length} 题
                  </div>
                </div>
                {s.status === "finished" ? (
                  s.overallGrade ? (
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-full border text-sm font-bold ${
                        s.overallGrade === "A" || s.overallGrade === "B"
                          ? "border-accent-600 text-accent-600"
                          : "border-faint text-muted"
                      }`}
                    >
                      {s.overallGrade}
                    </span>
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1 text-xs font-medium text-accent-600">
                    <span className="size-1.5 animate-pulse-dot rounded-full bg-accent-600" />
                    进行中 · 点击继续
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
