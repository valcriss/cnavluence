import { defineStore } from 'pinia';
import axios from 'axios';
import { API_BASE_URL, api, setAccessToken } from '../services/api';
import type { User } from '../types/domain';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    accessToken: null as string | null,
    loading: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
  },
  actions: {
    async login(email: string, password: string) {
      this.loading = true;
      try {
        const response = await api.post('/auth/login', { email, password });
        this.accessToken = response.data.accessToken;
        this.user = response.data.user;
        setAccessToken(this.accessToken);
      } finally {
        this.loading = false;
      }
    },
    async register(email: string, displayName: string, password: string) {
      this.loading = true;
      try {
        const response = await api.post('/auth/register', { email, displayName, password });
        this.accessToken = response.data.accessToken;
        this.user = response.data.user;
        setAccessToken(this.accessToken);
      } finally {
        this.loading = false;
      }
    },
    async refreshSession() {
      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });

        this.accessToken = response.data.accessToken;
        setAccessToken(this.accessToken);
        await this.loadMe();
        return true;
      } catch {
        this.user = null;
        this.accessToken = null;
        setAccessToken(null);
        return false;
      }
    },
    async loadMe() {
      if (!this.accessToken) {
        return;
      }
      const response = await api.get('/auth/me');
      this.user = response.data.user;
    },
    async logout() {
      await api.post('/auth/logout');
      this.user = null;
      this.accessToken = null;
      setAccessToken(null);
    },
    async loginWithAccessToken(token: string) {
      this.accessToken = token;
      setAccessToken(token);
      await this.loadMe();
    },
  },
});
