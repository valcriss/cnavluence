<template>
  <section class="audit-page scene">
    <header class="page-header surface">
      <h1><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>Journal d audit</h1>
      <p>Suivez les evenements de pages, permissions et versions par espace, page et periode.</p>
    </header>

    <form class="filters surface" @submit.prevent="loadLogs">
      <label>
        Espace
        <select v-model="spaceId">
          <option v-if="isSiteAdmin" value="">Tous les espaces</option>
          <option v-for="space in spacesStore.spaces" :key="space.id" :value="space.id">
            {{ space.name }}
          </option>
        </select>
      </label>

      <label>
        Page
        <select v-model="pageId" :disabled="!spaceId">
          <option value="">Toutes les pages</option>
          <option v-for="page in availablePages" :key="page.id" :value="page.id">
            {{ page.title }}
          </option>
        </select>
      </label>

      <label>
        Du
        <input v-model="fromDate" type="date" />
      </label>

      <label>
        Au
        <input v-model="toDate" type="date" />
      </label>

      <div class="actions">
        <button :disabled="loading" type="submit">
          <i class="fa-solid fa-filter" aria-hidden="true"></i>Appliquer les filtres
        </button>
        <button :disabled="loading" type="button" @click="resetFilters">
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Reinitialiser
        </button>
      </div>
    </form>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-else-if="!loading && logs.length === 0" class="empty">Aucun evenement trouve pour ces filtres.</p>
    <p v-if="loading" class="loading">Chargement du journal d audit...</p>

    <AuditTimeline v-if="!loading && logs.length > 0" :logs="logs" />
    <div v-if="nextCursor" ref="sentinel" class="audit-sentinel">{{ loadingMore ? 'Chargement...' : 'Defiler pour en voir plus' }}</div>
  </section>
</template>

<script setup lang="ts">
import axios from 'axios';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import AuditTimeline from '../components/AuditTimeline.vue';
import { useSpacesStore } from '../stores/spaces';
import { usePagesStore } from '../stores/pages';
import { useAuthStore } from '../stores/auth';
import { api } from '../services/api';
import type { AuditLogEntry } from '../types/domain';

const spacesStore = useSpacesStore();
const pagesStore = usePagesStore();
const authStore = useAuthStore();

const isSiteAdmin = computed(() => authStore.user?.siteRole === 'SITE_ADMIN');
const spaceId = ref(spacesStore.selectedSpaceId ?? '');
const pageId = ref('');
const fromDate = ref('');
const toDate = ref('');
const logs = ref<AuditLogEntry[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const errorMessage = ref('');
const nextCursor = ref<string | null>(null);
const sentinel = ref<HTMLElement | null>(null);

const PAGE_SIZE = 20;
let sentinelObserver: IntersectionObserver | null = null;

const availablePages = computed(() => {
  if (!spaceId.value) {
    return [];
  }
  return [...pagesStore.tree].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
});

const buildDateFrom = (date: string): string => new Date(`${date}T00:00:00`).toISOString();
const buildDateTo = (date: string): string => new Date(`${date}T23:59:59.999`).toISOString();

const loadPages = async () => {
  if (!spaceId.value) {
    return;
  }
  await pagesStore.fetchTree(spaceId.value);
};

const buildQueryParams = (cursor?: string): Record<string, string | number> => {
  const params: Record<string, string | number> = { limit: PAGE_SIZE };
  if (spaceId.value) {
    params.spaceId = spaceId.value;
  }
  if (pageId.value) {
    params.pageId = pageId.value;
  }
  if (fromDate.value) {
    params.from = buildDateFrom(fromDate.value);
  }
  if (toDate.value) {
    params.to = buildDateTo(toDate.value);
  }
  if (cursor) {
    params.cursor = cursor;
  }
  return params;
};

const mergeLogs = (current: AuditLogEntry[], incoming: AuditLogEntry[]): AuditLogEntry[] => {
  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
};

const loadLogs = async () => {
  if (!spaceId.value && !isSiteAdmin.value) {
    errorMessage.value = 'Selectionnez un espace pour consulter les evenements d audit.';
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  nextCursor.value = null;

  try {
    const response = await api.get('/audit', { params: buildQueryParams() });
    logs.value = response.data.logs as AuditLogEntry[];
    nextCursor.value = (response.data.nextCursor as string | null) ?? null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de charger le journal d audit');
    } else {
      errorMessage.value = 'Impossible de charger le journal d audit';
    }
    logs.value = [];
    nextCursor.value = null;
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (!nextCursor.value || loading.value || loadingMore.value) {
    return;
  }

  loadingMore.value = true;
  errorMessage.value = '';

  try {
    const response = await api.get('/audit', { params: buildQueryParams(nextCursor.value) });
    const incoming = response.data.logs as AuditLogEntry[];
    logs.value = mergeLogs(logs.value, incoming);
    nextCursor.value = (response.data.nextCursor as string | null) ?? null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de charger le journal d audit');
    } else {
      errorMessage.value = 'Impossible de charger le journal d audit';
    }
  } finally {
    loadingMore.value = false;
  }
};

const resetFilters = async () => {
  spaceId.value = spacesStore.selectedSpaceId ?? '';
  pageId.value = '';
  fromDate.value = '';
  toDate.value = '';
  await loadPages();
  await loadLogs();
};

watch(spaceId, async () => {
  pageId.value = '';
  await loadPages();
});

onMounted(async () => {
  sentinelObserver = new IntersectionObserver(async (entries) => {
    const [entry] = entries;
    if (!entry?.isIntersecting || loading.value || loadingMore.value || !nextCursor.value) {
      return;
    }
    await loadMore();
  });

  watch(
    sentinel,
    (element, previousElement) => {
      if (previousElement && sentinelObserver) {
        sentinelObserver.unobserve(previousElement);
      }
      if (element && sentinelObserver) {
        sentinelObserver.observe(element);
      }
    },
    { immediate: true },
  );

  if (!spacesStore.spaces.length) {
    await spacesStore.fetchSpaces();
  }

  if (!spaceId.value && !isSiteAdmin.value && spacesStore.spaces.length > 0) {
    spaceId.value = spacesStore.spaces[0].id;
  }

  await loadPages();
  await loadLogs();
});

onUnmounted(() => {
  if (sentinelObserver) {
    sentinelObserver.disconnect();
    sentinelObserver = null;
  }
});
</script>

<style scoped>
.audit-page {
  display: grid;
  gap: 0.9rem;
}

.page-header {
  padding: 1rem;
}

.page-header h1 {
  margin: 0;
  font-size: 1.2rem;
}

.page-header p {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.filters {
  padding: 0.9rem;
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  align-items: end;
}

label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.84rem;
  color: #44546f;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.error {
  margin: 0;
  color: var(--danger);
}

.empty,
.loading {
  margin: 0;
  padding: 0.9rem;
  border: 1px dashed var(--line-strong);
  border-radius: 8px;
  background: var(--paper);
  color: var(--muted);
  text-align: center;
}

.audit-sentinel {
  text-align: center;
  color: var(--muted);
  padding: 0.9rem;
  font-size: 0.9rem;
}

@media (max-width: 780px) {
  .actions {
    grid-column: 1 / -1;
    flex-direction: column;
  }
}
</style>
