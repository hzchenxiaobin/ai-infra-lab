import { Link, Outlet, useLocation } from "react-router";
import "../pages/landing.css";

// 落地壳：刷题板块共用首页落地页的独立壳（自带导航/页脚，GitHub 暗色 + 蓝强调），
// 页面内容经 <Outlet /> 注入；反馈组件（加载/出错/空态，样式见 problems.css）供板块内页面复用。

const GITHUB_URL = "https://github.com/hzchenxiaobin/ai-infra-notes";

const NAV_LINKS = [
  { to: "/learn", label: "10 周计划" },
  { to: "/problems/algo", label: "刷题" },
  { to: "/problems/lists", label: "题单" },
  { to: "/problems/contest", label: "周赛" },
  { to: "/start", label: "面试" },
] as const;

// 「刷题」覆盖 /problems 下除题单/周赛外的全部路径（含 GPU 分区）
function navLinkClass(pathname: string, to: string) {
  const active =
    to === "/problems/algo"
      ? pathname.startsWith("/problems/") &&
        !pathname.startsWith("/problems/lists") &&
        !pathname.startsWith("/problems/contest")
      : pathname.startsWith(to);
  return active ? "is-active" : undefined;
}

export function LandingShell() {
  const { pathname } = useLocation();
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link className="landing-nav-brand" to="/">
          AI Infra <span>Notes</span>
        </Link>
        <nav className="landing-nav-links">
          {NAV_LINKS.map((item) => (
            <Link key={item.to} to={item.to} className={navLinkClass(pathname, item.to)}>
              {item.label}
            </Link>
          ))}
          <a className="landing-nav-github" href={GITHUB_URL}>
            GitHub ↗
          </a>
        </nav>
      </header>
      <Outlet />
      <footer className="landing-footer">
        <span>
          AI Infra Notes · 由 <a href={GITHUB_URL}>GitHub</a> 驱动 · Deployed on GitHub Pages
        </span>
      </footer>
    </div>
  );
}

export function LandingLoading({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="landing-loading">
      <span className="landing-spinner" />
      {text}
    </div>
  );
}

export function LandingError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <div className="landing-error">出错了：{message}</div>;
}

export function LandingEmpty({ text }: { text: string }) {
  return <div className="landing-empty">{text}</div>;
}
