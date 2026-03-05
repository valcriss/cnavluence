<template>
  <section class="login">
    <section class="panel">
      <h2><i class="fa-solid fa-id-card" aria-hidden="true"></i>Connexion SSO</h2>
      <p v-if="loading">Finalisation de l authentification...</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
      <RouterLink v-if="!loading" to="/login" class="back-link">
        <i class="fa-regular fa-circle-left" aria-hidden="true"></i>Retour a la connexion
      </RouterLink>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const loading = ref(true);
const errorMessage = ref('');

onMounted(async () => {
  const callbackError = route.query.error;
  const callbackErrorDescription = route.query.error_description;
  if (typeof callbackError === 'string' && callbackError) {
    loading.value = false;
    const details = typeof callbackErrorDescription === 'string' && callbackErrorDescription
      ? `: ${callbackErrorDescription}`
      : '';
    errorMessage.value = `Erreur de callback SSO (${callbackError})${details}`;
    return;
  }

  const token = route.query.accessToken;
  if (typeof token !== 'string' || !token) {
    loading.value = false;
    errorMessage.value = 'Jeton SSO manquant';
    return;
  }

  try {
    await authStore.loginWithAccessToken(token);
    await router.replace('/search');
  } catch {
    loading.value = false;
    errorMessage.value = 'Echec de connexion SSO';
  }
});
</script>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--bg);
}

.panel {
  width: min(420px, 90vw);
  background: var(--paper);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  padding: 1.25rem;
}

h2 {
  margin-top: 0;
}

.error {
  margin: 0;
  color: var(--danger);
}

.back-link {
  display: inline-block;
  margin-top: 0.8rem;
  color: var(--accent-strong);
  font-size: 0.9rem;
}
</style>
