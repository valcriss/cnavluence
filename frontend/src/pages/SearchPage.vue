<template>
  <section class="search-page scene">
    <header class="search-hero surface">
      <p class="eyebrow"><i class="fa-solid fa-compass" aria-hidden="true"></i>Recherche de connaissance</p>
      <h1>Rechercher dans votre espace</h1>
      <p class="subtitle">Recherche sur soumission, dans les titres et contenus, avec classement des resultats.</p>
    </header>

    <form class="search-shell surface" @submit.prevent="submit">
      <div class="search-main">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input v-model="query" placeholder="Rechercher dans les titres et contenus" />
        <button :disabled="loading"><i class="fa-solid fa-search" aria-hidden="true"></i>Rechercher</button>
      </div>
      <p class="search-context">
        <i class="fa-regular fa-folder-open" aria-hidden="true"></i>
        {{ selectedSpaceName ? `Dans ${selectedSpaceName}` : 'Dans les espaces accessibles' }}
      </p>
    </form>

    <section class="results-shell surface">
      <header class="results-header">
        <strong>Resultats</strong>
        <span>{{ items.length }} charges</span>
      </header>
      <SearchResults :items="items" />
      <p v-if="showEmptyState" class="empty-state">{{ emptyStateMessage }}</p>
    </section>

    <div v-if="showInfiniteScroll" ref="sentinel" class="sentinel">{{ loading ? 'Chargement de plus de resultats...' : 'Defiler pour en voir plus' }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import SearchResults from '../components/SearchResults.vue';
import { useInfiniteSearch } from '../composables/useInfiniteSearch';
import { api } from '../services/api';
import { useSpacesStore } from '../stores/spaces';
import type { SearchItem } from '../types/domain';

type SearchView = 'all' | 'starred' | 'templates' | 'drafts' | 'archives' | 'trash';

const route = useRoute();
const spacesStore = useSpacesStore();
const { query, items, loading, done, search, reset } = useInfiniteSearch();
const sentinel = ref<HTMLElement | null>(null);
const autoPaging = ref(false);
const currentView = computed<SearchView>(() => {
  const raw = route.query.view ?? route.query.scope;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'starred' || value === 'templates' || value === 'drafts' || value === 'archives' || value === 'trash') {
    return value;
  }
  return 'all';
});
const isStarredView = computed(() => currentView.value === 'starred');
const isArchivesView = computed(() => currentView.value === 'archives');
const isTrashView = computed(() => currentView.value === 'trash');
const showInfiniteScroll = computed(() => !isStarredView.value && !isArchivesView.value && !isTrashView.value && !done.value);
const showEmptyState = computed(() => {
  if (loading.value || items.value.length > 0) {
    return false;
  }
  return isStarredView.value || isArchivesView.value || isTrashView.value ? true : Boolean(query.value.trim());
});
const emptyStateMessage = computed(() => {
  if (isStarredView.value) {
    return 'Aucun document favori pour le moment.';
  }
  if (isArchivesView.value) {
    return 'Les archives sont vides.';
  }
  if (isTrashView.value) {
    return 'La corbeille est vide.';
  }
  return 'Aucun resultat pour cette recherche.';
});
const selectedSpaceName = computed(() => {
  const id = spacesStore.selectedSpaceId;
  if (!id) {
    return '';
  }
  return spacesStore.spaces.find((space) => space.id === id)?.name ?? '';
});

const readStarredIds = () => {
  try {
    const raw = window.localStorage.getItem('cnavluence:starred-pages');
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
};

const readTrashIds = () => {
  try {
    const raw = window.localStorage.getItem('cnavluence:trash-pages');
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
};

const toSearchItem = (
  pagePayload: { id: string; title: string; slug: string; spaceId: string; updatedAt?: string; archived: boolean; space?: { key?: string } },
  canonicalUrl: string,
): SearchItem => {
  const space =
    spacesStore.spaces.find((entry) => entry.id === pagePayload.spaceId) ??
    spacesStore.spaces.find((entry) => entry.key === (pagePayload.space?.key ?? ''));
  return {
    id: pagePayload.id,
    title: pagePayload.title,
    slug: pagePayload.slug,
    updatedAt: pagePayload.updatedAt ?? new Date().toISOString(),
    space: {
      id: space?.id ?? pagePayload.spaceId,
      key: space?.key ?? pagePayload.space?.key ?? '',
      name: space?.name ?? 'Espace',
    },
    snippet: pagePayload.title,
    canonicalUrl,
  };
};

const loadStarred = async () => {
  loading.value = true;
  reset();
  done.value = true;
  try {
    const starredIds = readStarredIds();
    if (!starredIds.length) {
      items.value = [];
      return;
    }

    const responses = await Promise.allSettled(
      starredIds.map(async (id) => {
        const response = await api.get(`/pages/${id}`);
        const page = response.data?.page as
          | { id: string; title: string; slug: string; spaceId: string; updatedAt?: string; archived: boolean; space?: { key?: string } }
          | undefined;
        const canonicalUrl = String(response.data?.canonicalUrl ?? '');
        if (!page || page.archived) {
          return null;
        }
        if (spacesStore.selectedSpaceId && page.spaceId !== spacesStore.selectedSpaceId) {
          return null;
        }
        return toSearchItem(page, canonicalUrl || `/space/${page.space?.key ?? ''}/pages/${page.id}-${page.slug}`);
      }),
    );

    const normalizedQuery = query.value.trim().toLowerCase();
    const resolved = responses
      .filter((entry): entry is PromiseFulfilledResult<SearchItem | null> => entry.status === 'fulfilled')
      .map((entry) => entry.value)
      .filter((entry): entry is SearchItem => Boolean(entry))
      .filter((entry) => (normalizedQuery ? entry.title.toLowerCase().includes(normalizedQuery) : true));

    items.value = resolved;
  } finally {
    loading.value = false;
  }
};

const loadTrash = async () => {
  loading.value = true;
  reset();
  done.value = true;
  try {
    const trashIds = readTrashIds();
    if (!trashIds.length) {
      items.value = [];
      return;
    }

    const responses = await Promise.allSettled(
      trashIds.map(async (id) => {
        const response = await api.get(`/pages/${id}`);
        const page = response.data?.page as
          | { id: string; title: string; slug: string; spaceId: string; updatedAt?: string; archived: boolean; space?: { key?: string } }
          | undefined;
        const canonicalUrl = String(response.data?.canonicalUrl ?? '');
        if (!page || !page.archived) {
          return null;
        }
        if (spacesStore.selectedSpaceId && page.spaceId !== spacesStore.selectedSpaceId) {
          return null;
        }
        return toSearchItem(page, canonicalUrl || `/space/${page.space?.key ?? ''}/pages/${page.id}-${page.slug}`);
      }),
    );

    const normalizedQuery = query.value.trim().toLowerCase();
    const resolved = responses
      .filter((entry): entry is PromiseFulfilledResult<SearchItem | null> => entry.status === 'fulfilled')
      .map((entry) => entry.value)
      .filter((entry): entry is SearchItem => Boolean(entry))
      .filter((entry) => (normalizedQuery ? entry.title.toLowerCase().includes(normalizedQuery) : true));

    items.value = resolved;
  } finally {
    loading.value = false;
  }
};

const loadArchives = async () => {
  loading.value = true;
  reset();
  done.value = true;
  try {
    const response = await api.get('/pages/archived', {
      params: {
        spaceId: spacesStore.selectedSpaceId ?? undefined,
      },
    });
    const archivedPages = Array.isArray(response.data?.pages) ? response.data.pages : [];
    const trashIds = new Set(readTrashIds());
    const normalizedQuery = query.value.trim().toLowerCase();
    const resolved = archivedPages
      .filter(
        (entry: { id?: string; title?: string }) =>
          typeof entry?.id === 'string' &&
          typeof entry?.title === 'string' &&
          !trashIds.has(entry.id),
      )
      .filter((entry: { title: string }) => (normalizedQuery ? entry.title.toLowerCase().includes(normalizedQuery) : true))
      .map(
        (entry: {
          id: string;
          title: string;
          slug: string;
          updatedAt?: string;
          archived: boolean;
          space: { id: string; key: string; name: string };
          snippet?: string;
          canonicalUrl: string;
        }): SearchItem => ({
          id: entry.id,
          title: entry.title,
          slug: entry.slug,
          updatedAt: entry.updatedAt ?? new Date().toISOString(),
          space: entry.space,
          snippet: entry.snippet ?? entry.title,
          canonicalUrl: entry.canonicalUrl,
        }),
      );

    items.value = resolved;
  } finally {
    loading.value = false;
  }
};

const submit = async () => {
  if (isStarredView.value) {
    await loadStarred();
    return;
  }
  if (isArchivesView.value) {
    await loadArchives();
    return;
  }
  if (isTrashView.value) {
    await loadTrash();
    return;
  }
  reset();
  await search(spacesStore.selectedSpaceId ?? undefined);
};

const isSentinelVisible = () => {
  if (!sentinel.value) {
    return false;
  }
  const rect = sentinel.value.getBoundingClientRect();
  return rect.top <= window.innerHeight && rect.bottom >= 0;
};

const maybeLoadMoreIfVisible = async () => {
  if (isStarredView.value || isArchivesView.value || isTrashView.value || autoPaging.value || loading.value || done.value || !query.value.trim() || !isSentinelVisible()) {
    return;
  }
  autoPaging.value = true;
  try {
    await search(spacesStore.selectedSpaceId ?? undefined);
  } finally {
    autoPaging.value = false;
  }
};

onMounted(() => {
  const observer = new IntersectionObserver(async (entries) => {
    const target = entries[0];
    if (target.isIntersecting && !isStarredView.value && !isArchivesView.value && !isTrashView.value && !loading.value && !done.value && query.value.trim()) {
      await search(spacesStore.selectedSpaceId ?? undefined);
    }
  });

  watch(
    sentinel,
    (element) => {
      if (element) {
        observer.observe(element);
      }
    },
    { immediate: true },
  );

  watch(
    () => [items.value.length, loading.value, done.value, query.value],
    async () => {
      await maybeLoadMoreIfVisible();
    },
    { flush: 'post' },
  );

  watch(
    () => [currentView.value, spacesStore.selectedSpaceId],
    async () => {
      if (isStarredView.value) {
        await loadStarred();
      } else if (isArchivesView.value) {
        await loadArchives();
      } else if (isTrashView.value) {
        await loadTrash();
      }
    },
    { immediate: true },
  );
});

</script>

<style scoped>
.search-page {
  padding-bottom: 0.65rem;
}

.search-hero {
  padding: 1rem 1.05rem;
  background:
    radial-gradient(130% 160% at 0% 0%, rgba(3, 102, 214, 0.09) 0%, rgba(3, 102, 214, 0) 65%),
    #fff;
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.search-hero h1 {
  margin: 0;
  font-size: 1.34rem;
}

.subtitle {
  margin: 0.35rem 0 0;
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.search-shell {
  padding: 0.65rem;
}

.search-main {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.55rem;
  padding: 0.22rem 0.3rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}

.search-main > i {
  color: var(--muted);
  margin-left: 0.25rem;
}

.search-main input {
  border: none;
  background: transparent;
  box-shadow: none;
  padding-left: 0;
}

.search-main input:focus {
  outline: none;
}

.search-main button {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.search-main button:hover {
  background: var(--accent-strong);
}

.search-context {
  margin: 0.5rem 0 0.1rem;
  color: var(--muted);
  font-size: 0.82rem;
}

.results-shell {
  overflow: hidden;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.72rem 0.9rem;
  border-bottom: 1px solid var(--line);
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.empty-state {
  margin: 0;
  padding: 1.1rem 0.9rem;
  color: var(--muted);
  font-size: 0.9rem;
  border-top: 1px solid var(--line);
}

.sentinel {
  text-align: center;
  color: var(--text-secondary);
  padding: 0.75rem;
  font-size: 0.84rem;
}
</style>
