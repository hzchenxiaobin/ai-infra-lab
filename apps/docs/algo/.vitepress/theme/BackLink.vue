<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, withBase } from 'vitepress'

const route = useRoute()
// 新 URL 布局：/algo/... /contest/... /lists/...（原 leetcode 为 /solution/...）
const targets: Record<string, { label: string; link: string }> = {
  algo: { label: '题解', link: '/solutions.html' },
  contest: { label: '周赛', link: '/contests.html' },
  lists: { label: '题单', link: '/lists.html' }
}
const target = computed(() => targets[route.path.match(/^\/(algo|contest|lists)\//)?.[1] ?? ''])
</script>

<template>
  <nav v-if="target" class="back-nav">
    <a :href="withBase(target.link)">← 返回 {{ target.label }}列表</a>
  </nav>
</template>

<style scoped>
.back-nav { margin-bottom: 20px; }
.back-nav a {
  font-size: .88rem;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color .2s;
}
.back-nav a:hover { color: var(--vp-c-brand-1); }
</style>
