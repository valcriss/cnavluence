<template>
  <div class="layout">
    <SidebarTree />
    <main class="content" :class="{ 'document-shell': isDocumentRoute }">
      <header v-if="!isDocumentRoute" class="topbar">
        <div class="topbar-left">
          <strong class="workspace"><i class="fa-solid fa-layer-group" aria-hidden="true"></i>Espace de travail</strong>
        </div>
        <div class="topbar-right">
          <RouterLink v-if="isSiteAdmin" to="/admin/spaces" class="admin-link">
            <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Administration
          </RouterLink>
          <button class="logout" @click="logout"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>Se deconnecter</button>
        </div>
      </header>
      <section class="content-body" :class="{ 'document-reading': isDocumentReading }">
        <router-view />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SidebarTree from '../components/SidebarTree.vue';
import { useSpacesStore } from '../stores/spaces';
import { usePagesStore } from '../stores/pages';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const spacesStore = useSpacesStore();
const pagesStore = usePagesStore();
const isSiteAdmin = computed(() => authStore.user?.siteRole === 'SITE_ADMIN');
const isDocumentRoute = computed(() => /^\/space\/[^/]+\/pages\/[^/]+$/.test(route.path));
const isDocumentReading = computed(() => {
  const path = route.path;
  const editQuery = String(route.query.edit ?? '');
  return /^\/space\/[^/]+\/pages\/[^/]+$/.test(path) && editQuery !== '1';
});

onMounted(async () => {
  await spacesStore.fetchSpaces();
  if (spacesStore.selectedSpaceId) {
    await pagesStore.fetchTree(spacesStore.selectedSpaceId);
  }
});

const logout = async () => {
  await authStore.logout();
  await router.push('/login');
};
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
}

.content.document-shell {
  background: #fbfbfc;
}

.topbar {
  height: 56px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(6px);
  padding: 0 clamp(0.9rem, 1.4vw, 1.35rem);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.workspace {
  font-size: 0.9rem;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.admin-link {
  color: var(--text-secondary);
  font-size: 0.82rem;
  border-radius: 6px;
  padding: 0.28rem 0.48rem;
}

.admin-link:hover {
  text-decoration: none;
  background: var(--sidebar-active);
}

.logout {
  font-size: 0.85rem;
  padding: 0.35rem 0.62rem;
}

.content-body {
  padding: clamp(0.7rem, 1.2vw, 1rem) clamp(0.85rem, 2vw, 1.6rem);
  overflow: auto;
  height: calc(100vh - 56px);
  background-color: white;
}

.content.document-shell .content-body {
  height: 100vh;
  padding: 0.5rem 1rem 1rem;
}

.content-body.document-reading {
}
</style>
