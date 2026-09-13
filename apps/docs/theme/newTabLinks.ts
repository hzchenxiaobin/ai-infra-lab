/**
 * 链接打开方式约定（docs 站）：
 * - 本分区内（同 origin 且路径在 vitepress base 下）：交给 vitepress 前端路由，同页切换；
 * - 其它一律新标签页：capture 阶段 preventDefault + window.open(_blank)，
 *   vitepress 的点击拦截见到 defaultPrevented 即放行（不再把站外链接当本区页面加载而 404）。
 * 例外：页内锚点（#...）、download、javascript: 协议保持原行为；带修饰键/非左键不干预。
 * 模块级幂等；SSR（node 无 window）下为空操作。
 */
let installed = false;

export function installNewTabLinks() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const base = import.meta.env.BASE_URL; // vitepress base，如 /learn/、/problems/
  window.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      const url = new URL(href, window.location.href);
      const internal = url.origin === window.location.origin && url.pathname.startsWith(base);
      if (internal) return; // 本分区页面：vitepress 路由同页切换
      e.preventDefault();
      window.open(url.href, "_blank", "noopener");
    },
    true,
  );
}
