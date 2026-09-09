<script setup lang="ts">
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import { data } from '../data/solutions.data'

const keyword = ref('')

const diffIcon = { easy: '🟢', medium: '🟡', hard: '🔴', '': '' } as const

/** 按题号区间分组（0001-0100 ……） */
const groups = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const matched = kw
    ? data.filter(p =>
        p.title.toLowerCase().includes(kw) ||
        String(p.num).includes(kw) ||
        p.tags.toLowerCase().includes(kw))
    : data
  const map = new Map<string, typeof matched>()
  for (const p of matched) {
    const list = map.get(p.range) ?? []
    list.push(p)
    map.set(p.range, list)
  }
  return [...map.entries()].map(([range, list]) => ({ range, list }))
})
</script>

<template>
  <div class="pl-wrap">
    <h1 class="pl-title">📚 每日一题 · 全部题解</h1>
    <p class="pl-desc">按题号升序 · 共 {{ data.length }} 题</p>
    <input
      v-model="keyword"
      class="pl-search"
      type="search"
      placeholder="搜索题号、标题或标签…"
    />
    <div v-for="g in groups" :key="g.range" class="pl-group">
      <details :open="!!keyword.trim()">
        <summary class="pl-range">{{ g.range }} <span class="pl-count">{{ g.list.length }} 题</span></summary>
        <div class="pl-list">
          <a v-for="p in g.list" :key="p.url" :href="withBase(p.url)" class="pl-card">
            <span class="pl-num">#{{ p.num }}</span>
            <span class="pl-body">
              <span class="pl-name">{{ diffIcon[p.diff] }} {{ p.title }}</span>
              <span v-if="p.tags" class="pl-tags">{{ p.tags }}</span>
            </span>
            <span class="pl-arrow">→</span>
          </a>
        </div>
      </details>
    </div>
    <p v-if="!groups.length" class="pl-empty">无法找到相关题目</p>
  </div>
</template>

<style scoped>
.pl-wrap { max-width: 1024px; margin: 0 auto; padding: 48px 24px 64px; }
.pl-title { font-size: 2rem; font-weight: 700; margin: 0 0 8px; color: var(--vp-c-text-1); }
.pl-desc { color: var(--vp-c-text-2); margin: 0 0 24px; }
.pl-search {
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 24px;
  padding: 10px 16px;
  font-size: .95rem;
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  outline: none;
  transition: border-color .2s;
}
.pl-search:focus { border-color: var(--vp-c-brand-1); }
.pl-group { margin-bottom: 8px; }
.pl-range {
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  color: var(--vp-c-text-1);
  padding: 10px 4px;
}
.pl-count { font-size: .85rem; font-weight: 400; color: var(--vp-c-text-3); margin-left: 6px; }
.pl-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.pl-card {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  text-decoration: none;
  transition: border-color .2s, background-color .2s, transform .15s;
}
.pl-card:hover {
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-bg-soft);
  transform: translateX(4px);
}
.pl-num {
  flex-shrink: 0;
  font-family: var(--vp-font-family-mono);
  font-size: .9rem; font-weight: 600;
  color: var(--vp-c-brand-1);
  min-width: 44px;
}
.pl-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pl-name { font-weight: 600; color: var(--vp-c-text-1); }
.pl-tags {
  font-size: .8rem; color: var(--vp-c-text-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pl-arrow { margin-left: auto; color: var(--vp-c-text-3); transition: color .2s; }
.pl-card:hover .pl-arrow { color: var(--vp-c-brand-1); }
.pl-empty { color: var(--vp-c-text-3); text-align: center; padding: 48px 0; }
</style>
