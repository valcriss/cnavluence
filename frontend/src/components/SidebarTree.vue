<template>
  <aside class="sidebar">
    <RouterLink :to="settingsEntryPath" class="profile-link">
      <span class="avatar">{{ workspaceInitial }}</span>
      <span class="profile-meta">
        <strong>{{ workspaceName }}</strong>
        <small>{{ userLabel }}</small>
      </span>
    </RouterLink>

    <nav class="section nav-main" aria-label="Principal">
      <RouterLink to="/home" class="nav-item" :class="{ active: isHomeActive }">
        <i class="fa-solid fa-house" aria-hidden="true"></i>Accueil
      </RouterLink>
      <RouterLink :to="{ path: '/search', query: { view: 'all' } }" class="nav-item" :class="{ active: isSearchViewActive('all') }">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>Recherche
      </RouterLink>
      <RouterLink :to="{ path: '/search', query: { view: 'starred' } }" class="nav-item" :class="{ active: isSearchViewActive('starred') }">
        <i class="fa-regular fa-star" aria-hidden="true"></i>Favoris
      </RouterLink>
      <RouterLink :to="{ path: '/search', query: { view: 'templates' } }" class="nav-item" :class="{ active: isSearchViewActive('templates') }">
        <i class="fa-regular fa-copy" aria-hidden="true"></i>Modeles
      </RouterLink>
      <RouterLink :to="{ path: '/search', query: { view: 'drafts' } }" class="nav-item" :class="{ active: isSearchViewActive('drafts') }">
        <i class="fa-regular fa-file-lines" aria-hidden="true"></i>Brouillons
      </RouterLink>
    </nav>

    <section class="section collections">
      <header class="section-head">
        <p>Collections</p>
        <button
          :disabled="!selectedSpaceId || !canCreatePage"
          type="button"
          class="add-doc"
          title="Ajouter un document"
          @click="createPage"
        >
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </header>

      <ul class="space-list">
        <li v-for="space in spaces" :key="space.id" class="space-item">
          <button
            type="button"
            class="space-link"
            :class="{ active: selectedSpaceId === space.id }"
            @click="selectSpace(space.id)"
          >
            <i class="fa-regular fa-folder" aria-hidden="true"></i>{{ space.name }}
          </button>

          <ul v-if="treeBySpace[space.id]?.length" class="page-list">
            <li
              v-for="item in treeBySpace[space.id]"
              :key="item.id"
              :data-page-id="item.id"
              class="page-row"
              :style="{ paddingLeft: `${12 + item.depth * 14}px` }"
              :draggable="space.id === selectedSpaceId"
              @dragstart="space.id === selectedSpaceId ? onDragStart(item.id) : undefined"
              @dragend="space.id === selectedSpaceId ? onDragEnd() : undefined"
              @dragover.prevent="space.id === selectedSpaceId"
              @drop.prevent="space.id === selectedSpaceId ? dropOnPage(item.id) : undefined"
            >
              <div class="page-entry">
                <button
                  v-if="item.hasChildren"
                  type="button"
                  class="tree-toggle"
                  :aria-label="isPageExpanded(item.id) ? 'Replier la branche' : 'Deplier la branche'"
                  :aria-expanded="isPageExpanded(item.id)"
                  @click.stop="togglePageExpanded(item.id)"
                >
                  <i class="fa-solid fa-chevron-right" :class="{ open: isPageExpanded(item.id) }" aria-hidden="true"></i>
                </button>
                <span v-else class="tree-spacer" aria-hidden="true"></span>
                <RouterLink :to="pageLink(space.key, item)" class="page-link">
                  {{ item.title }}<span v-if="item.archived" class="page-archived-tag"> (Archive)</span>
                </RouterLink>
              </div>
            </li>
          </ul>
        </li>
      </ul>

      <div
        v-if="dragPageId !== null"
        class="root-dropzone"
        data-testid="root-dropzone"
        :class="{ active: dragPageId !== null }"
        @dragover.prevent
        @drop.prevent="dropOnRoot"
      >
        Deplacer a la racine
      </div>

      <p v-if="createError" class="error">{{ createError }}</p>
      <p v-if="moveError" class="error">{{ moveError }}</p>
    </section>

    <nav class="section nav-bottom" aria-label="Secondaire">
      <RouterLink :to="{ path: '/search', query: { view: 'archives' } }" class="nav-item" :class="{ active: isSearchViewActive('archives') }">
        <i class="fa-solid fa-box-archive" aria-hidden="true"></i>Archives
      </RouterLink>
      <RouterLink :to="{ path: '/search', query: { view: 'trash' } }" class="nav-item" :class="{ active: isSearchViewActive('trash') }">
        <i class="fa-regular fa-trash-can" aria-hidden="true"></i>Corbeille
      </RouterLink>
      <RouterLink v-if="isSiteAdmin" to="/settings" class="nav-item" :class="{ active: route.path === '/settings' }">
        <i class="fa-solid fa-gear" aria-hidden="true"></i>Parametres
      </RouterLink>
      <button v-if="isSiteAdmin" type="button" class="nav-item invite-btn" @click="goToSettingsInvite">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>Inviter des personnes...
      </button>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import axios from 'axios';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../services/api';
import { useSpacesStore } from '../stores/spaces';
import { usePagesStore } from '../stores/pages';
import { useAuthStore } from '../stores/auth';
import type { Page } from '../types/domain';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const spacesStore = useSpacesStore();
const pagesStore = usePagesStore();

const spaces = computed(() => spacesStore.spaces);
const selectedSpaceId = computed(() => spacesStore.selectedSpaceId);
const selectedSpace = computed(() => spaces.value.find((space) => space.id === selectedSpaceId.value) ?? null);
const canCreatePage = computed(
  () => selectedSpace.value?.role === 'SPACE_ADMIN' || selectedSpace.value?.role === 'SPACE_EDITOR',
);
const isSiteAdmin = computed(() => authStore.user?.siteRole === 'SITE_ADMIN');
const settingsEntryPath = computed(() => (isSiteAdmin.value ? '/settings' : '/search'));
const createError = ref('');
const moveError = ref('');
const dragPageId = ref<string | null>(null);
const collectionTrees = ref<Record<string, Page[]>>({});

const userName = computed(() => authStore.user?.displayName || authStore.user?.email || 'Utilisateur');
const workspaceName = computed(() => spaces.value[0]?.name ?? 'Espace');
const workspaceInitial = computed(() => workspaceName.value.trim().charAt(0).toUpperCase() || 'E');
const userLabel = computed(() => userName.value.toUpperCase());

const searchView = computed(() => {
  if (route.path !== '/search') {
    return null;
  }

  const rawView = route.query.view;
  if (Array.isArray(rawView)) {
    return rawView[0] || 'all';
  }
  if (typeof rawView === 'string' && rawView.trim()) {
    return rawView;
  }

  const legacyScope = route.query.scope;
  if (Array.isArray(legacyScope)) {
    return legacyScope[0] || 'all';
  }
  if (typeof legacyScope === 'string' && legacyScope.trim()) {
    return legacyScope;
  }

  return 'all';
});

const isHomeActive = computed(() => route.path === '/home');
const isSearchViewActive = (view: string) => route.path === '/search' && searchView.value === view;

type TreePageItem = Page & { depth: number; hasChildren: boolean };

const buildTreeItems = (pages: Page[]): TreePageItem[] => {
  if (!pages.length) {
    return [];
  }

  const pageById = new Map(pages.map((page) => [page.id, page]));
  const childrenByParent = new Map<string | null, Page[]>();

  for (const page of pages) {
    const parentId = page.parentId && pageById.has(page.parentId) ? page.parentId : null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(page);
    childrenByParent.set(parentId, children);
  }

  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
  }

  const ordered: TreePageItem[] = [];
  const visited = new Set<string>();

  const appendBranch = (parentId: string | null, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const child of children) {
      if (visited.has(child.id)) {
        continue;
      }
      visited.add(child.id);
      ordered.push({
        ...child,
        depth,
        hasChildren: (childrenByParent.get(child.id)?.length ?? 0) > 0,
      });
      appendBranch(child.id, depth + 1);
    }
  };

  appendBranch(null, 0);
  return ordered;
};

const treeBySpace = computed<Record<string, TreePageItem[]>>(() => {
  const mapped: Record<string, TreePageItem[]> = {};
  for (const space of spaces.value) {
    const flattened = buildTreeItems(collectionTrees.value[space.id] ?? []);
    const itemById = new Map(flattened.map((item) => [item.id, item]));
    mapped[space.id] = flattened.filter((item) => {
      let parentId = item.parentId;
      while (parentId) {
        if (!isPageExpanded(parentId)) {
          return false;
        }
        parentId = itemById.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  }
  return mapped;
});

const expandedPages = ref<Record<string, boolean>>({});

const isPageExpanded = (pageId: string) => expandedPages.value[pageId] !== false;

const togglePageExpanded = (pageId: string) => {
  expandedPages.value = {
    ...expandedPages.value,
    [pageId]: !isPageExpanded(pageId),
  };
};

const loadSpaceTree = async (spaceId: string) => {
  const response = await api.get(`/pages/space/${spaceId}/tree`);
  const pages = response.data.pages as Page[];
  const pageIds = new Set(pages.map((page) => page.id));
  const nextExpanded = { ...expandedPages.value };
  for (const page of pages) {
    const hasChildren = pages.some((candidate) => candidate.parentId === page.id && pageIds.has(candidate.id));
    if (hasChildren && nextExpanded[page.id] === undefined) {
      nextExpanded[page.id] = true;
    }
  }
  expandedPages.value = nextExpanded;
  collectionTrees.value = {
    ...collectionTrees.value,
    [spaceId]: pages,
  };
};

const loadAllTrees = async () => {
  await Promise.all(spaces.value.map((space) => loadSpaceTree(space.id).catch(() => undefined)));
};

watch(
  () => spaces.value.map((space) => space.id).join(','),
  async () => {
    await loadAllTrees();
  },
  { immediate: true },
);

watch(
  () => ({
    spaceId: selectedSpaceId.value,
    treeSignature: pagesStore.tree
      .map((page) => `${page.id}:${page.parentId ?? ''}:${page.slug}:${page.title}`)
      .join('|'),
  }),
  ({ spaceId }) => {
    if (!spaceId) {
      return;
    }
    collectionTrees.value = {
      ...collectionTrees.value,
      [spaceId]: [...pagesStore.tree],
    };
  },
  { immediate: true },
);

onMounted(async () => {
  if (!spaces.value.length) {
    await spacesStore.fetchSpaces();
    await loadAllTrees();
  }
});

const selectSpace = async (spaceId: string) => {
  spacesStore.selectSpace(spaceId);
  await pagesStore.fetchTree(spaceId);
  if (!collectionTrees.value[spaceId]) {
    await loadSpaceTree(spaceId);
  }
};

const pageLink = (spaceKey: string, page: { id: string; slug: string }) => `/space/${spaceKey}/pages/${page.id}-${page.slug}`;

const findCurrentParentId = (pageId: string): string | null => {
  const spaceId = selectedSpaceId.value;
  if (!spaceId) {
    return null;
  }
  const page = (collectionTrees.value[spaceId] ?? []).find((item) => item.id === pageId);
  return page?.parentId ?? null;
};

const performMove = async (targetParentId: string | null) => {
  if (!selectedSpaceId.value || !dragPageId.value) {
    return;
  }

  const draggedId = dragPageId.value;
  moveError.value = '';

  const currentParentId = findCurrentParentId(draggedId);
  if (draggedId === targetParentId || currentParentId === targetParentId) {
    return;
  }

  try {
    await pagesStore.movePage(draggedId, targetParentId);
    await Promise.all([pagesStore.fetchTree(selectedSpaceId.value), loadSpaceTree(selectedSpaceId.value)]);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      moveError.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de deplacer la page');
    } else {
      moveError.value = 'Impossible de deplacer la page';
    }
  } finally {
    dragPageId.value = null;
  }
};

const onDragStart = (pageId: string) => {
  dragPageId.value = pageId;
  moveError.value = '';
};

const onDragEnd = () => {
  dragPageId.value = null;
};

const dropOnPage = async (targetPageId: string) => {
  await performMove(targetPageId);
};

const dropOnRoot = async () => {
  await performMove(null);
};

const createPage = async () => {
  if (!selectedSpaceId.value) {
    return;
  }

  if (!canCreatePage.value) {
    createError.value = 'Vous n avez pas les droits pour creer une page dans cette collection';
    return;
  }

  createError.value = '';
  moveError.value = '';
  try {
    const page = await pagesStore.createPage(selectedSpaceId.value, 'Nouveau document', null);
    await Promise.all([pagesStore.fetchTree(selectedSpaceId.value), loadSpaceTree(selectedSpaceId.value)]);

    const space = spaces.value.find((item) => item.id === selectedSpaceId.value);
    const key = space?.key ?? 'space';
    await router.push(`/space/${key}/pages/${page.id}-${page.slug}?edit=1`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      createError.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de creer la page');
    } else {
      createError.value = 'Impossible de creer la page';
    }
  }
};

const goToSettingsInvite = async () => {
  await router.push('/settings');
};
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  border-right: 1px solid var(--line);
  background: #edf0f4;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 0.58rem;
  padding: 0.84rem 0.46rem 0.6rem;
}

.section {
  padding: 0 0.18rem;
}

.profile-link {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.5rem;
  border-radius: 8px;
  padding: 0.3rem 0.4rem 0.44rem;
  color: var(--ink);
}

.profile-link:hover {
  text-decoration: none;
  background: var(--sidebar-hover);
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #2f6feb;
  color: #ffffff;
  display: grid;
  place-items: center;
  font-size: 0.88rem;
  font-weight: 700;
}

.profile-meta {
  display: grid;
  gap: 0.05rem;
}

.profile-meta strong {
  font-size: 0.95rem;
  line-height: 1.2;
}

.profile-meta small {
  color: var(--muted);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  line-height: 1.1;
}

.nav-main,
.nav-bottom {
  display: grid;
  gap: 0.08rem;
}

.nav-item {
  border-radius: 7px;
  padding: 0.32rem 0.44rem;
  color: #4b5563;
  font-size: 0.84rem;
  line-height: 1.25;
}

.nav-item:hover {
  text-decoration: none;
  background: var(--sidebar-hover);
  color: var(--ink);
}

.nav-item.active {
  background: #d7dde6;
  color: #111827;
  font-weight: 600;
}

.collections {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 0.34rem;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 0.1rem 0.35rem;
}

.section-head p {
  margin: 0;
  color: #7c8799;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.add-doc {
  border: 0;
  background: transparent;
  padding: 0;
  width: 1.6rem;
  height: 1.6rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  line-height: 1;
}

.add-doc .fa-solid,
.add-doc .fa-regular {
  margin-right: 0;
  line-height: 1;
}

.space-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  padding-right: 0.12rem;
}

.space-item {
  margin-bottom: 0.22rem;
}

.space-link {
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  border-radius: 7px;
  color: #4b5563;
  font-size: 0.83rem;
  line-height: 1.25;
  padding: 0.3rem 0.4rem;
}

.space-link:hover {
  background: var(--sidebar-hover);
}

.space-link.active {
  background: #d7dde6;
  color: #111827;
  font-weight: 600;
}

.page-list {
  list-style: none;
  margin: 0.08rem 0 0.2rem;
  padding: 0;
}

.page-row {
  margin: 0.06rem 0;
}

.page-link {
  display: block;
  border-radius: 6px;
  color: #5b6576;
  padding: 0.18rem 0.42rem;
  font-size: 0.8rem;
  line-height: 1.25;
  min-width: 0;
}

.page-link:hover {
  background: var(--sidebar-hover);
  color: var(--ink);
  text-decoration: none;
}

.page-link.router-link-active {
  background: #d7dde6;
  color: #111827;
  font-weight: 600;
}

.page-archived-tag {
  color: #a8552a;
  font-size: 0.76rem;
}

.page-entry {
  display: flex;
  align-items: center;
  min-width: 0;
}

.tree-toggle,
.tree-spacer {
  width: 16px;
  height: 16px;
  margin-right: 0.12rem;
  flex: 0 0 auto;
}

.tree-toggle {
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.tree-toggle:hover {
  background: #dfe4eb;
  color: #1f2937;
}

.tree-toggle i {
  margin-right: 0;
  font-size: 0.64rem;
  transition: transform 120ms ease;
}

.tree-toggle i.open {
  transform: rotate(90deg);
}

.root-dropzone {
  margin: 0.32rem 0.15rem 0;
  border: 1px dashed var(--line-strong);
  border-radius: 7px;
  padding: 0.25rem 0.36rem;
  font-size: 0.73rem;
  color: var(--muted);
  text-align: center;
  background: rgba(255, 255, 255, 0.5);
}

.root-dropzone.active {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: rgba(3, 102, 214, 0.08);
}

.error {
  margin: 0.3rem 0.15rem 0;
  color: var(--danger);
  font-size: 0.75rem;
}

.nav-bottom {
  margin-top: auto;
  padding-top: 0.3rem;
}

.invite-btn {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
}
</style>
