import { defineStore } from 'pinia';
import { api } from '../services/api';
import type { BacklinkItem, Page, PageRestrictions, TemplateItem } from '../types/domain';

export const usePagesStore = defineStore('pages', {
  state: () => ({
    tree: [] as Page[],
    currentPage: null as Page | null,
    currentCanonicalUrl: '' as string,
    content: null as unknown,
    versions: [] as Array<{ id: string; createdAt: string; reason: string; restoredFromId?: string | null }>,
    restrictions: null as PageRestrictions | null,
    backlinks: [] as BacklinkItem[],
    templates: [] as TemplateItem[],
  }),
  actions: {
    async fetchTree(spaceId: string) {
      const response = await api.get(`/pages/space/${spaceId}/tree`);
      this.tree = response.data.pages;
    },
    async loadPage(pageId: string) {
      const [pageResponse, contentResponse, versionsResponse, backlinksResponse] = await Promise.all([
        api.get(`/pages/${pageId}`),
        api.get(`/content/${pageId}`),
        api.get(`/versions/${pageId}`),
        api.get(`/pages/${pageId}/backlinks`),
      ]);
      this.currentPage = pageResponse.data.page;
      this.currentCanonicalUrl = String(pageResponse.data.canonicalUrl ?? '');
      this.content = contentResponse.data.content.currentContent;
      this.versions = versionsResponse.data.versions;
      this.backlinks = backlinksResponse.data.backlinks as BacklinkItem[];
    },
    async loadBacklinks(pageId: string) {
      const response = await api.get(`/pages/${pageId}/backlinks`);
      this.backlinks = response.data.backlinks as BacklinkItem[];
    },
    async loadTemplates(spaceId: string) {
      const response = await api.get(`/pages/space/${spaceId}/templates`);
      this.templates = response.data.templates as TemplateItem[];
    },
    async loadRestrictions(pageId: string) {
      const response = await api.get(`/pages/${pageId}/restrictions`);
      this.restrictions = response.data as PageRestrictions;
    },
    async saveRestrictions(
      pageId: string,
      payload: {
        view: { userEmails: string[]; roles: Array<'SPACE_ADMIN' | 'SPACE_EDITOR' | 'SPACE_VIEWER'> };
        edit: { userEmails: string[]; roles: Array<'SPACE_ADMIN' | 'SPACE_EDITOR' | 'SPACE_VIEWER'> };
      },
    ) {
      await api.put(`/pages/${pageId}/restrictions`, payload);
      await this.loadRestrictions(pageId);
    },
    async loadVersions(pageId: string) {
      const response = await api.get(`/versions/${pageId}`);
      this.versions = response.data.versions;
    },
    async saveContent(pageId: string, content: unknown) {
      const response = await api.put(`/content/${pageId}`, { content });
      this.content = response.data.content.currentContent;
      await this.loadBacklinks(pageId);
    },
    async createManualVersion(pageId: string) {
      await api.post('/versions/manual', { pageId });
      await this.loadVersions(pageId);
    },
    async createPage(spaceId: string, title: string, parentId: string | null = null, templatePageId?: string) {
      const response = await api.post('/pages', {
        spaceId,
        title,
        parentId,
        templatePageId,
      });
      return response.data.page as Page;
    },
    async renamePage(pageId: string, title: string) {
      const response = await api.patch(`/pages/${pageId}/rename`, { title });
      const updated = response.data.page as Page;
      if (this.currentPage?.id === pageId) {
        this.currentPage = updated;
      }
      this.tree = this.tree.map((page) => (page.id === pageId ? updated : page));
      return updated;
    },
    async movePage(pageId: string, parentId: string | null) {
      const response = await api.patch(`/pages/${pageId}/move`, { parentId });
      const moved = response.data.page as Page;
      this.tree = this.tree.map((page) => (page.id === pageId ? moved : page));
      if (this.currentPage?.id === pageId) {
        this.currentPage = moved;
      }
      return moved;
    },
  },
});
