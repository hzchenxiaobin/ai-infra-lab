import { NavLink, Outlet } from "react-router";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/bank", label: "题库", end: false },
  { to: "/history", label: "历史", end: false },
];

export function Layout() {
  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span className="size-[18px] rounded-[5px] bg-accent-600" />
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight">模拟面试</span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">
                Mock Interview
              </span>
            </span>
          </NavLink>
          <nav className="flex gap-0.5 rounded-full bg-divider p-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-1.5 text-[13px] transition-colors duration-150 ${
                    isActive
                      ? "bg-ink font-medium text-white"
                      : "text-muted hover:text-ink"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
