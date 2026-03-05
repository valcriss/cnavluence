<template>
  <div class="timeline">
    <article v-for="log in logs" :key="log.id" class="timeline-item">
      <header class="item-header">
        <span class="event-badge">{{ formatEvent(log.eventType) }}</span>
        <time class="event-time">{{ formatTime(log.at) }}</time>
      </header>

      <p class="meta">
        <span>
          <i class="fa-regular fa-user" aria-hidden="true"></i>
          {{ log.actor?.displayName ?? 'Systeme' }}
        </span>
        <span v-if="log.space?.name">
          <i class="fa-regular fa-folder-open" aria-hidden="true"></i>
          {{ log.space.name }}
        </span>
        <span v-if="log.page?.title">
          <i class="fa-regular fa-file-lines" aria-hidden="true"></i>
          {{ log.page.title }}
        </span>
      </p>

      <details v-if="log.before || log.after" class="details">
        <summary>Voir le detail des changements</summary>
        <div class="payload-grid">
          <section v-if="log.before">
            <h4>Avant</h4>
            <pre>{{ stringify(log.before) }}</pre>
          </section>
          <section v-if="log.after">
            <h4>Apres</h4>
            <pre>{{ stringify(log.after) }}</pre>
          </section>
        </div>
      </details>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { AuditLogEntry } from '../types/domain';

defineProps<{
  logs: AuditLogEntry[];
}>();

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const formatEvent = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const stringify = (value: unknown) => JSON.stringify(value, null, 2);
</script>

<style scoped>
.timeline {
  display: grid;
  gap: 0.8rem;
}

.timeline-item {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  padding: 0.8rem 0.9rem;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.event-badge {
  background: #deebff;
  color: var(--accent-strong);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.78rem;
  font-weight: 600;
}

.event-time {
  color: var(--muted);
  font-size: 0.82rem;
}

.meta {
  margin: 0.45rem 0 0;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.7rem;
  font-size: 0.86rem;
  flex-wrap: wrap;
}

.details {
  margin-top: 0.6rem;
}

.details summary {
  cursor: pointer;
  color: var(--accent-strong);
  font-size: 0.86rem;
}

.payload-grid {
  margin-top: 0.45rem;
  display: grid;
  gap: 0.6rem;
}

.payload-grid h4 {
  margin: 0 0 0.2rem;
  font-size: 0.8rem;
  color: #44546f;
}

.payload-grid pre {
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.55rem;
  background: #f7f8fa;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.76rem;
  line-height: 1.45;
}
</style>
