import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchResults from '../src/components/SearchResults.vue';

describe('SearchResults', () => {
  it('renders result titles', () => {
    const wrapper = mount(SearchResults, {
      props: {
        items: [
          {
            id: '1',
            title: 'Test page',
            slug: 'test-page',
            snippet: 'Snippet',
            updatedAt: '2026-03-02',
            space: { id: 's1', key: 'ENG', name: 'Engineering' },
            canonicalUrl: '/space/ENG/pages/1-test-page',
          },
        ],
      },
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Test page');
  });
});
