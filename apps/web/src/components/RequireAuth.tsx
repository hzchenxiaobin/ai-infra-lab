import { Navigate, Outlet, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import { Loading } from "./ui";

/**
 * 主动路由守卫（dev/web.md §3 补齐）：未登录直接跳登录页，不再依赖
 * "authedProcedure 401 → 全局跳转" 的被动兜底（避免页面先闪空态）。
 * 登录态判定与 Layout 一致：遗留单用户（email 为 NULL）视为未登录。
 */
export function RequireAuth() {
  const location = useLocation();
  const me = useQuery(trpc.auth.me.queryOptions());

  if (me.isLoading) return <Loading text="检查登录状态…" />;
  const user = me.data?.user;
  if (me.error || !user || user.email == null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}
