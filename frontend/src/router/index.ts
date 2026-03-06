import { createRouter, createWebHistory } from 'vue-router';
import LoginPage from '../pages/LoginPage.vue';
import RegisterPage from '../pages/RegisterPage.vue';
import OidcCallbackPage from '../pages/OidcCallbackPage.vue';
import MainLayout from '../layouts/MainLayout.vue';
import PageViewPage from '../pages/PageViewPage.vue';
import SearchPage from '../pages/SearchPage.vue';
import AdminSpacesPage from '../pages/AdminSpacesPage.vue';
import AuditPage from '../pages/AuditPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import { useAuthStore } from '../stores/auth';
import { pinia } from '../stores/pinia';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginPage },
    { path: '/register', component: RegisterPage },
    { path: '/auth/oidc/callback', component: OidcCallbackPage },
    {
      path: '/',
      component: MainLayout,
      children: [
        { path: '', redirect: '/search' },
        { path: 'home', redirect: '/search' },
        { path: 'search', component: SearchPage },
        { path: 'audit', component: AuditPage },
        { path: 'settings', component: SettingsPage },
        { path: 'admin/spaces', component: AdminSpacesPage },
        { path: 'space/:spaceKey/pages/:pageIdSlug', component: PageViewPage, props: true },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore(pinia);
  const publicPaths = new Set(['/login', '/register', '/auth/oidc/callback']);

  if (publicPaths.has(to.path)) {
    if (authStore.user && authStore.accessToken) {
      return '/search';
    }
    return true;
  }

  if (authStore.user && authStore.accessToken) {
    if ((to.path.startsWith('/admin') || to.path.startsWith('/settings')) && authStore.user.siteRole !== 'SITE_ADMIN') {
      return '/search';
    }
    return true;
  }

  const restored = await authStore.refreshSession();
  if (restored) {
    if ((to.path.startsWith('/admin') || to.path.startsWith('/settings')) && authStore.user?.siteRole !== 'SITE_ADMIN') {
      return '/search';
    }
    return true;
  }

  return '/login';
});
