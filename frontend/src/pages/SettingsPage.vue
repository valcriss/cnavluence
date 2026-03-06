<template>
  <section class="scene settings-page">
    <header class="surface page-head">
      <h1><i class="fa-solid fa-gear" aria-hidden="true"></i>Parametres</h1>
      <p>Gestion globale des collections et des utilisateurs (SITE_ADMIN).</p>
    </header>

    <p v-if="!isSiteAdmin" class="surface empty">Acces reserve aux administrateurs du site.</p>

    <template v-else>
      <nav class="surface tabs" aria-label="Onglets settings">
        <button type="button" :class="{ active: activeTab === 'collections' }" @click="activeTab = 'collections'">
          Collections
        </button>
        <button type="button" :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'">Utilisateurs</button>
      </nav>

      <section v-if="activeTab === 'collections'" class="surface panel collections-panel">
        <header class="panel-header">
          <h2>Collections actives</h2>
          <button type="button" @click="startCreate">Ajouter une collection</button>
        </header>

        <form v-if="createMode" class="edit-form" @submit.prevent="submitCreate">
          <h3>Nouvelle collection</h3>
          <label>
            Nom
            <input v-model.trim="createForm.name" required minlength="2" maxlength="120" />
          </label>
          <label>
            Description
            <textarea v-model.trim="createForm.description" maxlength="500" rows="3"></textarea>
          </label>
          <label>
            Proprietaire
            <select v-model="createForm.ownerUserId" required>
              <option disabled value="">Selectionner un proprietaire</option>
              <option v-for="user in users" :key="user.id" :value="user.id">
                {{ user.displayName }} ({{ user.email }})
              </option>
            </select>
          </label>
          <div class="actions">
            <button :disabled="busy" type="submit">Creer</button>
            <button :disabled="busy" type="button" class="ghost" @click="cancelCreate">Annuler</button>
          </div>
        </form>

        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

        <table v-if="activeCollections.length" class="collections-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Tag</th>
              <th>Proprietaires</th>
              <th>Pages</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="collection in activeCollections" :key="collection.id">
              <td>
                <strong>{{ collection.name }}</strong>
                <p>{{ collection.description || 'Aucune description' }}</p>
              </td>
              <td>
                <span v-if="collection.tag" class="tag-pill">{{ collection.tag }}</span>
                <span v-else>-</span>
              </td>
              <td>{{ collection.owners.map((owner) => owner.displayName).join(', ') || '-' }}</td>
              <td>{{ collection.pageCount }}</td>
              <td class="row-actions">
                <button type="button" class="ghost" @click="startEdit(collection.id)">Modifier</button>
                <button
                  type="button"
                  class="danger"
                  :disabled="collection.isPersonal"
                  :title="collection.isPersonal ? 'Les collections Personnel ne peuvent pas etre archivees' : ''"
                  @click="archiveCollection(collection.id)"
                >
                  Archiver
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">Aucune collection active.</p>

        <form v-if="editMode" class="edit-form" @submit.prevent="submitEdit">
          <h3>Modifier la collection</h3>
          <label>
            Nom
            <input v-model.trim="editForm.name" required minlength="2" maxlength="120" />
          </label>
          <label>
            Description
            <textarea v-model.trim="editForm.description" maxlength="500" rows="3"></textarea>
          </label>
          <label>
            Proprietaires
            <select v-model="editForm.ownerUserIds" multiple required :disabled="Boolean(editingCollection?.isPersonal)">
              <option v-for="user in users" :key="user.id" :value="user.id">
                {{ user.displayName }} ({{ user.email }})
              </option>
            </select>
          </label>
          <p v-if="editingCollection?.isPersonal" class="hint">Collection Personnel : un seul proprietaire est autorise.</p>
          <p v-else class="hint">Maintenir Ctrl/Cmd pour selectionner plusieurs proprietaires.</p>
          <div class="actions">
            <button :disabled="busy" type="submit">Enregistrer</button>
            <button :disabled="busy" type="button" class="ghost" @click="cancelEdit">Annuler</button>
          </div>
        </form>

        <div class="trash">
          <h3>Corbeille des collections</h3>
          <table v-if="archivedCollections.length" class="collections-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Tag</th>
                <th>Pages</th>
                <th>Archivee le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="collection in archivedCollections" :key="collection.id">
                <td>
                  <strong>{{ collection.name }}</strong>
                  <p>{{ collection.description || 'Aucune description' }}</p>
                </td>
                <td>
                  <span v-if="collection.tag" class="tag-pill">{{ collection.tag }}</span>
                  <span v-else>-</span>
                </td>
                <td>{{ collection.pageCount }}</td>
                <td>{{ formatDate(collection.archivedAt) }}</td>
                <td class="row-actions">
                  <button type="button" class="ghost" @click="restoreCollection(collection.id)">Restaurer</button>
                  <button
                    type="button"
                    class="danger"
                    :disabled="collection.isPersonal"
                    :title="collection.isPersonal ? 'Les collections Personnel ne peuvent pas etre supprimees manuellement' : ''"
                    @click="deleteCollection(collection.id)"
                  >
                    Supprimer definitivement
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty">La corbeille est vide.</p>
        </div>
      </section>

      <section v-else class="surface panel users-panel">
        <header class="panel-header">
          <h2>Utilisateurs</h2>
        </header>
        <table v-if="users.length" class="users-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Role site</th>
              <th>Cree le</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.displayName }}</td>
              <td>{{ user.email }}</td>
              <td>{{ user.siteRole }}</td>
              <td>{{ formatDate(user.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">Aucun utilisateur.</p>
      </section>

      <div v-if="confirmState" class="confirm-backdrop" @click.self="closeConfirm">
        <section class="confirm-panel surface">
          <h3>{{ confirmTitle }}</h3>
          <p>{{ confirmMessage }}</p>
          <p v-if="confirmState.mode === 'delete'" class="risk-note">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            Action irreversible
          </p>

          <label v-if="confirmState.requiresName" class="confirm-input">
            Saisir le nom de la collection pour confirmer
            <input v-model.trim="confirmState.typedName" :placeholder="confirmState.collectionName" />
          </label>

          <div class="actions">
            <button class="danger" :disabled="busy || !canConfirmAction" type="button" @click="confirmAction">Confirmer</button>
            <button class="ghost" :disabled="busy" type="button" @click="closeConfirm">Annuler</button>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import axios from 'axios';
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth';
import { useSpacesStore } from '../stores/spaces';
import type { AdminCollection, SettingsUser } from '../types/domain';

const authStore = useAuthStore();
const spacesStore = useSpacesStore();

const isSiteAdmin = computed(() => authStore.user?.siteRole === 'SITE_ADMIN');
const activeTab = ref<'collections' | 'users'>('collections');
const busy = ref(false);
const errorMessage = ref('');

const users = ref<SettingsUser[]>([]);
const activeCollections = ref<AdminCollection[]>([]);
const archivedCollections = ref<AdminCollection[]>([]);

const createMode = ref(false);
const editMode = ref<string | null>(null);

type ConfirmMode = 'archive' | 'restore' | 'delete';

const confirmState = ref<{
  mode: ConfirmMode;
  collectionId: string;
  collectionName: string;
  requiresName: boolean;
  typedName: string;
} | null>(null);

const createForm = reactive({
  name: '',
  description: '',
  ownerUserId: '',
});

const editForm = reactive({
  name: '',
  description: '',
  ownerUserIds: [] as string[],
});

const formatDate = (value: string | null) => {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString();
};

const confirmTitle = computed(() => {
  if (!confirmState.value) {
    return '';
  }
  if (confirmState.value.mode === 'archive') {
    return 'Confirmer l archivage';
  }
  if (confirmState.value.mode === 'restore') {
    return 'Confirmer la restauration';
  }
  return 'Confirmer la suppression definitive';
});

const confirmMessage = computed(() => {
  if (!confirmState.value) {
    return '';
  }
  if (confirmState.value.mode === 'archive') {
    return `La collection "${confirmState.value.collectionName}" sera envoyee dans la corbeille.`;
  }
  if (confirmState.value.mode === 'restore') {
    return `La collection "${confirmState.value.collectionName}" sera restauree et redeviendra visible.`;
  }
  return `La collection "${confirmState.value.collectionName}" sera supprimee definitivement avec toutes ses donnees.`;
});

const canConfirmAction = computed(() => {
  if (!confirmState.value) {
    return false;
  }
  if (!confirmState.value.requiresName) {
    return true;
  }
  return confirmState.value.typedName === confirmState.value.collectionName;
});

const closeConfirm = () => {
  confirmState.value = null;
};

const editingCollection = computed(() => {
  if (!editMode.value) {
    return null;
  }
  return activeCollections.value.find((item) => item.id === editMode.value) ?? null;
});

const loadUsers = async () => {
  const response = await api.get('/spaces/admin/users');
  users.value = response.data.users as SettingsUser[];
};

const loadCollections = async () => {
  const [active, archived] = await Promise.all([
    spacesStore.listAdminCollections(false),
    spacesStore.listAdminCollections(true),
  ]);
  activeCollections.value = active;
  archivedCollections.value = archived;
};

const startCreate = () => {
  createMode.value = true;
  editMode.value = null;
  createForm.name = '';
  createForm.description = '';
  createForm.ownerUserId = users.value[0]?.id ?? '';
};

const cancelCreate = () => {
  createMode.value = false;
};

const startEdit = (collectionId: string) => {
  const found = activeCollections.value.find((item) => item.id === collectionId);
  if (!found) {
    return;
  }
  createMode.value = false;
  editMode.value = collectionId;
  editForm.name = found.name;
  editForm.description = found.description;
  editForm.ownerUserIds = found.owners.map((owner) => owner.id);
};

const cancelEdit = () => {
  editMode.value = null;
};

const submitCreate = async () => {
  if (!createForm.ownerUserId) {
    errorMessage.value = 'Le proprietaire est obligatoire.';
    return;
  }

  busy.value = true;
  errorMessage.value = '';
  try {
    await spacesStore.createSpace(createForm.name, createForm.description, createForm.ownerUserId);
    await Promise.all([spacesStore.fetchSpaces(), loadCollections()]);
    createMode.value = false;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Creation impossible');
    } else {
      errorMessage.value = 'Creation impossible';
    }
  } finally {
    busy.value = false;
  }
};

const submitEdit = async () => {
  if (!editMode.value) {
    return;
  }

  if (!editForm.ownerUserIds.length) {
    errorMessage.value = 'Au moins un proprietaire est requis.';
    return;
  }

  busy.value = true;
  errorMessage.value = '';
  try {
    await spacesStore.updateCollection(editMode.value, {
      name: editForm.name,
      description: editForm.description,
      ownerUserIds: [...new Set(editForm.ownerUserIds)],
    });
    await Promise.all([spacesStore.fetchSpaces(), loadCollections()]);
    editMode.value = null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Mise a jour impossible');
    } else {
      errorMessage.value = 'Mise a jour impossible';
    }
  } finally {
    busy.value = false;
  }
};

const archiveCollection = async (collectionId: string) => {
  const collection = activeCollections.value.find((item) => item.id === collectionId);
  if (!collection) {
    return;
  }

  confirmState.value = {
    mode: 'archive',
    collectionId,
    collectionName: collection.name,
    requiresName: collection.pageCount > 0,
    typedName: '',
  };
};

const runArchiveCollection = async (collectionId: string, confirmName?: string) => {

  busy.value = true;
  errorMessage.value = '';
  try {
    await spacesStore.archiveCollection(collectionId, confirmName);
    await Promise.all([spacesStore.fetchSpaces(), loadCollections()]);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Archivage impossible');
    } else {
      errorMessage.value = 'Archivage impossible';
    }
  } finally {
    busy.value = false;
  }
};

const restoreCollection = async (collectionId: string) => {
  const collection = archivedCollections.value.find((item) => item.id === collectionId);
  if (!collection) {
    return;
  }

  confirmState.value = {
    mode: 'restore',
    collectionId,
    collectionName: collection.name,
    requiresName: false,
    typedName: '',
  };
};

const runRestoreCollection = async (collectionId: string) => {
  busy.value = true;
  errorMessage.value = '';
  try {
    await spacesStore.restoreCollection(collectionId);
    await Promise.all([spacesStore.fetchSpaces(), loadCollections()]);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Restauration impossible');
    } else {
      errorMessage.value = 'Restauration impossible';
    }
  } finally {
    busy.value = false;
  }
};

const deleteCollection = async (collectionId: string) => {
  const collection = archivedCollections.value.find((item) => item.id === collectionId);
  if (!collection) {
    return;
  }

  confirmState.value = {
    mode: 'delete',
    collectionId,
    collectionName: collection.name,
    requiresName: true,
    typedName: '',
  };
};

const runDeleteCollection = async (collectionId: string, confirmName: string) => {
  if (!confirmName) {
    return;
  }

  busy.value = true;
  errorMessage.value = '';
  try {
    await spacesStore.deleteCollectionPermanently(collectionId, confirmName);
    await Promise.all([spacesStore.fetchSpaces(), loadCollections()]);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Suppression impossible');
    } else {
      errorMessage.value = 'Suppression impossible';
    }
  } finally {
    busy.value = false;
  }
};

const confirmAction = async () => {
  if (!confirmState.value || !canConfirmAction.value) {
    return;
  }

  const payload = { ...confirmState.value };
  closeConfirm();

  if (payload.mode === 'archive') {
    await runArchiveCollection(payload.collectionId, payload.requiresName ? payload.typedName : undefined);
    return;
  }

  if (payload.mode === 'restore') {
    await runRestoreCollection(payload.collectionId);
    return;
  }

  await runDeleteCollection(payload.collectionId, payload.typedName);
};

onMounted(async () => {
  if (!isSiteAdmin.value) {
    return;
  }

  busy.value = true;
  errorMessage.value = '';
  try {
    await Promise.all([loadUsers(), loadCollections()]);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Chargement impossible');
    } else {
      errorMessage.value = 'Chargement impossible';
    }
  } finally {
    busy.value = false;
  }
});
</script>

<style scoped>
.settings-page {
  display: grid;
  gap: 0.8rem;
}

.page-head {
  padding: 1rem;
}

h1 {
  margin: 0;
  font-size: 1.2rem;
}

p {
  margin: 0.3rem 0 0;
  color: var(--muted);
}

.tabs {
  display: flex;
  gap: 0.4rem;
  padding: 0.5rem;
}

.tabs button {
  border: 0;
  background: transparent;
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  color: var(--text-secondary);
}

.tabs button.active {
  background: var(--sidebar-active);
  color: var(--ink);
  font-weight: 600;
}

.panel {
  padding: 1rem;
  display: grid;
  gap: 0.8rem;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-header h2 {
  margin: 0;
  font-size: 1rem;
}

.collections-table,
.users-table {
  width: 100%;
  border-collapse: collapse;
}

.collections-table th,
.collections-table td,
.users-table th,
.users-table td {
  padding: 0.5rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.collections-table p {
  margin: 0.2rem 0 0;
}

.row-actions {
  display: flex;
  gap: 0.4rem;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  font-size: 0.72rem;
  color: var(--text-secondary);
  background: #fff;
}

.danger {
  background: var(--danger);
  color: #fff;
}

.danger:hover {
  filter: brightness(1.05);
}

.ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text-secondary);
}

.edit-form {
  display: grid;
  gap: 0.6rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.8rem;
}

.edit-form h3 {
  margin: 0;
  font-size: 0.95rem;
}

.edit-form label {
  display: grid;
  gap: 0.3rem;
}

.actions {
  display: flex;
  gap: 0.4rem;
}

.hint {
  margin: -0.2rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}

.trash {
  display: grid;
  gap: 0.5rem;
}

.trash h3 {
  margin: 0;
  font-size: 0.95rem;
}

.empty {
  padding: 0.75rem;
  color: var(--muted);
}

.error {
  color: var(--danger);
}

.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.35);
  display: grid;
  place-items: center;
  z-index: 20;
}

.confirm-panel {
  width: min(560px, calc(100vw - 2rem));
  display: grid;
  gap: 0.65rem;
  padding: 1rem;
}

.confirm-panel h3 {
  margin: 0;
  font-size: 1rem;
}

.confirm-input {
  display: grid;
  gap: 0.3rem;
}

.risk-note {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  color: var(--danger);
  font-weight: 600;
}
</style>
