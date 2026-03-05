import { ref } from 'vue';
import { api } from '../services/api';
import type { SearchItem } from '../types/domain';

export function useInfiniteSearch() {
  const query = ref('');
  const items = ref<SearchItem[]>([]);
  const cursor = ref<string | null>(null);
  const loading = ref(false);
  const done = ref(false);

  const search = async (spaceId?: string) => {
    loading.value = true;
    try {
      const response = await api.get('/search', {
        params: {
          q: query.value,
          cursor: cursor.value,
          spaceId,
        },
      });

      const nextItems: SearchItem[] = response.data.items;
      const seen = new Set(items.value.map((item) => item.id));
      const merged = [...items.value];
      for (const item of nextItems) {
        if (seen.has(item.id)) {
          continue;
        }
        seen.add(item.id);
        merged.push(item);
      }
      items.value = merged;
      cursor.value = response.data.nextCursor;
      done.value = !response.data.nextCursor;
    } finally {
      loading.value = false;
    }
  };

  const reset = () => {
    items.value = [];
    cursor.value = null;
    done.value = false;
  };

  return {
    query,
    items,
    loading,
    done,
    search,
    reset,
  };
}
