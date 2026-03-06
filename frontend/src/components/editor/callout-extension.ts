import { Node, mergeAttributes } from '@tiptap/core';

type CalloutType = 'info' | 'warning' | 'tip' | 'danger';

function normalizeType(value: unknown): CalloutType {
  if (value === 'warning' || value === 'tip' || value === 'danger') {
    return value;
  }
  return 'info';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (type?: CalloutType) => ReturnType;
      updateCalloutType: (type: CalloutType) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (element) => normalizeType(element.getAttribute('data-callout-type')),
        renderHTML: (attributes) => ({
          'data-callout-type': normalizeType(attributes.type),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout-type]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const type = normalizeType(attrs['data-callout-type']);
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: `callout callout-${type}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (type: CalloutType = 'info') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { type },
            content: [{ type: 'paragraph' }],
          }),
      updateCalloutType:
        (type: CalloutType) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { type }),
    };
  },
});
