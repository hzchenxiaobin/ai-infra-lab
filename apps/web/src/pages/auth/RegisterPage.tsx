import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { queryClient, trpc } from "../../lib/trpc";
import { Button, Card } from "../../components/ui";

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const me = useQuery(trpc.auth.me.queryOptions());
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  useEffect(() => {
    if (countdown <= 0) return;
    timerRef.current = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [countdown]);

  const sendCode = useMutation(
    trpc.auth.sendCode.mutationOptions({
      onSuccess: () => setCountdown(60),
    }),
  );

  const register = useMutation(
    trpc.auth.register.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        navigate(from, { replace: true });
      },
    }),
  );

  // 已登录：直接回首页/来源页
  if (me.data?.user?.email != null) return <Navigate to={from} replace />;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <div className="text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[.22em] text-accent-600">
          Sign up
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">注册</h1>
        <p className="mt-2 text-sm text-muted">
          开放注册制；验证码发送有频次限制（每分钟 1 次 / 每日 20 次）。
        </p>
      </div>
      <Card className="space-y-4 p-6">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium text-muted">邮箱</label>
          <div className="flex gap-2">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input w-full"
              autoComplete="email"
            />
            <Button
              variant="secondary"
              className="shrink-0"
              disabled={!emailValid || countdown > 0 || sendCode.isPending}
              onClick={() => sendCode.mutate({ email: email.trim() })}
            >
              {sendCode.isPending
                ? "发送中…"
                : countdown > 0
                  ? `${countdown}s`
                  : "获取验证码"}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="code" className="text-xs font-medium text-muted">验证码</label>
          <input
            id="code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6 位数字"
            className="input w-full font-mono tracking-[0.4em]"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium text-muted">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
            className="input w-full"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-xs font-medium text-muted">昵称（可选）</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="默认取邮箱前缀"
            className="input w-full"
          />
        </div>
        {(sendCode.error || register.error) && (
          <p className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-sm text-red-600">
            {(sendCode.error ?? register.error)?.message}
          </p>
        )}
        <Button
          className="w-full py-2"
          disabled={!emailValid || code.length !== 6 || password.length < 8 || register.isPending}
          onClick={() =>
            register.mutate({
              email: email.trim(),
              code,
              password,
              ...(name.trim() ? { name: name.trim() } : {}),
            })
          }
        >
          {register.isPending ? "注册中…" : "注册并登录"}
        </Button>
        <p className="text-center text-xs text-muted">
          已有账号？
          <Link to="/login" className="ml-1 text-accent-600 hover:text-accent-700">登录</Link>
        </p>
      </Card>
    </div>
  );
}
