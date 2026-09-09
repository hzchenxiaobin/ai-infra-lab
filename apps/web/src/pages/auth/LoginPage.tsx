import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { queryClient, trpc } from "../../lib/trpc";
import { Button, Card } from "../../components/ui";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        navigate("/");
      },
    }),
  );

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <div className="text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[.22em] text-accent-600">
          Sign in
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">登录</h1>
        <p className="mt-2 text-sm text-muted">邮箱登录后继续你的备战计划。</p>
      </div>
      <Card className="space-y-4 p-6">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium text-muted">邮箱</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input w-full"
            autoComplete="email"
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
            autoComplete="current-password"
          />
        </div>
        {login.error && (
          <p className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-sm text-red-600">
            {login.error.message}
          </p>
        )}
        <Button
          className="w-full py-2"
          disabled={!email.trim() || !password || login.isPending}
          onClick={() => login.mutate({ email: email.trim(), password })}
        >
          {login.isPending ? "登录中…" : "登录"}
        </Button>
        <p className="text-center text-xs text-muted">
          还没有账号？
          <Link to="/register" className="ml-1 text-accent-600 hover:text-accent-700">注册</Link>
        </p>
      </Card>
    </div>
  );
}
