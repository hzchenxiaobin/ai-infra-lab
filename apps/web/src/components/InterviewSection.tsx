import { NavLink, Outlet } from "react-router";
import { SEGMENTED_CLASS, segmentedItemClass } from "../lib/segmented";

// ---------------------------------------------------------------------------
// 面试板块子导航：开始面试 / 题库 / 历史 / 复盘笔记（题库与历史归属面试域，不占顶部主导航）。
// 作为 /start、/bank、/history、/notes 四个路由的嵌套布局渲染。
// ---------------------------------------------------------------------------

const TABS = [
  { to: "/start", label: "开始面试", end: true },
  { to: "/bank", label: "题库", end: false },
  { to: "/history", label: "历史", end: false },
  { to: "/notes", label: "复盘笔记", end: false },
];

export function InterviewSection() {
  return (
    <div className="space-y-8">
      <div className="flex">
        <div className={SEGMENTED_CLASS}>
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `rounded-full px-3 py-1 text-sm ${segmentedItemClass(isActive)}`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
