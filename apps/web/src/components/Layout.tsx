import { NavLink, Outlet, useLocation } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { queryClient, trpc } from "../lib/trpc";
import { SEGMENTED_CLASS, segmentedItemClass } from "../lib/segmented";
import { buttonClass } from "../lib/button";

const NAV_ITEMS = [
  { to: "/", label: "首页", end: true },
  // 首页改为落地页后，学习路径页（原首页内容）仍需在应用内一键可达
  { to: "/learn", label: "学习", end: false },
  { to: "/start", label: "面试", end: false },
  { to: "/problems/algo", label: "刷题", end: false },
  { to: "/dashboard", label: "个人中心", end: false },
  { to: "/search", label: "搜索", end: false },
];

export function Layout() {
  // 遗留单用户（email 为 NULL）视为未登录，展示「登录」入口
  const me = useQuery(trpc.auth.me.queryOptions());
  const logout = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );
  const user = me.data?.user;
  const loggedIn = user?.email != null;
  // 复盘笔记是三栏文档布局，放宽页面容器以利用两侧空间；其余页面保持 max-w-7xl
  const { pathname } = useLocation();
  const containerCls = pathname.startsWith("/notes") ? "max-w-[1760px]" : "max-w-7xl";

  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur">
        <div className={`mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 ${containerCls}`}>
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="size-[18px] rounded-[5px] bg-accent-600" />
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight">AIInfra Lab</span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[.24em] text-muted">
                Learn · Practice · Interview
              </span>
            </span>
          </NavLink>
          <nav
            className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${SEGMENTED_CLASS}`}
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `shrink-0 rounded-full px-4 py-1.5 text-sm ${segmentedItemClass(isActive)}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="shrink-0 text-sm">
            {me.isLoading ? null : loggedIn ? (
              <div className="flex items-center gap-3">
                <span className="max-w-28 truncate text-sm font-medium" title={user.email ?? undefined}>
                  {user.name}
                </span>
                <button
                  type="button"
                  onClick={() => logout.mutate()}
                  className={buttonClass("ghost", "sm")}
                >
                  退出
                </button>
              </div>
            ) : (
              <Link to="/login" className={buttonClass("primary", "sm")}>
                登录
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className={`mx-auto px-4 py-10 sm:px-6 ${containerCls}`}>
        <Outlet />
      </main>
    </div>
  );
}
