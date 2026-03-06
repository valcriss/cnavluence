<template>
  <NodeViewWrapper
    as="div"
    class="resizable-image-wrapper"
    :class="[`align-${align}`]"
    contenteditable="false"
  >
    <div class="resizable-image-frame" :style="frameStyle">
      <img :src="src" :alt="alt" :style="imgStyle" draggable="false" />
      <button
        v-if="showHandle"
        type="button"
        class="resize-handle"
        title="Redimensionner"
        @mousedown.prevent="onResizeStart"
      />
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';

const props = defineProps(nodeViewProps);

type Align = 'left' | 'center' | 'right';
type BorderStyle = 'solid' | 'dashed';

const activeDragCleanup = ref<(() => void) | null>(null);

const src = computed(() => String(props.node.attrs.src ?? ''));
const alt = computed(() => String(props.node.attrs.alt ?? ''));
const widthPct = computed(() => clampNumber(props.node.attrs.widthPct, 10, 100, 100));
const align = computed<Align>(() => normalizeAlign(props.node.attrs.align));
const borderWidth = computed(() => clampNumber(props.node.attrs.borderWidth, 0, 12, 0));
const borderStyle = computed<BorderStyle>(() => normalizeBorderStyle(props.node.attrs.borderStyle));
const borderColor = computed(() => normalizeHexColor(props.node.attrs.borderColor));
const showHandle = computed(() => props.editor.isEditable && props.selected);

const frameStyle = computed(() => ({
  width: `${widthPct.value}%`,
}));

const imgStyle = computed(() => ({
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  height: 'auto',
  border:
    borderWidth.value > 0
      ? `${borderWidth.value}px ${borderStyle.value} ${borderColor.value}`
      : 'none',
}));

function onResizeStart(event: MouseEvent) {
  if (!props.editor.isEditable) {
    return;
  }

  const root = (event.currentTarget as HTMLElement).closest('.tiptap.ProseMirror') as HTMLElement | null;
  const containerWidth = root?.clientWidth ?? 0;
  if (!containerWidth) {
    return;
  }

  const startX = event.clientX;
  const startWidth = widthPct.value;

  const handleMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const deltaPct = (deltaX / containerWidth) * 100;
    const nextWidth = clampNumber(startWidth + deltaPct, 10, 100, startWidth);
    props.updateAttributes({
      widthPct: Math.round(nextWidth),
    });
  };

  const handleMouseUp = () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    activeDragCleanup.value = null;
  };

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  activeDragCleanup.value = handleMouseUp;
}

onBeforeUnmount(() => {
  activeDragCleanup.value?.();
});

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
</script>

<style scoped>
.resizable-image-wrapper {
  width: 100%;
  display: flex;
  margin: 0.75rem 0;
}

.resizable-image-wrapper.align-left {
  justify-content: flex-start;
}

.resizable-image-wrapper.align-center {
  justify-content: center;
}

.resizable-image-wrapper.align-right {
  justify-content: flex-end;
}

.resizable-image-frame {
  position: relative;
  max-width: 100%;
}

.resize-handle {
  position: absolute;
  top: 50%;
  right: -8px;
  width: 12px;
  height: 28px;
  transform: translateY(-50%);
  border: 1px solid #7ea7f5;
  background: #fff;
  border-radius: 999px;
  cursor: ew-resize;
  box-shadow: 0 2px 8px rgba(9, 30, 66, 0.22);
}
</style>
