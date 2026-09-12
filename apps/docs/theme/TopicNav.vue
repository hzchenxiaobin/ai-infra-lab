<script setup lang="ts">
// 顶栏专题导航：当前 topic 下其它 md 文档的紧凑链接（概览 / Day N），
// 数据来自 config.mts 的 themeConfig.topicDocs；完整标题放 tooltip。
// 仅在 /topics/{slug}/ 且该专题有 2 篇以上文档时渲染；当前页高亮。
// 链接为 docs 站内页面，走 vitepress 前端路由（不要加 target）。
import { computed } from "vue";
import { useData, useRoute, withBase } from "vitepress";

interface TopicDoc {
  text: string;
  short: string;
  link: string;
}

const route = useRoute();
const { theme } = useData();

const slug = computed(() => /\/topics\/([^/]+)\//.exec(route.path)?.[1] ?? "");

const docs = computed<TopicDoc[]>(() => {
  const all = (theme.value.topicDocs ?? {}) as Record<string, TopicDoc[]>;
  return all[slug.value] ?? [];
});

const current = computed(() => decodeURIComponent(route.path));
</script>

<template>
  <nav v-if="docs.length > 1" class="topic-nav" aria-label="本专题文档">
    <a
      v-for="d in docs"
      :key="d.link"
      :href="withBase(d.link)"
      :title="d.text"
      class="tn-link"
      :class="{ active: current === withBase(d.link) }"
    >
      {{ d.short }}
    </a>
  </nav>
</template>

<style scoped>
.topic-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 46vw;
  overflow-x: auto;
  scrollbar-width: none;
}

.topic-nav::-webkit-scrollbar {
  display: none;
}

.tn-link {
  flex: none;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  color: var(--vp-c-text-2);
  transition: color 0.2s ease, background-color 0.2s ease;
}

.tn-link:hover {
  color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.tn-link.active {
  color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
  font-weight: 600;
}

/* 移动端（nav-screen 菜单内）：允许换行铺开 */
@media (max-width: 767px) {
  .topic-nav {
    flex-wrap: wrap;
    max-width: none;
    overflow-x: visible;
  }
}
</style>
