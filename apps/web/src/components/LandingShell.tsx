import { Link, Outlet, useLocation } from "react-router";
import "../pages/landing.css";

// 落地壳：刷题板块共用首页落地页的独立壳（自带导航/页脚，GitHub 暗色 + 蓝强调），
// 页面内容经 <Outlet /> 注入；反馈组件（加载/出错/空态，样式见 problems.css）供板块内页面复用。

const GITHUB_URL = "https://github.com/hzchenxiaobin/ai-infra-notes";

// 导航项：to/label + 自定义激活匹配（默认前缀匹配；「刷题」覆盖 /problems 下除题单/周赛
// 外的全部路径，「面试」覆盖组卷/面试间/报告整个流程，「题库」连带评测页）
const NAV_LINKS = [
  { to: "/learn", label: "10 周计划", match: (p: string) => p.startsWith("/learn") },
  {
    to: "/problems/algo",
    label: "刷题",
    match: (p: string) =>
      p.startsWith("/problems/") &&
      !p.startsWith("/problems/lists") &&
      !p.startsWith("/problems/contest"),
  },
  { to: "/problems/lists", label: "题单", match: (p: string) => p.startsWith("/problems/lists") },
  {
    to: "/problems/contest",
    label: "周赛",
    match: (p: string) => p.startsWith("/problems/contest"),
  },
  {
    to: "/start",
    label: "面试",
    match: (p: string) =>
      p.startsWith("/start") || p.startsWith("/interview/") || p.startsWith("/report/"),
  },
  {
    to: "/bank",
    label: "题库",
    match: (p: string) => p.startsWith("/bank") || p.startsWith("/judge/"),
  },
  { to: "/history", label: "历史", match: (p: string) => p.startsWith("/history") },
  { to: "/notes", label: "笔记", match: (p: string) => p.startsWith("/notes") },
] as const;

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
            <Link key={item.to} to={item.to} className={item.match(pathname) ? "is-active" : undefined}>
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
