import { defineStore } from 'pinia';
import { api } from '../services/api';
import type { AdminCollection, Space } from '../types/domain';

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
    async createSpace(name: string, description: string, ownerUserId: string) {
      const response = await api.post('/spaces', { name, description, ownerUserId });
      const created = response.data.space as AdminCollection;
      const localSpace: Space = {
        id: created.id,
        key: created.key,
        name: created.name,
        description: created.description,
        archivedAt: created.archivedAt,
        isPersonal: created.isPersonal,
        tag: created.tag,
        role: 'SPACE_ADMIN',
      };
      this.spaces = [...this.spaces, localSpace].sort((a, b) => a.name.localeCompare(b.name));
      this.selectedSpaceId = created.id;
      return created;
    },
    async listAdminCollections(archived = false) {
      const response = await api.get('/spaces/admin/collections', { params: { archived } });
      return response.data.spaces as AdminCollection[];
    },
    async updateCollection(spaceId: string, payload: { name: string; description: string; ownerUserIds: string[] }) {
      const response = await api.patch(`/spaces/${spaceId}`, payload);
      const updated = response.data.space as AdminCollection;
      this.spaces = this.spaces
        .map((space) =>
          space.id === updated.id
            ? {
                ...space,
                key: updated.key,
                name: updated.name,
                description: updated.description,
                archivedAt: updated.archivedAt,
                isPersonal: updated.isPersonal,
                tag: updated.tag,
              }
            : space,
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      return updated;
    },
    async archiveCollection(spaceId: string, confirmName?: string) {
      await api.post(`/spaces/admin/collections/${spaceId}/archive`, confirmName ? { confirmName } : {});
      this.spaces = this.spaces.filter((space) => space.id !== spaceId);
      if (this.selectedSpaceId === spaceId) {
        this.selectedSpaceId = this.spaces[0]?.id ?? null;
      }
    },
    async restoreCollection(spaceId: string) {
      await api.post(`/spaces/admin/collections/${spaceId}/restore`);
    },
    async deleteCollectionPermanently(spaceId: string, confirmName: string) {
      await api.delete(`/spaces/admin/collections/${spaceId}/permanent`, {
        data: { confirmName },
      });
      this.spaces = this.spaces.filter((space) => space.id !== spaceId);
      if (this.selectedSpaceId === spaceId) {
        this.selectedSpaceId = this.spaces[0]?.id ?? null;
      }
    },
  },
});
