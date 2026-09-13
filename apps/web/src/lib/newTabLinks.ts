/**
 * 链接打开方式约定（主站 SPA）：
 * - 应用内路由（同 origin 且非 docs 路径）：交给 react-router，同页切换；
 * - docs 站路径与同 origin 静态页、跨域链接：新标签页打开
 *   （capture 阶段 preventDefault + window.open；react-router 见到 defaultPrevented 即放行）。
 * 例外：页内锚点（#...）、download、javascript: 协议保持原行为；带修饰键/非左键不干预。
 * 模块级幂等。
 */
let installed = false;

/** docs 站（vitepress 三分区）路径：/learn/...、/problems/<分区>/...、*.html 静态页 */
function isDocsPath(pathname: string): boolean {
  if (pathname.endsWith(".html")) return true;
  if (pathname.startsWith("/learn/")) return true;
  if (/^\/problems\/(algo|gpu|contest)\//.test(pathname)) return true;
  return pathname === "/problems" || pathname === "/problems/";
}

export function installNewTabLinks() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      const url = new URL(href, window.location.href);
      const internal = url.origin === window.location.origin && !isDocsPath(url.pathname);
      if (internal) return; // 应用内路由：react-router 同页切换
      e.preventDefault();
      window.open(url.href, "_blank", "noopener");
    },
    true,
  );
}
