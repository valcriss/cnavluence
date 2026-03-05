import { defineStore } from 'pinia';
import { api } from '../services/api';
import type { Space } from '../types/domain';

export const useSpacesStore = defineStore('spaces', {
  state: () => ({
    spaces: [] as Space[],
    selectedSpaceId: null as string | null,
  }),
  actions: {
    async fetchSpaces() {
      const response = await api.get('/spaces');
      this.spaces = response.data.spaces;
      if (!this.selectedSpaceId && this.spaces.length) {
        this.selectedSpaceId = this.spaces[0].id;
      }
    },
    selectSpace(spaceId: string) {
      this.selectedSpaceId = spaceId;
    },
    async createSpace(key: string, name: string) {
      const response = await api.post('/spaces', { key, name });
      const created = response.data.space as Space;
      this.spaces = [...this.spaces, { ...created, role: 'SPACE_ADMIN' }].sort((a, b) => a.name.localeCompare(b.name));
      this.selectedSpaceId = created.id;
      return created;
    },
  },
});
