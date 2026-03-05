<template>
  <section v-if="loadError" class="document-scene">
    <section class="versions">
      <h2><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>Impossible de charger la page</h2>
      <p>{{ loadError }}</p>
    </section>
  </section>
  <section v-else-if="pagesStore.currentPage" class="document-scene">
    <header class="document-header">
      <div class="document-breadcrumbs">
        <i class="fa-solid fa-code crumb-leading-icon" aria-hidden="true"></i>
        <span class="crumb">{{ spaceName }}</span>
        <template v-for="crumb in breadcrumbTrail" :key="crumb.id">
          <i class="fa-solid fa-chevron-right crumb-sep" aria-hidden="true"></i>
          <RouterLink :to="`/space/${currentSpaceKey}/pages/${crumb.id}-${crumb.slug}`" class="crumb">{{ crumb.title }}</RouterLink>
        </template>
        <i class="fa-solid fa-bars-staggered breadcrumb-menu" aria-hidden="true"></i>
      </div>
      <div class="document-actions">
        <div v-if="editing || activeUsers.length" class="presence-avatars">
          <span class="presence-avatar self">{{ userInitial }}</span>
          <span v-for="userId in visiblePresenceUsers" :key="`presence-${userId}`" class="presence-avatar">
            {{ presenceInitial(userId) }}
          </span>
        </div>
        <button type="button" class="quiet-btn" @click="openShare">
          Partager
        </button>
        <button type="button" class="quiet-btn new-doc-btn" @click="createSiblingPage">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>Nouveau doc
        </button>
        <div ref="moreMenuRef" class="menu-wrap">
          <button type="button" class="quiet-btn icon-only" @click="moreMenuOpen = !moreMenuOpen">
            <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
          </button>
          <div v-if="moreMenuOpen" class="menu-popover">
            <template v-if="!editing">
              <button type="button" @click="editDocumentFromMenu">
                <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>Editer le document
              </button>
              <hr class="menu-separator" />
              <button type="button" class="warning-option" :disabled="archiveSaving" @click="archiveDocumentFromMenu">
                <i class="fa-solid fa-box-archive" aria-hidden="true"></i>
                {{ archiveSaving ? 'Traitement...' : archiveActionLabel }}
              </button>
              <hr class="menu-separator" />
              <button type="button" class="danger-option" :disabled="archiveSaving" @click="deleteDocumentFromMenu">
                <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
                {{ archiveSaving ? 'Suppression...' : 'Supprimer le document' }}
              </button>
            </template>
            <template v-else>
              <button type="button" @click="copyCanonicalLink">
                <i class="fa-solid fa-link" aria-hidden="true"></i>Copier le lien
              </button>
              <button type="button" @click="openHistory">
                <i class="fa-regular fa-clock" aria-hidden="true"></i>Historique
              </button>
              <button type="button" @click="openPermissions">
                <i class="fa-solid fa-user-shield" aria-hidden="true"></i>Permissions
              </button>
              <button type="button" :disabled="archiveSaving" @click="toggleArchive">
                <i class="fa-solid" :class="pagesStore.currentPage.archived ? 'fa-box-open' : 'fa-box-archive'" aria-hidden="true"></i>
                {{ archiveSaving ? 'Enregistrement...' : pagesStore.currentPage.archived ? 'Restaurer la page' : 'Archiver la page' }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </header>
    <section class="document-title-zone">
      <div class="title-row">
        <div class="title-main">
          <h1 v-if="!editing">{{ pagesStore.currentPage.title }}</h1>
          <div v-else class="title-edit">
            <input
              v-model.trim="draftTitle"
              placeholder="Sans titre"
              @blur="saveTitleOnBlur"
              @keydown.enter.prevent="saveTitleOnBlur"
            />
            <span v-if="titleSaving" class="title-status">Enregistrement...</span>
          </div>
          <button type="button" class="quiet-btn icon-only title-star" :class="{ active: isStarred }" @click="toggleStarred">
            <i class="fa-star" :class="isStarred ? 'fa-solid' : 'fa-regular'" aria-hidden="true"></i>
          </button>
        </div>
        <button class="primary edit-btn" @click="toggleEdit">
          <i class="fa-solid" :class="editing ? 'fa-lock' : 'fa-pen-to-square'" aria-hidden="true"></i>
          {{ editing ? 'Arreter l edition' : 'Editer' }}
        </button>
      </div>
      <p class="meta-line">
        <span v-if="pagesStore.currentPage.updatedAt">
          Mis a jour
          <time
            :datetime="pagesStore.currentPage.updatedAt"
            :title="formatAbsoluteDate(pagesStore.currentPage.updatedAt)"
          >
            {{ updatedAgoLabel }}
          </time>
        </span>
        <span>Consulte par {{ viewedByCount }} personnes</span>
        <span v-if="pagesStore.currentPage.archived" class="meta-archived">Archived</span>
      </p>
      <p v-if="editing" class="presence-line">
        <i class="fa-solid fa-users" aria-hidden="true"></i>
        {{ activeUsers.length }} editeur(s) actif(s)
        <span v-if="remoteCursorUsers.length"> | cursors: {{ remoteCursorUsers.join(', ') }}</span>
      </p>
      <p v-if="actionFeedback" class="meta-feedback">{{ actionFeedback }}</p>
      <p v-if="actionError" class="error-line">{{ actionError }}</p>
    </section>
    <section class="document-layout" :class="{ reading: !editing, writing: editing }">
      <aside class="contents-rail">
        <section class="sidebar-panel toc-panel">
          <h2>Sommaire</h2>
          <ul v-if="tocItems.length" class="toc-list">
            <li v-for="item in tocItems" :key="`toc-${item.index}`" :style="{ paddingLeft: `${item.level === 3 ? 12 : 0}px` }">
              <button type="button" class="toc-link" @click="scrollToHeading(item.index)">{{ item.text }}</button>
            </li>
          </ul>
          <p v-else class="sidebar-empty">Ajoutez des titres H2/H3 pour creer un sommaire.</p>
        </section>
      </aside>
      <div class="document-main">
        <PageEditor
          :key="`${pageId}-${editing ? 'edit' : 'read'}`"
          :model-value="pagesStore.content"
          :editable="editing"
          :ydoc="editing ? ydoc : null"
          :awareness="editing ? awareness : null"
          :collab-user="editing ? collabUser : null"
          @save="save"
          @open-history="openHistory"
          @live-update="onLiveUpdate"
        />
      </div>
    </section>
    <section v-if="pagesStore.backlinks.length" class="backlinks-strip">
      <h2>Liens entrants</h2>
      <ul class="backlinks-list">
        <li v-for="backlink in pagesStore.backlinks" :key="`${backlink.fromPage.id}-${backlink.updatedAt}`">
          <RouterLink :to="backlink.fromPage.canonicalUrl">{{ backlink.fromPage.title }}</RouterLink>
          <span class="backlink-meta">{{ backlink.fromPage.space.name }} - {{ new Date(backlink.updatedAt).toLocaleString() }}</span>
        </li>
      </ul>
    </section>
  </section>
  <section v-else class="document-scene">
    <section class="versions">
      <h2>Chargement de la page...</h2>
    </section>
  </section>
  <div v-if="historyModalOpen" class="modal-backdrop" @click.self="closeHistory">
    <section class="modal">
      <header class="modal-header">
        <h2><i class="fa-regular fa-clock" aria-hidden="true"></i>Historique des versions</h2>
        <button type="button" @click="closeHistory"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      <div class="modal-content">
        <ul>
          <li v-for="version in pagesStore.versions" :key="version.id">
            <strong>{{ new Date(version.createdAt).toLocaleString() }}</strong> - {{ version.reason }}
            <span v-if="version.reason === 'RESTORE' && version.restoredFromId">
              (depuis {{ version.restoredFromId }})
            </span>
          </li>
        </ul>
        <section v-if="pagesStore.versions.length >= 2" class="diff-panel">
          <h3><i class="fa-solid fa-code-compare" aria-hidden="true"></i>Comparer les versions</h3>
          <div class="diff-controls">
            <label>
              De
              <select v-model="compareFromId">
                <option v-for="version in pagesStore.versions" :key="`from-${version.id}`" :value="version.id">
                  {{ new Date(version.createdAt).toLocaleString() }} ({{ version.reason }})
                </option>
              </select>
            </label>
            <label>
              A
              <select v-model="compareToId">
                <option v-for="version in pagesStore.versions" :key="`to-${version.id}`" :value="version.id">
                  {{ new Date(version.createdAt).toLocaleString() }} ({{ version.reason }})
                </option>
              </select>
            </label>
            <button type="button" :disabled="compareLoading || !compareFromId || !compareToId" @click="compareVersions">
              {{ compareLoading ? 'Comparaison...' : 'Comparer' }}
            </button>
          </div>
          <p v-if="compareError" class="error-line">{{ compareError }}</p>
          <pre v-else-if="diffLines.length" class="diff-output"><code>
<span
  v-for="(line, index) in diffLines"
  :key="`${line.type}-${index}`"
  :class="['diff-line', `diff-${line.type}`]"
>{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : '=' }} {{ line.text }}
</span>
          </code></pre>
        </section>
      </div>
      <footer class="modal-footer">
        <button type="button" @click="createManualVersion">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>Creer une version maintenant
        </button>
      </footer>
    </section>
  </div>
  <div v-if="permissionsModalOpen" class="modal-backdrop" @click.self="closePermissions">
    <section class="modal">
      <header class="modal-header">
        <h2><i class="fa-solid fa-user-shield" aria-hidden="true"></i>Permissions de la page</h2>
        <button type="button" @click="closePermissions"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      <div class="modal-content">
        <section class="perm-section">
          <h3>Restrictions de lecture</h3>
          <label class="perm-label">Roles</label>
          <div class="roles-grid">
            <label><input v-model="viewRoles" type="checkbox" value="SPACE_ADMIN" /> Admin espace</label>
            <label><input v-model="viewRoles" type="checkbox" value="SPACE_EDITOR" /> Editeur espace</label>
            <label><input v-model="viewRoles" type="checkbox" value="SPACE_VIEWER" /> Lecteur espace</label>
          </div>
          <label class="perm-label">Emails utilisateurs (separes par des virgules)</label>
          <textarea
            v-model="viewUserEmails"
            rows="2"
            placeholder="alice@company.com, bob@company.com"
          />
        </section>
        <section class="perm-section">
          <h3>Restrictions d edition</h3>
          <label class="perm-label">Roles</label>
          <div class="roles-grid">
            <label><input v-model="editRoles" type="checkbox" value="SPACE_ADMIN" /> Admin espace</label>
            <label><input v-model="editRoles" type="checkbox" value="SPACE_EDITOR" /> Editeur espace</label>
            <label><input v-model="editRoles" type="checkbox" value="SPACE_VIEWER" /> Lecteur espace</label>
          </div>
          <label class="perm-label">Emails utilisateurs (separes par des virgules)</label>
          <textarea
            v-model="editUserEmails"
            rows="2"
            placeholder="alice@company.com, bob@company.com"
          />
        </section>
        <p v-if="permissionsError" class="error-line">{{ permissionsError }}</p>
      </div>
      <footer class="modal-footer">
        <button type="button" @click="closePermissions">Annuler</button>
        <button type="button" class="primary" :disabled="permissionsSaving" @click="savePermissions">
          {{ permissionsSaving ? 'Enregistrement...' : 'Enregistrer les permissions' }}
        </button>
      </footer>
    </section>
  </div>
  <div v-if="deleteDialogOpen" class="modal-backdrop" @click.self="closeDeleteDialog">
    <section class="modal modal-danger">
      <header class="modal-header">
        <h2><i class="fa-regular fa-trash-can" aria-hidden="true"></i>Supprimer le document</h2>
        <button type="button" class="confirm-close-btn" @click="closeDeleteDialog">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </header>
      <div class="modal-content">
        <p class="danger-copy">Le document sera déplacé dans la corbeille.</p>
      </div>
      <footer class="modal-footer">
        <button type="button" @click="closeDeleteDialog">Annuler</button>
        <button type="button" class="danger-btn" :disabled="archiveSaving" @click="confirmDeleteDocument">
          {{ archiveSaving ? 'Suppression...' : 'Supprimer le document' }}
        </button>
      </footer>
    </section>
  </div>
  <div v-if="archiveDialogOpen" class="modal-backdrop" @click.self="closeArchiveDialog">
    <section class="modal modal-warning">
      <header class="modal-header">
        <h2><i class="fa-solid fa-box-archive" aria-hidden="true"></i>{{ archiveDialogTitle }}</h2>
        <button type="button" class="confirm-close-btn" @click="closeArchiveDialog">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </header>
      <div class="modal-content">
        <p class="warning-copy">{{ archiveDialogMessage }}</p>
      </div>
      <footer class="modal-footer">
        <button type="button" @click="closeArchiveDialog">Annuler</button>
        <button type="button" class="warning-btn" :disabled="archiveSaving" @click="confirmArchiveDocument">
          {{ archiveSaving ? 'Traitement...' : archiveActionLabel }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { api } from '../services/api';
import { joinPageRoom, leavePageRoom } from '../services/collab';
import { usePagesStore } from '../stores/pages';
import { useSpacesStore } from '../stores/spaces';
import { useAuthStore } from '../stores/auth';
import PageEditor from '../components/PageEditor.vue';
import type { Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { computeLineDiff, type DiffLine } from '../utils/text-diff';

const routeParams = defineProps<{
  spaceKey?: string;
  pageIdSlug?: string;
}>();

type TocItem = {
  index: number;
  level: number;
  text: string;
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const pagesStore = usePagesStore();
const spacesStore = useSpacesStore();
const editing = ref(false);
const loadError = ref('');
const draftTitle = ref('');
const titleSaving = ref(false);
const historyModalOpen = ref(false);
const permissionsModalOpen = ref(false);
const permissionsSaving = ref(false);
const permissionsError = ref('');
const compareFromId = ref('');
const compareToId = ref('');
const compareLoading = ref(false);
const compareError = ref('');
const diffLines = ref<DiffLine[]>([]);
const viewRoles = ref<Array<'SPACE_ADMIN' | 'SPACE_EDITOR' | 'SPACE_VIEWER'>>([]);
const editRoles = ref<Array<'SPACE_ADMIN' | 'SPACE_EDITOR' | 'SPACE_VIEWER'>>([]);
const viewUserEmails = ref('');
const editUserEmails = ref('');
const activeUsers = ref<string[]>([]);
const remoteCursors = ref<Record<string, unknown>>({});
let collabSocket: Socket | null = null;
const ydoc = ref<Y.Doc>(new Y.Doc());
const awareness = ref<Awareness | null>(null);
let detachYDocUpdateListener: (() => void) | null = null;
let detachAwarenessUpdateListener: (() => void) | null = null;
const latestSnapshotContent = ref<unknown>(null);
const latestSnapshotText = ref('');
const breadcrumbs = ref<Array<{ id: string; title: string; slug: string }>>([]);
const archiveSaving = ref(false);
const moreMenuOpen = ref(false);
const moreMenuRef = ref<HTMLElement | null>(null);
const deleteDialogOpen = ref(false);
const archiveDialogOpen = ref(false);
const actionError = ref('');
const actionFeedback = ref('');
const starredPageIds = ref<string[]>([]);
const nowTick = ref(Date.now());
const relativeTimeFormatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
let relativeClockInterval: ReturnType<typeof window.setInterval> | null = null;

const pageId = computed(() => String(route.params.pageIdSlug).split('-')[0]);
const currentSpaceKey = computed(() => String(routeParams.spaceKey ?? route.params.spaceKey ?? ''));
const spaceName = computed(() => {
  const match = spacesStore.spaces.find((space) => space.key === currentSpaceKey.value);
  return match?.name ?? 'Espace';
});
const remoteCursorUsers = computed(() => Object.keys(remoteCursors.value));
const breadcrumbTrail = computed(() => breadcrumbs.value.filter((crumb) => crumb.id !== pageId.value));
const isStarred = computed(() => starredPageIds.value.includes(pageId.value));
const userInitial = computed(() => {
  const label = authStore.user?.displayName || authStore.user?.email || 'Utilisateur';
  return label.trim().charAt(0).toUpperCase() || 'U';
});
const visiblePresenceUsers = computed(() => [...new Set(activeUsers.value)].slice(0, 2));
const viewedByCount = computed(() =>
  Math.max(1, new Set([...(activeUsers.value || []), authStore.user?.id || 'self']).size),
);
const isCurrentPageArchived = computed(() => Boolean(pagesStore.currentPage?.archived));
const archiveActionLabel = computed(() => (isCurrentPageArchived.value ? 'Désarchiver le document' : 'Archiver le document'));
const archiveDialogTitle = computed(() => (isCurrentPageArchived.value ? 'Désarchiver le document' : 'Archiver le document'));
const archiveDialogMessage = computed(() =>
  isCurrentPageArchived.value
    ? 'Le document sera retiré des archives et redeviendra visible dans les collections.'
    : 'Le document sera déplacé dans les archives. Vous pourrez le restaurer plus tard.',
);
const updatedAgoLabel = computed(() => {
  const value = pagesStore.currentPage?.updatedAt;
  return value ? formatRelativeDate(value) : '';
});
const tocItems = computed<TocItem[]>(() => {
  const extractText = (node: unknown): string => {
    if (!node || typeof node !== 'object') {
      return '';
    }
    const nodeRecord = node as Record<string, unknown>;
    const nodeText = typeof nodeRecord.text === 'string' ? nodeRecord.text : '';
    const children = Array.isArray(nodeRecord.content) ? nodeRecord.content : [];
    const childText = children.map((child) => extractText(child)).join('');
    return `${nodeText}${childText}`;
  };

  const headings: TocItem[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const nodeRecord = node as Record<string, unknown>;
    const type = typeof nodeRecord.type === 'string' ? nodeRecord.type : '';
    const attrs =
      nodeRecord.attrs && typeof nodeRecord.attrs === 'object' ? (nodeRecord.attrs as Record<string, unknown>) : null;
    const level = typeof attrs?.level === 'number' ? attrs.level : null;
    if (type === 'heading' && (level === 2 || level === 3)) {
      const text = extractText(node).trim();
      headings.push({
        index: headings.length,
        level,
        text: text || `Heading ${headings.length + 1}`,
      });
    }
    const children = Array.isArray(nodeRecord.content) ? nodeRecord.content : [];
    for (const child of children) {
      visit(child);
    }
  };

  visit(pagesStore.content);
  return headings;
});
const collabUser = computed(() => {
  const name = authStore.user?.displayName || authStore.user?.email || 'User';
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 360;
  }
  return {
    name,
    color: `hsl(${hash}, 70%, 45%)`,
  };
});

const toBase64 = (buffer: Uint8Array) => btoa(String.fromCharCode(...buffer));
const fromBase64 = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const clearCollabState = () => {
  activeUsers.value = [];
  remoteCursors.value = {};
};

const clearActions = () => {
  actionError.value = '';
  actionFeedback.value = '';
};

const handleOutsideMenuClick = (event: MouseEvent) => {
  if (!moreMenuOpen.value) {
    return;
  }
  const target = event.target as Node | null;
  if (!target || !moreMenuRef.value) {
    moreMenuOpen.value = false;
    return;
  }
  if (!moreMenuRef.value.contains(target)) {
    moreMenuOpen.value = false;
  }
};

const loadStarredFromStorage = () => {
  try {
    const raw = window.localStorage.getItem('cnavluence:starred-pages');
    if (!raw) {
      starredPageIds.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    starredPageIds.value = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    starredPageIds.value = [];
  }
};

const saveStarredToStorage = (ids: string[]) => {
  starredPageIds.value = ids;
  window.localStorage.setItem('cnavluence:starred-pages', JSON.stringify(ids));
};

const readTrashIds = () => {
  try {
    const raw = window.localStorage.getItem('cnavluence:trash-pages');
    if (!raw) {
      return [] as string[];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [] as string[];
  }
};

const saveTrashIds = (ids: string[]) => {
  window.localStorage.setItem('cnavluence:trash-pages', JSON.stringify(ids));
};

const readArchiveIds = () => {
  try {
    const raw = window.localStorage.getItem('cnavluence:archived-pages');
    if (!raw) {
      return [] as string[];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [] as string[];
  }
};

const saveArchiveIds = (ids: string[]) => {
  window.localStorage.setItem('cnavluence:archived-pages', JSON.stringify(ids));
};

const formatAbsoluteDate = (iso: string) => new Date(iso).toLocaleString('fr-FR');

const formatRelativeDate = (iso: string) => {
  void nowTick.value;
  const targetMs = new Date(iso).getTime();
  const diffSeconds = Math.round((targetMs - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 60) {
    return relativeTimeFormatter.format(diffSeconds, 'second');
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return relativeTimeFormatter.format(diffDays, 'day');
  }
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return relativeTimeFormatter.format(diffMonths, 'month');
  }
  const diffYears = Math.round(diffMonths / 12);
  return relativeTimeFormatter.format(diffYears, 'year');
};

const destroyYDoc = () => {
  if (detachYDocUpdateListener) {
    detachYDocUpdateListener();
    detachYDocUpdateListener = null;
  }
  ydoc.value.destroy();
  ydoc.value = new Y.Doc();
  if (detachAwarenessUpdateListener) {
    detachAwarenessUpdateListener();
    detachAwarenessUpdateListener = null;
  }
  awareness.value?.destroy();
  awareness.value = null;
};

const initYDoc = (targetPageId: string) => {
  destroyYDoc();
  ydoc.value = new Y.Doc();
  ydoc.value.getXmlFragment('default');
  awareness.value = new Awareness(ydoc.value);
  awareness.value.setLocalStateField('user', collabUser.value);

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (!collabSocket || origin === 'remote') {
      return;
    }
    collabSocket.emit('apply-update', {
      pageId: targetPageId,
      update: toBase64(update),
      snapshotContent: latestSnapshotContent.value ?? pagesStore.content ?? { type: 'doc', content: [] },
      snapshotText: latestSnapshotText.value,
    });
  };

  ydoc.value.on('update', onUpdate);
  detachYDocUpdateListener = () => {
    if (!ydoc.value) {
      return;
    }
    ydoc.value.off('update', onUpdate);
  };

  const onAwarenessUpdate = (
    payload: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (!collabSocket || !awareness.value || origin === 'remote') {
      return;
    }
    const changedClients = [...payload.added, ...payload.updated, ...payload.removed];
    if (changedClients.length === 0) {
      return;
    }
    const update = encodeAwarenessUpdate(awareness.value, changedClients);
    collabSocket.emit('awareness-update', {
      pageId: targetPageId,
      clientId: ydoc.value.clientID,
      update: toBase64(update),
    });
  };

  awareness.value.on('update', onAwarenessUpdate);
  detachAwarenessUpdateListener = () => {
    if (!awareness.value) {
      return;
    }
    awareness.value.off('update', onAwarenessUpdate);
  };
};

const detachCollabListeners = () => {
  if (!collabSocket) {
    return;
  }
  collabSocket.off('room-state');
  collabSocket.off('presence');
  collabSocket.off('remote-update');
  collabSocket.off('remote-cursor');
  collabSocket.off('awareness-update');
  collabSocket.off('error-event');
};

const attachCollabListeners = (targetPageId: string) => {
  collabSocket = joinPageRoom(targetPageId);

  collabSocket.on(
    'room-state',
    (payload: {
      pageId: string;
      activeUsers: string[];
      fullUpdate: string;
      snapshotContent?: unknown;
      awarenessUpdate?: string | null;
    }) => {
      if (payload.pageId !== pageId.value) {
        return;
      }
      activeUsers.value = payload.activeUsers;
      if (payload.snapshotContent) {
        latestSnapshotContent.value = payload.snapshotContent;
        pagesStore.content = payload.snapshotContent;
      }
      Y.applyUpdate(ydoc.value, fromBase64(payload.fullUpdate), 'remote');
      if (payload.awarenessUpdate && awareness.value) {
        applyAwarenessUpdate(awareness.value, fromBase64(payload.awarenessUpdate), 'remote');
      }
    },
  );

  collabSocket.on('awareness-update', (payload: { pageId: string; update: string }) => {
    if (payload.pageId !== pageId.value || !awareness.value) {
      return;
    }
    applyAwarenessUpdate(awareness.value, fromBase64(payload.update), 'remote');
  });

  collabSocket.on('presence', (payload: { type: 'join' | 'leave'; userId: string }) => {
    if (payload.type === 'join') {
      if (!activeUsers.value.includes(payload.userId)) {
        activeUsers.value = [...activeUsers.value, payload.userId];
      }
      return;
    }
    activeUsers.value = activeUsers.value.filter((userId) => userId !== payload.userId);
    const next = { ...remoteCursors.value };
    delete next[payload.userId];
    remoteCursors.value = next;
  });

  collabSocket.on('remote-update', (payload: { pageId: string; update: string }) => {
    if (payload.pageId !== pageId.value) {
      return;
    }
    Y.applyUpdate(ydoc.value, fromBase64(payload.update), 'remote');
  });

  collabSocket.on('remote-cursor', (payload: { pageId: string; userId: string; selection: unknown }) => {
    if (payload.pageId !== pageId.value) {
      return;
    }
    remoteCursors.value = {
      ...remoteCursors.value,
      [payload.userId]: payload.selection,
    };
  });

  collabSocket.on('error-event', (payload: { message?: string }) => {
    if (payload?.message) {
      loadError.value = payload.message;
    }
  });
};

const loadPage = async () => {
  loadError.value = '';
  breadcrumbs.value = [];
  clearActions();
  try {
    const [, breadcrumbsResponse] = await Promise.all([
      pagesStore.loadPage(pageId.value),
      api.get(`/pages/${pageId.value}/breadcrumbs`),
    ]);
    breadcrumbs.value = breadcrumbsResponse.data.breadcrumbs ?? [];
    latestSnapshotContent.value = pagesStore.content;
    latestSnapshotText.value = '';
    draftTitle.value = pagesStore.currentPage?.title ?? '';
    if (route.query.edit === '1' && !editing.value) {
      await api.post('/content/session/enter', { pageId: pageId.value });
      initYDoc(pageId.value);
      editing.value = true;
      attachCollabListeners(pageId.value);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      loadError.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Unknown error');
      return;
    }
    loadError.value = 'Unknown error';
  }
};

onMounted(async () => {
  document.addEventListener('click', handleOutsideMenuClick);
  relativeClockInterval = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 60000);
  loadStarredFromStorage();
  await loadPage();
});

watch(pageId, async (nextPageId, previousPageId) => {
  if (editing.value) {
    if (previousPageId) {
      await api.post('/content/session/leave', { pageId: previousPageId }).catch(() => undefined);
      leavePageRoom(previousPageId);
    }
    detachCollabListeners();
    destroyYDoc();
    clearCollabState();
  }
  editing.value = false;
  if (!nextPageId) {
    return;
  }
  await loadPage();
});

watch(
  () => pagesStore.currentPage?.title,
  (value) => {
    if (value) {
      draftTitle.value = value;
    }
  },
);

const toggleEdit = async () => {
  if (loadError.value) {
    return;
  }
  if (!editing.value) {
    await api.post('/content/session/enter', { pageId: pageId.value });
    initYDoc(pageId.value);
    editing.value = true;
    attachCollabListeners(pageId.value);
  } else {
    editing.value = false;
    awareness.value?.setLocalState(null);
    await api.post('/content/session/leave', { pageId: pageId.value });
    leavePageRoom(pageId.value);
    detachCollabListeners();
    destroyYDoc();
    clearCollabState();
    await pagesStore.loadBacklinks(pageId.value).catch(() => undefined);
  }
};

const onLiveUpdate = (payload: { content: unknown; text: string; selection: { from: number; to: number } }) => {
  latestSnapshotContent.value = payload.content;
  latestSnapshotText.value = payload.text;
  if (!editing.value || !collabSocket) {
    return;
  }

  collabSocket.emit('cursor-update', {
    pageId: pageId.value,
    selection: payload.selection,
  });
};

const save = async (content: unknown) => {
  clearActions();
  await pagesStore.saveContent(pageId.value, content);
};

const saveTitleOnBlur = async () => {
  if (!pagesStore.currentPage) {
    return;
  }
  clearActions();

  const nextTitle = draftTitle.value.trim();
  if (!nextTitle || nextTitle === pagesStore.currentPage.title) {
    draftTitle.value = pagesStore.currentPage.title;
    return;
  }

  titleSaving.value = true;
  try {
    await pagesStore.renamePage(pagesStore.currentPage.id, nextTitle);
    if (spacesStore.selectedSpaceId) {
      await pagesStore.fetchTree(spacesStore.selectedSpaceId);
    }
  } finally {
    titleSaving.value = false;
  }
};

const createManualVersion = async () => {
  await pagesStore.createManualVersion(pageId.value);
};

const openHistory = async () => {
  clearActions();
  historyModalOpen.value = true;
  await pagesStore.loadVersions(pageId.value).catch(() => undefined);
  const [latest, previous] = pagesStore.versions;
  compareToId.value = latest?.id ?? '';
  compareFromId.value = previous?.id ?? latest?.id ?? '';
  diffLines.value = [];
  compareError.value = '';
};

const closeHistory = () => {
  historyModalOpen.value = false;
};

const compareVersions = async () => {
  if (!compareFromId.value || !compareToId.value) {
    return;
  }
  if (compareFromId.value === compareToId.value) {
    compareError.value = 'Choose two different versions';
    diffLines.value = [];
    return;
  }

  compareLoading.value = true;
  compareError.value = '';
  try {
    const [fromResponse, toResponse] = await Promise.all([
      api.get(`/versions/view/${compareFromId.value}`),
      api.get(`/versions/view/${compareToId.value}`),
    ]);

    const fromText = String(fromResponse.data.version?.snapshotText ?? '');
    const toText = String(toResponse.data.version?.snapshotText ?? '');
    diffLines.value = computeLineDiff(fromText, toText);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      compareError.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de comparer les versions');
    } else {
      compareError.value = 'Impossible de comparer les versions';
    }
    diffLines.value = [];
  } finally {
    compareLoading.value = false;
  }
};

const parseEmailsInput = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

const openPermissions = async () => {
  if (!pagesStore.currentPage) {
    return;
  }
  clearActions();

  permissionsError.value = '';
  await pagesStore.loadRestrictions(pagesStore.currentPage.id);
  const restrictions = pagesStore.restrictions;
  if (!restrictions) {
    permissionsError.value = 'Impossible de charger les permissions';
    return;
  }

  const viewRoleEntries = restrictions.view
    .map((entry) => entry.role)
    .filter((role): role is 'SPACE_ADMIN' | 'SPACE_EDITOR' | 'SPACE_VIEWER' => Boolean(role));
  const editRoleEntries = restrictions.edit
    .map((entry) => entry.role)
    .filter((role): role is 'SPACE_ADMIN' | 'SPACE_EDITOR' | 'SPACE_VIEWER' => Boolean(role));

  viewRoles.value = [...new Set(viewRoleEntries)];
  editRoles.value = [...new Set(editRoleEntries)];
  viewUserEmails.value = restrictions.view
    .map((entry) => entry.user?.email)
    .filter((email): email is string => Boolean(email))
    .join(', ');
  editUserEmails.value = restrictions.edit
    .map((entry) => entry.user?.email)
    .filter((email): email is string => Boolean(email))
    .join(', ');
  permissionsModalOpen.value = true;
};

const closePermissions = () => {
  permissionsModalOpen.value = false;
  permissionsError.value = '';
};

const savePermissions = async () => {
  if (!pagesStore.currentPage) {
    return;
  }
  clearActions();

  permissionsSaving.value = true;
  permissionsError.value = '';
  try {
    await pagesStore.saveRestrictions(pagesStore.currentPage.id, {
      view: {
        roles: [...new Set(viewRoles.value)],
        userEmails: [...new Set(parseEmailsInput(viewUserEmails.value))],
      },
      edit: {
        roles: [...new Set(editRoles.value)],
        userEmails: [...new Set(parseEmailsInput(editUserEmails.value))],
      },
    });
    permissionsModalOpen.value = false;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      permissionsError.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible d enregistrer les permissions');
    } else {
      permissionsError.value = 'Impossible d enregistrer les permissions';
    }
  } finally {
    permissionsSaving.value = false;
  }
};

const copyCanonicalLink = async () => {
  const canonical = pagesStore.currentCanonicalUrl;
  if (!canonical) {
    return;
  }
  clearActions();
  const absoluteUrl = `${window.location.origin}${canonical}`;
  try {
    await navigator.clipboard.writeText(absoluteUrl);
    actionFeedback.value = 'Lien copie';
  } catch {
    actionError.value = 'Impossible de copier le lien';
  } finally {
    moreMenuOpen.value = false;
  }
};

const presenceInitial = (userId: string) => userId.trim().charAt(0).toUpperCase() || '?';

const toggleStarred = () => {
  clearActions();
  const current = new Set(starredPageIds.value);
  if (current.has(pageId.value)) {
    current.delete(pageId.value);
    saveStarredToStorage([...current]);
    actionFeedback.value = 'Retire des favoris';
    return;
  }
  current.add(pageId.value);
  saveStarredToStorage([...current]);
  actionFeedback.value = 'Ajoute aux favoris';
};

const openShare = async () => {
  clearActions();
  await copyCanonicalLink();
  await openPermissions();
};

const createSiblingPage = async () => {
  if (!pagesStore.currentPage) {
    return;
  }
  clearActions();
  try {
    const currentSpace = spacesStore.spaces.find((space) => space.key === currentSpaceKey.value);
    const spaceId = currentSpace?.id;
    if (!spaceId) {
      actionError.value = 'Impossible de detecter l espace courant';
      return;
    }

    const created = await pagesStore.createPage(spaceId, 'Sans titre', pagesStore.currentPage.parentId ?? null);
    await pagesStore.fetchTree(spaceId).catch(() => undefined);
    await router.push(`/space/${currentSpaceKey.value}/pages/${created.id}-${created.slug}?edit=1`);
  } catch {
    actionError.value = 'Impossible de creer la page';
  }
};

const editDocumentFromMenu = async () => {
  moreMenuOpen.value = false;
  if (!editing.value) {
    await toggleEdit();
  }
};

const archiveDocumentFromMenu = async () => {
  if (!pagesStore.currentPage) {
    return;
  }
  moreMenuOpen.value = false;
  archiveDialogOpen.value = true;
};

const closeArchiveDialog = () => {
  archiveDialogOpen.value = false;
};

const confirmArchiveDocument = async () => {
  if (!pagesStore.currentPage) {
    archiveDialogOpen.value = false;
    return;
  }
  archiveDialogOpen.value = false;
  await toggleArchive();
};

const deleteDocumentFromMenu = async () => {
  if (!pagesStore.currentPage) {
    return;
  }
  moreMenuOpen.value = false;
  deleteDialogOpen.value = true;
};

const closeDeleteDialog = () => {
  deleteDialogOpen.value = false;
};

const confirmDeleteDocument = async () => {
  if (!pagesStore.currentPage) {
    return;
  }
  clearActions();
  archiveSaving.value = true;
  try {
    const deletingPageId = pagesStore.currentPage.id;
    await api.patch(`/pages/${deletingPageId}/archive`, { archived: true });
    const currentSpaceId = pagesStore.currentPage?.spaceId ?? null;
    if (spacesStore.selectedSpaceId) {
      await pagesStore.fetchTree(spacesStore.selectedSpaceId).catch(() => undefined);
    }
    if (currentSpaceId && currentSpaceId !== spacesStore.selectedSpaceId) {
      await pagesStore.fetchTree(currentSpaceId).catch(() => undefined);
    }

    const current = new Set(starredPageIds.value);
    if (current.delete(deletingPageId)) {
      saveStarredToStorage([...current]);
    }

    const trash = new Set(readTrashIds());
    trash.add(deletingPageId);
    saveTrashIds([...trash]);

    const archives = new Set(readArchiveIds());
    archives.delete(deletingPageId);
    saveArchiveIds([...archives]);

    deleteDialogOpen.value = false;
    await router.push('/search?view=trash');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      actionError.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de supprimer la page');
    } else {
      actionError.value = 'Impossible de supprimer la page';
    }
  } finally {
    archiveSaving.value = false;
    moreMenuOpen.value = false;
  }
};

const scrollToHeading = (tocIndex: number) => {
  const headings = Array.from(document.querySelectorAll('.tiptap.ProseMirror h2, .tiptap.ProseMirror h3'));
  const target = headings[tocIndex] as HTMLElement | undefined;
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const toggleArchive = async () => {
  if (!pagesStore.currentPage) {
    return;
  }
  clearActions();
  archiveSaving.value = true;
  try {
    const archived = !pagesStore.currentPage.archived;
    const archivedPageId = pagesStore.currentPage.id;
    await api.patch(`/pages/${archivedPageId}/archive`, { archived });
    const archives = new Set(readArchiveIds());
    if (archived) {
      archives.add(archivedPageId);
    } else {
      archives.delete(archivedPageId);
    }
    saveArchiveIds([...archives]);
    if (!archived) {
      const trash = new Set(readTrashIds());
      if (trash.delete(archivedPageId)) {
        saveTrashIds([...trash]);
      }
    }
    if (spacesStore.selectedSpaceId) {
      await pagesStore.fetchTree(spacesStore.selectedSpaceId).catch(() => undefined);
    }
    if (archived) {
      await router.push('/search');
      return;
    }
    await pagesStore.loadPage(pageId.value);
    actionFeedback.value = archived ? 'Page archivee' : 'Page restauree';
  } catch (error) {
    if (axios.isAxiosError(error)) {
      actionError.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de modifier l etat d archive');
    } else {
      actionError.value = 'Impossible de modifier l etat d archive';
    }
  } finally {
    archiveSaving.value = false;
    moreMenuOpen.value = false;
  }
};

onBeforeUnmount(async () => {
  document.removeEventListener('click', handleOutsideMenuClick);

  if (relativeClockInterval) {
    window.clearInterval(relativeClockInterval);
    relativeClockInterval = null;
  }

  if (!editing.value) {
    return;
  }

  awareness.value?.setLocalState(null);
  await api.post('/content/session/leave', { pageId: pageId.value }).catch(() => undefined);
  leavePageRoom(pageId.value);
  detachCollabListeners();
  destroyYDoc();
  clearCollabState();
});
</script>

<style scoped>
.document-scene {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 0.64rem;
  height: auto;
  min-height: 100%;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0 1.5rem;
}

.document-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  min-height: 0;
  padding: 0.18rem 0.1rem 0;
}

.document-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: nowrap;
  overflow: visible;
  white-space: nowrap;
  max-width: 100%;
}

.document-breadcrumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.34rem;
  min-height: 0;
}

.crumb {
  color: #4b5563;
  font-size: 0.89rem;
  line-height: 1.2;
}

.crumb-leading-icon {
  margin-right: 0.12rem;
  color: #3b82f6;
  font-size: 0.82rem;
}

.breadcrumb-menu {
  margin-left: 0.34rem;
  color: #6b7280;
  font-size: 0.74rem;
}

.crumb:hover {
  color: #111827;
  text-decoration: none;
}

.crumb-sep {
  color: #c7ced8;
  font-size: 0.58rem;
}

.presence-avatars {
  display: inline-flex;
  align-items: center;
  margin-right: 0.15rem;
}

.presence-avatar {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 2px solid #fff;
  background: #dbe3ee;
  color: #1f2937;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 700;
  margin-left: -6px;
}

.presence-avatar:first-child {
  margin-left: 0;
}

.presence-avatar.self {
  background: #c8d8f7;
}

.quiet-btn {
  border: 1px solid #dadfe6;
  background: #fff;
  color: #374151;
  padding: 0.34rem 0.6rem;
  font-size: 0.82rem;
  border-radius: 8px;
}

.quiet-btn:hover {
  background: #f4f6f8;
  color: #111827;
  border-color: #cfd6df;
}

.quiet-btn.active {
  color: #8b5e00;
  background: #fff6d8;
  border-color: #f5dfa6;
}

.new-doc-btn {
  font-weight: 600;
}

.icon-only {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.menu-wrap {
  position: relative;
}

.menu-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 0.28rem);
  min-width: 188px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12);
  padding: 0.25rem;
  z-index: 32;
}

.menu-popover button {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.82rem;
  padding: 0.4rem 0.45rem;
}

.menu-popover button:hover {
  background: #f4f6f8;
  color: var(--ink);
}

.menu-separator {
  margin: 0.25rem 0;
  border: 0;
  border-top: 1px solid var(--line);
}

.menu-popover .danger-option {
  color: #b42318;
}

.menu-popover .danger-option:hover {
  background: #fef3f2;
  color: #b42318;
}

.menu-popover .warning-option {
  color: #e38f5f;
}

.menu-popover .warning-option:hover {
  background: #fff7ed;
  color: #e38f5f;
}

.modal-danger .modal-header h2 {
  color: #b42318;
}

.danger-copy {
  margin: 0;
  color: #344054;
}

.danger-btn {
  border-color: #b42318;
  background: #b42318;
  color: #fff;
}

.danger-btn:hover {
  border-color: #912018;
  background: #912018;
}

.modal-warning .modal-header h2 {
  color: #e38f5f;
}

.warning-copy {
  margin: 0;
  color: #344054;
}

.warning-btn {
  border-color: #e38f5f;
  background: #e38f5f;
  color: #fff;
}

.warning-btn:hover {
  border-color: #cc7b4a;
  background: #cc7b4a;
}

.confirm-close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.confirm-close-btn:hover {
  background: #f2f4f7;
  border-color: #e4e7ec;
}

.confirm-close-btn i {
  margin-right: 0;
}


.document-title-zone {
  margin-top: 1.24rem;
  max-width: 100%;
}

.meta-line {
  margin: 0 0 0.16rem;
  color: #a0a8b8;
  font-size: 0.82rem;
  display: flex;
  gap: 0.36rem;
  flex-wrap: wrap;
}

.meta-line span + span::before {
  content: "\00B7";
  margin-right: 0.5rem;
  color: #98a2b3;
}

.meta-archived {
  color: #b42318;
  font-weight: 600;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  margin-bottom: 0.46rem;
}

.title-main {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  flex: 1;
}

.title-row h1 {
  margin: 0;
  font-size: clamp(2.55rem, 4vw, 3.15rem);
  line-height: 1.04;
  letter-spacing: -0.03em;
  flex: 0 1 auto;
  min-width: 0;
}

.title-edit {
  margin: 0;
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
  width: 100%;
}

.title-star {
  margin-top: 0.2rem;
  background-color: transparent;
  border: none;
  font-size: 1.5rem;
  margin-left: 0.5rem;
}

.quiet-btn.title-star.active {
  color: #ffc53c !important;
  background: transparent !important;
  border-color: transparent !important;
}

.title-edit input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: clamp(2rem, 4vw, 2.65rem);
  font-weight: 600;
  line-height: 1.14;
  padding: 0;
  color: #111319;
}

.edit-btn {
  margin-top: 0.2rem;
  white-space: nowrap;
}

.title-edit input:focus {
  outline: none;
  border: none;
  box-shadow: none;
}

.title-status {
  color: var(--muted);
  font-size: 0.78rem;
  margin-top: 0.45rem;
}

.primary {
  flex-shrink: 0;
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.primary:hover {
  background: var(--accent-strong);
}

.presence-line {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  margin-top: 0.5rem;
}

.meta-feedback {
  margin: 0.35rem 0 0;
  color: #2f7a2f;
  font-size: 0.78rem;
}

.document-layout {
  min-height: auto;
  display: grid;
  grid-template-columns: 226px minmax(0, 1fr);
  gap: clamp(1.3rem, 2vw, 1.95rem);
  align-items: start;
}

.document-main {
  align-self: start;
  width: 100%;
  max-width: none;
}

.document-layout.reading .document-main {
  background: transparent;
  border-radius: 0;
}

.document-layout.writing .document-main {
  max-width: 790px;
}

.contents-rail {
  position: sticky;
  top: 8px;
  align-self: start;
}

.toc-panel {
  border: none;
  border-right: 1px solid #e6e9ee;
  border-radius: 0;
  background: transparent;
  padding: 0 0.86rem 0 0;
}

.sidebar-panel {
  padding: 0.4rem 0.1rem;
}

.sidebar-panel h2 {
  margin: 0 0 0.58rem;
  color: #8f98a8;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.toc-list,
.backlinks-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}

.toc-link {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: #2f3745;
  font-size: 0.94rem;
  line-height: 1.3;
  padding: 0.2rem 0;
  border-radius: 0;
}

.toc-link:hover {
  background: transparent;
  color: #111827;
  text-decoration: underline;
}

.backlinks-list li {
  margin: 0;
  display: grid;
  gap: 0.08rem;
}

.sidebar-empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.76rem;
}

.backlinks-strip {
  margin-top: 0.72rem;
  max-width: none;
  border-top: 1px solid #e5e7eb;
  padding-top: 0.68rem;
}

.backlinks-strip h2 {
  margin: 0 0 0.35rem;
  color: #6b7280;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.versions {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.8rem;
}

.backlink-meta {
  color: var(--muted);
  font-size: 0.76rem;
}

.versions h2 {
  margin-top: 0;
  font-size: 1rem;
}

.versions ul {
  margin: 0;
  padding-left: 1rem;
}

.versions li {
  color: #344563;
  font-size: 0.9rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(9, 30, 66, 0.48);
  display: grid;
  place-items: center;
  z-index: 80;
}

.modal {
  width: min(760px, 92vw);
  max-height: 82vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid var(--line);
}

.modal-footer {
  border-top: 1px solid var(--line);
  border-bottom: none;
  justify-content: flex-end;
  gap: 0.6rem;
}

.modal-content {
  overflow: auto;
  padding: 0.9rem;
}

.modal-content ul {
  margin: 0;
  padding-left: 1rem;
}

.modal-content li {
  margin: 0.45rem 0;
}

.diff-panel {
  margin-top: 0.9rem;
  border-top: 1px solid var(--line);
  padding-top: 0.8rem;
}

.diff-panel h3 {
  margin: 0 0 0.5rem;
  font-size: 0.92rem;
}

.diff-controls {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  align-items: end;
}

.diff-controls label {
  display: grid;
  gap: 0.2rem;
  font-size: 0.8rem;
  color: var(--muted);
}

.diff-output {
  margin: 0.6rem 0 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f7f8fa;
  padding: 0.55rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}

.diff-line {
  display: block;
  font-size: 0.8rem;
}

.diff-added {
  color: #1f7a1f;
}

.diff-removed {
  color: #b42318;
}

.diff-equal {
  color: #4b5563;
}

.perm-section {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.7rem;
  margin-bottom: 0.8rem;
}

.perm-section h3 {
  margin: 0 0 0.5rem;
  font-size: 0.92rem;
}

.perm-label {
  display: block;
  margin: 0.3rem 0;
  color: var(--muted);
  font-size: 0.8rem;
}

.roles-grid {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.4rem;
  flex-wrap: wrap;
}

.error-line {
  margin: 0;
  color: var(--danger);
}

@media (max-width: 1080px) {
  .document-layout {
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 1rem;
  }
}

@media (max-width: 940px) {
  .document-layout {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .contents-rail {
    position: static;
  }

  .toc-panel {
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
    padding: 0 0 0.5rem;
    margin-bottom: 0.2rem;
  }
}

@media (max-width: 860px) {
  .document-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.45rem;
  }

  .title-row {
    flex-direction: column;
    gap: 0.5rem;
  }

  .title-main {
    width: 100%;
  }

  .edit-btn {
    margin-top: 0;
    align-self: flex-start;
  }

  .document-actions {
    flex-wrap: wrap;
    overflow: visible;
    white-space: normal;
  }

  .document-title-zone {
    margin-top: clamp(10px, 2vh, 18px);
  }
}
</style>
