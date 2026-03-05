import { describe, expect, it } from 'vitest';
import { extractLinkedPageIds } from '../../src/modules/backlinks/backlinks.service.js';

describe('backlinks extraction', () => {
  it('extracts linked page ids from attrs.pageId and href', () => {
    const pageA = 'caaaaaaaaaaaaaaaaaaaaaaa';
    const pageB = 'cbbbbbbbbbbbbbbbbbbbbbbb';
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Link',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: `/space/ENG/pages/${pageA}-overview`,
                  },
                },
              ],
            },
            {
              type: 'mention',
              attrs: {
                pageId: pageB,
              },
            },
          ],
        },
      ],
    };

    const ids = extractLinkedPageIds(content);
    expect(ids.sort()).toEqual([pageA, pageB].sort());
  });

  it('deduplicates repeated links and supports page:// scheme', () => {
    const pageId = 'cddddddddddddddddddddddd';
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `page://${pageId}` },
            {
              type: 'text',
              text: 'dup',
              marks: [{ type: 'link', attrs: { href: `https://example.test/space/X/pages/${pageId}-slug` } }],
            },
          ],
        },
      ],
    };

    const ids = extractLinkedPageIds(content);
    expect(ids).toEqual([pageId]);
  });
});
