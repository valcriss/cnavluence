<template>
  <section class="login">
    <form @submit.prevent="submit">
      <h2><i class="fa-solid fa-user-plus" aria-hidden="true"></i>Creer votre compte</h2>
      <p class="subtitle">Demarrez un espace et collaborez sur les pages en temps reel.</p>
      <input v-model="displayName" type="text" placeholder="Nom affiche" required />
      <input v-model="email" type="email" placeholder="Email" required />
      <input v-model="password" type="password" placeholder="Mot de passe (8+ caracteres)" minlength="8" required />
      <button class="primary" type="submit"><i class="fa-solid fa-check" aria-hidden="true"></i>S inscrire</button>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p class="switch">
        Deja inscrit ?
        <RouterLink to="/login"><i class="fa-regular fa-id-badge" aria-hidden="true"></i>Se connecter</RouterLink>
      </p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();
const displayName = ref('');
const email = ref('');
const password = ref('');
const errorMessage = ref('');

const submit = async () => {
  errorMessage.value = '';
  try {
    await authStore.register(email.value, displayName.value, password.value);
    await router.push('/search');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      errorMessage.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Echec de l inscription');
      return;
    }
    errorMessage.value = 'Echec de l inscription';
  }
};
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

.switch {
  margin: 0;
  color: var(--muted);
}

.error {
  margin: 0;
  color: var(--danger);
}
</style>
