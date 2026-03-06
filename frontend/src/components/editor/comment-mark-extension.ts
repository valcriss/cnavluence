import { Mark, mergeAttributes } from '@tiptap/core';

type CommentAttrs = {
  id: string;
  text: string;
  author?: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setCommentMark: (attrs: CommentAttrs) => ReturnType;
      unsetCommentMark: () => ReturnType;
    };
  }
}

export const CommentMark = Mark.create({
  name: 'commentMark',
  inclusive: false,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-comment-id') || '',
        renderHTML: (attributes) => ({ 'data-comment-id': String(attributes.id || '') }),
      },
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-comment-text') || '',
        renderHTML: (attributes) => ({ 'data-comment-text': String(attributes.text || '') }),
      },
      author: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-comment-author') || '',
        renderHTML: (attributes) => ({ 'data-comment-author': String(attributes.author || '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'comment-annotation',
        title: String((HTMLAttributes as Record<string, unknown>)['data-comment-text'] || ''),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCommentMark:
        (attrs: CommentAttrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetCommentMark:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
