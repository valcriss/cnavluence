import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import ResizableImageNodeView from './ResizableImageNodeView.vue';

type Align = 'left' | 'center' | 'right';
type BorderStyle = 'solid' | 'dashed';

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeAlign(value: unknown): Align {
  if (value === 'center' || value === 'right') {
    return value;
  }
  return 'left';
}

function normalizeBorderStyle(value: unknown): BorderStyle {
  return value === 'dashed' ? 'dashed' : 'solid';
}

function normalizeHexColor(value: unknown): string {
  const color = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }
  return '#d0d7de';
}

function buildImageStyle(attrs: Record<string, unknown>): string {
  const widthPct = clampNumber(attrs.widthPct, 10, 100, 100);
  const borderWidth = clampNumber(attrs.borderWidth, 0, 12, 0);
  const borderStyle = normalizeBorderStyle(attrs.borderStyle);
  const borderColor = normalizeHexColor(attrs.borderColor);

  const styles = [
    'display:block',
    'max-width:100%',
    'height:auto',
    `width:${widthPct}%`,
    `border:${borderWidth > 0 ? `${borderWidth}px ${borderStyle} ${borderColor}` : 'none'}`,
  ];

  return styles.join(';');
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      widthPct: {
        default: 100,
        parseHTML: (element) => clampNumber(element.getAttribute('data-width-pct'), 10, 100, 100),
        renderHTML: (attributes) => ({
          'data-width-pct': clampNumber(attributes.widthPct, 10, 100, 100),
        }),
      },
      align: {
        default: 'left',
        parseHTML: (element) => normalizeAlign(element.getAttribute('data-align')),
        renderHTML: (attributes) => ({
          'data-align': normalizeAlign(attributes.align),
        }),
      },
      borderWidth: {
        default: 0,
        parseHTML: (element) => clampNumber(element.getAttribute('data-border-width'), 0, 12, 0),
        renderHTML: (attributes) => ({
          'data-border-width': clampNumber(attributes.borderWidth, 0, 12, 0),
        }),
      },
      borderStyle: {
        default: 'solid',
        parseHTML: (element) => normalizeBorderStyle(element.getAttribute('data-border-style')),
        renderHTML: (attributes) => ({
          'data-border-style': normalizeBorderStyle(attributes.borderStyle),
        }),
      },
      borderColor: {
        default: '#d0d7de',
        parseHTML: (element) => normalizeHexColor(element.getAttribute('data-border-color')),
        renderHTML: (attributes) => ({
          'data-border-color': normalizeHexColor(attributes.borderColor),
        }),
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = { ...(HTMLAttributes as Record<string, unknown>) };
    const imageStyle = buildImageStyle(attrs);

    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        style: imageStyle,
      }),
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(ResizableImageNodeView);
  },
});
