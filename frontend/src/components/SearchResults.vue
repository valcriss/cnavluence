<template>
  <div class="results">
    <article v-for="item in items" :key="item.id" class="card" :data-item-id="item.id">
      <RouterLink :to="item.canonicalUrl" class="title-link"><h3>{{ item.title }}</h3></RouterLink>
      <p class="meta">
        <i class="fa-regular fa-folder" aria-hidden="true"></i>{{ item.space.name }}
        <i class="fa-regular fa-clock" aria-hidden="true"></i>{{ item.updatedAt }}
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <p class="snippet" v-html="renderSnippet(item.snippet)"></p>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { SearchItem } from '../types/domain';

defineProps<{
  items: SearchItem[];
}>();

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const renderSnippet = (snippet: string) => escapeHtml(snippet)
  .replaceAll('&lt;mark&gt;', '<mark>')
  .replaceAll('&lt;/mark&gt;', '</mark>');
</script>

<style scoped>
.results {
  display: grid;
  gap: 0;
}

.card {
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  padding: 0.86rem 0.95rem;
}

h3 {
  margin: 0 0 0.25rem;
  font-size: 0.98rem;
  font-weight: 600;
}

.meta {
  color: var(--muted);
  font-size: 0.79rem;
  margin: 0 0 0.3rem;
  display: flex;
  align-items: center;
  gap: 0.58rem;
}

.title-link {
  color: var(--ink);
}

.title-link:hover {
  color: var(--accent-strong);
  text-decoration: none;
}

.snippet {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.86rem;
  line-height: 1.5;
}

.snippet :deep(mark) {
  background: #fdea9b;
  color: inherit;
  border-radius: 3px;
  padding: 0 0.12rem;
}
</style>
