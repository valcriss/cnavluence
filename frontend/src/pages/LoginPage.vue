<template>
  <section class="login">
    <form @submit.prevent="submit">
      <h2><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>Connexion a Cnavluence</h2>
      <p class="subtitle">Collaboration type Confluence pour la documentation de votre equipe.</p>
      <input v-model="email" type="email" placeholder="Email" required />
      <input v-model="password" type="password" placeholder="Mot de passe" required />
      <button class="primary" :disabled="loadingLocal || loadingOidc" type="submit">
        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>{{ loadingLocal ? 'Connexion...' : 'Se connecter' }}
      </button>
      <button
        class="secondary"
        :disabled="loadingLocal || loadingOidc"
        type="button"
        data-testid="sso-login"
        @click="loginWithOidc"
      >
        <i class="fa-solid fa-building-shield" aria-hidden="true"></i>Continuer avec le SSO
      </button>
      <p class="hint">Utilisez le SSO si votre espace est connecte a un fournisseur OpenID Connect.</p>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p class="switch">
        Pas de compte ?
        <RouterLink to="/register"><i class="fa-regular fa-user" aria-hidden="true"></i>Creer un compte</RouterLink>
      </p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { api } from '../services/api';

const router = useRouter();
const authStore = useAuthStore();
const email = ref('admin@cnavluence.local');
const password = ref('admin1234');
const errorMessage = ref('');
const loadingLocal = ref(false);
const loadingOidc = ref(false);

const shouldSkipTransparentLogin = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('sso') === '1';
};

const submit = async () => {
  errorMessage.value = '';
  loadingLocal.value = true;
  try {
    await authStore.login(email.value, password.value);
    await router.push('/search');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Echec de connexion');
      return;
    }
    errorMessage.value = 'Echec de connexion';
  } finally {
    loadingLocal.value = false;
  }
};

const loginWithOidc = async () => {
  errorMessage.value = '';
  loadingOidc.value = true;
  try {
    const returnTo = `${window.location.origin}/auth/oidc/callback`;
    const response = await api.get('/auth/oidc/start', { params: { returnTo } });
    window.location.href = String(response.data.authorizationUrl);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const apiError = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Echec de connexion OIDC');
      errorMessage.value = apiError === 'OIDC disabled' ? 'Le SSO n est pas configure pour cet environnement.' : apiError;
      return;
    }
    errorMessage.value = 'Echec de connexion OIDC';
  } finally {
    loadingOidc.value = false;
  }
};

onMounted(async () => {
  if (shouldSkipTransparentLogin()) {
    return;
  }

  try {
    const response = await api.get('/auth/config');
    const authProvider = String(response.data?.authProvider ?? 'local').toLowerCase();
    const transparentLogin = Boolean(response.data?.oidcTransparentLogin);
    if (authProvider === 'oidc' && transparentLogin) {
      await loginWithOidc();
    }
  } catch (_error) {
    return;
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

form {
  width: min(420px, 90vw);
  background: var(--paper);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  padding: 1.25rem;
  display: grid;
  gap: 0.65rem;
  box-shadow: 0 8px 24px rgba(9, 30, 66, 0.08);
}

h2 {
  margin: 0;
  font-size: 1.2rem;
}

.subtitle {
  margin: 0 0 0.15rem;
  color: var(--muted);
  font-size: 0.88rem;
}

.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.primary:hover {
  background: var(--accent-strong);
}

.secondary {
  background: transparent;
}

.switch {
  margin: 0;
  color: var(--muted);
}

.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}

.error {
  margin: 0;
  color: var(--danger);
}
</style>
