<script setup lang="ts">
// docs 顶栏右侧：主站快捷入口（对齐主站导航：刷题 / 面试 / 搜索；题库已归入面试板块）。
// 注意必须用原生 <a href="/...">：vitepress 的 nav link 会被加上 base（/learn/）前缀，
// 跳主站 SPA 路由（/problems/algo 等）需要裸路径；
// 全站约定所有链接新标签页打开（theme/newTabLinks.ts 的 capture 拦截统一处理）。
const APP_LINKS = [
  { text: "刷题", href: "/problems/algo" },
  { text: "面试", href: "/start" },
  { text: "全站搜索", href: "/search" },
];
</script>

<template>
  <nav class="docs-app-links" aria-label="主站入口">
    <a v-for="l in APP_LINKS" :key="l.href" :href="l.href" target="_blank" rel="noopener" class="docs-app-link">{{ l.text }}</a>
  </nav>
</template>

<style scoped>
.docs-app-links {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  padding-left: 14px;
  border-left: 1px solid var(--vp-c-divider);
}

.docs-app-link {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  color: var(--vp-c-text-2);
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.docs-app-link:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

/* 移动端（nav-screen 菜单内）：竖排堆叠 */
@media (max-width: 767px) {
  .docs-app-links {
    flex-wrap: wrap;
    margin-left: 0;
    padding-left: 0;
    border-left: none;
  }
}
</style>
