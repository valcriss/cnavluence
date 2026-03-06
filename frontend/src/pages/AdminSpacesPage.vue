<template>
  <section class="admin-page">
    <header>
      <h1><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Administration du site</h1>
      <p>La gestion des collections est disponible dans les parametres.</p>
    </header>
    <RouterLink to="/settings" class="open-settings">
      <i class="fa-solid fa-gear" aria-hidden="true"></i>Ouvrir les parametres
    </RouterLink>
  </section>
</template>

<script setup lang="ts">
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

.open-settings {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
</style>
