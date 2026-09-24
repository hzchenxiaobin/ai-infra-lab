import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { CATEGORY_LABELS, MAX_FOLLOW_UPS, type InterviewState } from "@ailab/contracts";
import { queryClient, trpc, type InterviewGetData } from "../lib/trpc";
import { Button, Card, DifficultyBadge, ErrorBox, InlineError, Loading, ProgressBar, SegmentedControl } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { MessageBubble } from "../components/MessageBubble";
import { JudgeResultView } from "../components/JudgeResult";
import { POLL_INTERVAL_MS } from "../lib/judge";
import "./interview.css";

type Language = "cpp" | "python";
const LANG_LABELS: Record<Language, string> = { cpp: "C++", python: "Python" };

type MessageItem = InterviewGetData["messages"][number];

// 乐观渲染的本地消息使用负数 id，避免与后端自增 id 冲突
let tempId = -1;
function makeLocalMessage(
  sessionId: number,
  role: MessageItem["role"],
  content: string,
): MessageItem {
  return { id: tempId--, sessionId, questionId: null, role, content, createdAt: new Date() };
}

export default function InterviewPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return (
      <div className="itv pt-24">
        <ErrorBox error={new Error("无效的场次 ID")} />
      </div>
    );
  }
  return <InterviewRoom key={sessionId} sessionId={sessionId} />;
}

function InterviewRoom({ sessionId }: { sessionId: number }) {
  const navigate = useNavigate();
  const get = useQuery({
    ...trpc.interview.get.queryOptions({ sessionId }),
    // 服务端已标记 finished 但报告未落库时轮询，实时刷新生成进度
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.session.status === "finished" && !d.report ? 2000 : false;
    },
  });
  const [messages, setMessages] = useState<MessageItem[] | null>(null);
  const [stateOverride, setStateOverride] = useState<InterviewState | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // 首次拿到服务端消息后初始化本地消息流（之后的追加都走本地状态）
  useEffect(() => {
    if (get.data && messages === null) setMessages(get.data.messages);
  }, [get.data, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const reply = useMutation(
    trpc.interview.reply.mutationOptions({
      onSuccess: (res) => {
        setStateOverride(res.state);
        setMessages((m) => {
          const next = [
            ...(m ?? []),
            makeLocalMessage(sessionId, "interviewer", res.interviewerMessage),
          ];
          if (res.state.status === "finished") {
            next.push(
              makeLocalMessage(
                sessionId,
                "system",
                "本场面试已结束，感谢参与。评估报告生成后可在报告页查看。",
              ),
            );
          }
          return next;
        });
        if (res.state.status === "finished") queryClient.invalidateQueries();
      },
      onError: (err) => {
        setMessages((m) => [
          ...(m ?? []),
          makeLocalMessage(sessionId, "system", `发送失败：${err.message}，请重试。`),
        ]);
      },
    }),
  );

  const finish = useMutation(
    trpc.interview.finish.mutationOptions({
      onMutate: () => {
        // 服务端已先落库 finished，这里同步切换界面，报告生成期间不再等待
        const s = get.data?.session;
        if (!s) return;
        setStateOverride({
          sessionId,
          status: "finished",
          currentIndex: stateOverride?.currentIndex ?? s.currentIndex,
          followUpIndex: stateOverride?.followUpIndex ?? s.followUpIndex,
          totalQuestions: s.questionIds.length,
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries();
        navigate(`/report/${sessionId}`);
      },
      // 评估失败时面试也已结束：刷新缓存以同步真实状态
      onError: () => {
        queryClient.invalidateQueries();
      },
    }),
  );

  if (get.isLoading)
    return (
      <div className="itv pt-24">
        <Loading text="恢复面试现场…" />
      </div>
    );
  if (get.error)
    return (
      <div className="itv pt-24">
        <ErrorBox error={get.error} />
      </div>
    );
  if (!get.data) return null;

  const { session } = get.data;
  const msgs = messages ?? get.data.messages;

  const status = stateOverride?.status ?? session.status;
  const currentIndex = stateOverride?.currentIndex ?? session.currentIndex;
  const followUpIndex = stateOverride?.followUpIndex ?? session.followUpIndex;

  const total = session.questionIds.length;
  const currentQid = session.questionIds[currentIndex];
  const currentQ = currentQid != null ? get.data.questions[String(currentQid)] : undefined;
  const maxFollowUps = currentQ ? Math.min(currentQ.followUps.length, MAX_FOLLOW_UPS) : 0;
  const progressPct = status === "finished" ? 100 : Math.round((currentIndex / total) * 100);

  // 算法题 / leetgpu 题：切换为左右分栏（左题面 + 对话，右代码编辑器）
  const codeQ =
    status === "active" &&
    currentQ != null &&
    (currentQ.category === "leetcode" || currentQ.category === "cuda")
      ? currentQ
      : null;

  const sendContent = (raw: string) => {
    const content = raw.trim();
    if (!content || reply.isPending || status !== "active") return;
    setInput("");
    setMessages((m) => [...(m ?? get.data!.messages), makeLocalMessage(sessionId, "candidate", content)]);
    reply.mutate({ sessionId, content });
  };

  const send = () => sendContent(input);

  const confirmFinish = () => {
    if (window.confirm("确定结束本场面试并生成评估报告？生成可能需要数十秒。")) {
      finish.mutate({ sessionId });
    }
  };

  const messageFlow = (
    <div className="space-y-3">
      {msgs.map((m) => (
        <MessageBubble key={m.id} role={m.role} content={m.content} />
      ))}
      {reply.isPending && status !== "finished" && (
        <div className="flex justify-start">
          <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-2.5 text-sm text-muted shadow-soft">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-accent-600" />
            面试官正在输入…
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );

  const inputArea =
    status === "finished" ? (
      <Card className="py-6 text-center text-sm text-muted">
        本场面试已结束。
        {(() => {
          const progress = get.data.reportProgress;
          if (progress.stage === "done" || get.data.report) return null;
          if (progress.stage === "failed") {
            return <span className="mx-1">评估失败，可在报告页重新生成。</span>;
          }
          const detail =
            progress.stage === "rendering"
              ? "正在生成报告…"
              : progress.stage === "evaluating"
                ? "正在评估你的回答…"
                : "排队中";
          return <span className="mx-1">报告生成中（{detail}）</span>;
        })()}
        <Link to={`/report/${sessionId}`} className="ml-1 text-accent-600 transition-colors hover:text-accent-700">
          查看评估报告 →
        </Link>
      </Card>
    ) : (
      <Card>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="输入你的回答，可粘贴代码。点击「提交」发送。"
          className="input w-full font-mono"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted">仅点击「提交」按钮发送，回车不发送</span>
          <Button disabled={!input.trim() || reply.isPending} onClick={send}>
            {reply.isPending ? "提交中…" : "提交"}
          </Button>
        </div>
      </Card>
    );

  return (
    <div className="itv">
      {/* 标题区：与首页同款 hero（工作台紧凑版），进度与操作收纳于此 */}
      <section className="hero hero--slim">
        <div className="hero-inner">
          <div className="hero-eyebrow">
            {status === "active" && (
              <span className="mr-1.5 inline-block size-1.5 animate-pulse-dot rounded-full bg-accent-600 align-middle" />
            )}
            面试 · {status === "active" ? "进行中" : "已结束"}
          </div>
          <h1 className="hero-title">
            <span className="hero-title-accent">{session.title}</span>
          </h1>
          <p className="hero-subtitle">
            第 {Math.min(currentIndex + 1, total)}/{total} 题
            {maxFollowUps > 0
              ? ` · 追问 ${Math.min(followUpIndex, maxFollowUps)}/${maxFollowUps}`
              : " · 无预设追问"}
            {currentQ && status === "active" ? ` · 当前：${currentQ.title}` : ""}
          </p>
          <div className="itv-hero-extra">
            <ProgressBar value={progressPct} className="w-full max-w-xs" />
            {finish.error && <InlineError>结束失败：{finish.error.message}</InlineError>}
          </div>
          {status === "finished" ? (
            <div className="hero-actions">
              <Link to={`/report/${sessionId}`}>
                <Button>查看评估报告 →</Button>
              </Link>
            </div>
          ) : (
            <div className="hero-actions">
              <Button variant="danger" size="sm" disabled={finish.isPending} onClick={confirmFinish}>
                {finish.isPending ? "生成报告中…" : "结束本场"}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* 算法题 / leetgpu 题：左题面 + 对话，右代码编辑器 */}
      <main className="landing-main">
        <section className="animate-fade-up" style={{ animationDelay: "0.08s" }}>
          {codeQ ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <div className="min-w-0 space-y-4">
                {/* 题目描述 */}
                <Card>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-base font-semibold">{codeQ.title}</span>
                    <DifficultyBadge difficulty={codeQ.difficulty} />
                  </div>
                  <div className="max-h-none overflow-y-auto pr-1 sm:max-h-[45vh]">
                    <Markdown
                      text={codeQ.content}
                      className="space-y-2 text-sm leading-relaxed text-ink"
                    />
                  </div>
                </Card>
                {messageFlow}
                {inputArea}
              </div>
              <div className="min-w-0">
                {/* key=题 ID：换题时重置编辑器内容与评测状态 */}
                <CodeEditorCard
                  key={codeQ.id}
                  categoryLabel={CATEGORY_LABELS[codeQ.category]}
                  judgeProblemId={codeQ.judgeProblemId}
                  pending={reply.isPending}
                  onSubmit={sendContent}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messageFlow}
              {inputArea}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/**
 * 代码作答面板（内嵌评测器，2026-09-10 第六批）：右侧编辑器，提交后将代码作为
 * 考生消息发送；leetcode 同步题（judgeProblemId 非空）可直接在面试间内评测
 * ——语言切换 + 入队提交 + 轮询结果，AC 自动联动 user_progress（server 侧）。
 */
function CodeEditorCard({
  categoryLabel,
  judgeProblemId,
  pending,
  onSubmit,
}: {
  categoryLabel: string;
  judgeProblemId: string | null;
  pending: boolean;
  onSubmit: (code: string) => void;
}) {
  const [language, setLanguage] = useState<Language>("cpp");
  const [code, setCode] = useState<Record<Language, string>>({ cpp: "", python: "" });
  const [submissionId, setSubmissionId] = useState<number | null>(null);

  const problem = useQuery({
    ...trpc.judge.getProblem.queryOptions({ problemId: judgeProblemId ?? "" }),
    enabled: judgeProblemId != null,
  });

  // starter 填充（换题/拿到判题元数据后；编辑过的内容不覆盖——按题 remount 天然重置）
  useEffect(() => {
    if (!problem.data) return;
    setCode({ cpp: problem.data.cpp.starter ?? "", python: problem.data.python.starter ?? "" });
    if (!problem.data.cpp.available && problem.data.python.available) setLanguage("python");
  }, [problem.data]);

  const result = useQuery(
    trpc.judge.getResult.queryOptions(
      { submissionId: submissionId ?? 0 },
      {
        enabled: submissionId != null,
        refetchInterval: (query) => {
          const status = query.state.data?.status;
          return status == null || status === "pending" || status === "running"
            ? POLL_INTERVAL_MS
            : false;
        },
      },
    ),
  );

  const submitJudge = useMutation(
    trpc.judge.submit.mutationOptions({
      onSuccess: (data) => setSubmissionId(data.submissionId),
    }),
  );

  const judgeData = problem.data;
  // 可评测：有判题元数据且当前语言可用且有示例用例
  const judgable = judgeData != null && judgeData.examples.length > 0;
  const langAvailable = judgable && judgeData[language].available;
  const judgeRunning =
    submitJudge.isPending || result.data?.status === "pending" || result.data?.status === "running";

  const onJudge = () => {
    if (!judgeProblemId) return;
    setSubmissionId(null);
    submitJudge.mutate({ problemId: judgeProblemId, language, code: code[language] });
  };

  return (
    <Card className="lg:sticky lg:top-20">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-base font-semibold">代码作答</span>
        {judgable ? (
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={language}
              onChange={setLanguage}
              itemClassName="px-2.5 py-0.5 text-xs"
              options={(Object.keys(LANG_LABELS) as Language[]).map((l) => ({
                value: l,
                label: LANG_LABELS[l],
                disabled: !judgeData[l].available,
                title: judgeData[l].available ? undefined : (judgeData[l].reason ?? ""),
              }))}
            />
            <span className="text-xs text-muted">{categoryLabel} · 评测/提交均可用</span>
          </div>
        ) : (
          <span className="text-xs text-muted">{categoryLabel} · 提交后发送给面试官</span>
        )}
      </div>
      <textarea
        value={code[language]}
        onChange={(e) => setCode((prev) => ({ ...prev, [language]: e.target.value }))}
        spellCheck={false}
        placeholder="在这里编写你的代码…"
        className="input h-56 w-full resize-y font-mono text-xs leading-relaxed sm:h-[45vh]"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">思路讨论 / 追问回答请用左侧输入框</span>
        <div className="flex items-center gap-2">
          {judgable && (
            <Button
              variant="secondary"
              disabled={!langAvailable || judgeRunning || !code[language].trim()}
              onClick={onJudge}
            >
              {judgeRunning ? "评测中…" : "评测"}
            </Button>
          )}
          <Button disabled={!code[language].trim() || pending} onClick={() => onSubmit(code[language])}>
            {pending ? "发送中…" : "提交代码"}
          </Button>
        </div>
      </div>
      {submitJudge.error && (
        <p className="err-text mt-2 text-xs">{submitJudge.error.message}</p>
      )}
      {result.data && (
        <div className="mt-3 border-t border-line pt-3">
          <JudgeResultView result={result.data} />
        </div>
      )}
    </Card>
  );
}
