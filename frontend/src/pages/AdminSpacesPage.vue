<template>
  <section class="admin-page">
    <header>
      <h1><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Administration du site</h1>
      <p>Creer et gerer des espaces (SITE_ADMIN uniquement).</p>
    </header>

    <form class="admin-form" @submit.prevent="submit">
      <input v-model.trim="name" placeholder="Nom de l espace" required />
      <input v-model.trim="key" placeholder="SPACE_KEY" required />
      <button :disabled="loading" type="submit"><i class="fa-solid fa-plus" aria-hidden="true"></i>Creer l espace</button>
    </form>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { useSpacesStore } from '../stores/spaces';
import { usePagesStore } from '../stores/pages';

const spacesStore = useSpacesStore();
const pagesStore = usePagesStore();
const name = ref('');
const key = ref('');
const loading = ref(false);
const errorMessage = ref('');

const normalizeKey = (value: string) =>
  value
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 12);

const submit = async () => {
  errorMessage.value = '';
  loading.value = true;
  try {
    const created = await spacesStore.createSpace(normalizeKey(key.value), name.value);
    await pagesStore.fetchTree(created.id);
    name.value = '';
    key.value = '';
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de creer l espace');
    } else {
      errorMessage.value = 'Impossible de creer l espace';
    }
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.admin-page {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 1rem;
  display: grid;
  gap: 0.9rem;
}

h1 {
  margin: 0;
  font-size: 1.2rem;
}

p {
  margin: 0.2rem 0 0;
  color: var(--muted);
}

.admin-form {
  display: grid;
  gap: 0.5rem;
  max-width: 420px;
}

.error {
  color: var(--danger);
}
</style>
