<template>
  <section class="editor-shell" :class="{ editing: editable, readonly: !editable }">
    <header v-if="editable" class="toolbar" :class="{ focused: editorFocused }">
      <div class="format-group">
        <button type="button" class="icon-btn" :class="{ active: isActive('bold') }" @click="toggleBold"><i class="fa-solid fa-bold" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('italic') }" @click="toggleItalic"><i class="fa-solid fa-italic" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('bulletList') }" @click="toggleBulletList"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('orderedList') }" @click="toggleOrderedList"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('codeBlock') }" @click="toggleCodeBlock"><i class="fa-solid fa-code" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('blockquote') }" @click="toggleBlockquote"><i class="fa-solid fa-quote-left" aria-hidden="true"></i></button>
        <button type="button" :class="{ active: isActive('heading', { level: 2 }) }" @click="toggleHeading2">H2</button>
        <button type="button" :class="{ active: isActive('heading', { level: 3 }) }" @click="toggleHeading3">H3</button>
        <button type="button" class="icon-btn" @click="insertTable"><i class="fa-solid fa-table" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="undo"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="redo"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
      </div>
      <button type="button" class="primary" @click="save"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>Publier les modifications</button>
      <button type="button" class="icon-btn" @click="openHistory"><i class="fa-regular fa-clock" aria-hidden="true"></i></button>
    </header>
    <BubbleMenu
      v-if="editor && editable"
      :editor="editor"
      :tippy-options="{ duration: 120, placement: 'top' }"
      class="bubble-menu"
    >
      <button type="button" class="icon-btn" :class="{ active: isActive('bold') }" @click="toggleBold"><i class="fa-solid fa-bold" aria-hidden="true"></i></button>
      <button type="button" class="icon-btn" :class="{ active: isActive('italic') }" @click="toggleItalic"><i class="fa-solid fa-italic" aria-hidden="true"></i></button>
      <button type="button" class="icon-btn" :class="{ active: isActive('blockquote') }" @click="toggleBlockquote"><i class="fa-solid fa-quote-left" aria-hidden="true"></i></button>
      <button type="button" class="icon-btn" @click="toggleBulletList"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>
      <button type="button" class="icon-btn" @click="toggleOrderedList"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button>
    </BubbleMenu>
    <div v-if="editor && editable && slashMenuVisible" class="slash-menu">
      <button type="button" @click="applySlashCommand('heading2')">Titre H2</button>
      <button type="button" @click="applySlashCommand('heading3')">Titre H3</button>
      <button type="button" @click="applySlashCommand('bulletList')">Liste a puces</button>
      <button type="button" @click="applySlashCommand('codeBlock')">Bloc de code</button>
      <button type="button" @click="applySlashCommand('table')">Table</button>
    </div>
    <div class="editor-body">
      <div v-if="editor" class="editor-content-wrap">
        <div class="editor-content-column">
          <EditorContent :editor="editor" class="editor-content-host" />
        </div>
      </div>
      <div v-else class="editor-loading">Chargement de l'editeur...</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import Placeholder from '@tiptap/extension-placeholder';
import type { Doc as YDoc } from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

const props = defineProps<{
  modelValue: unknown;
  editable: boolean;
  ydoc?: YDoc | null;
  awareness?: Awareness | null;
  collabUser?: { name: string; color: string } | null;
}>();

const emit = defineEmits<{
  (e: 'save', value: unknown): void;
  (e: 'open-history'): void;
  (e: 'live-update', payload: { content: unknown; text: string; selection: { from: number; to: number } }): void;
}>();

const defaultDoc = { type: 'doc', content: [] };
const editorFocused = ref(false);
const slashMenuVisible = ref(false);
const collabEnabled = Boolean(props.ydoc && props.awareness && props.collabUser);

const editor = useEditor({
  editable: props.editable,
  extensions: [
    StarterKit.configure({
      history: collabEnabled ? false : undefined,
    }),
    ...(props.ydoc
      ? [
          Collaboration.configure({
            document: props.ydoc,
            field: 'default',
          }),
          ...(props.awareness && props.collabUser
            ? [
                CollaborationCursor.configure({
                  provider: { awareness: props.awareness },
                  user: props.collabUser,
                }),
              ]
            : []),
        ]
      : []),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: 'Commence a ecrire...',
      showOnlyWhenEditable: true,
      includeChildren: true,
    }),
  ],
  content: props.modelValue ?? defaultDoc,
  editorProps: {
    attributes: {
      class: 'tiptap',
    },
  },
  onFocus: () => {
    editorFocused.value = true;
    updateSlashMenu();
  },
  onBlur: () => {
    editorFocused.value = false;
    slashMenuVisible.value = false;
  },
  onUpdate: () => {
    updateSlashMenu();
    emitLiveUpdate();
  },
  onSelectionUpdate: () => {
    updateSlashMenu();
    emitLiveUpdate();
  },
});

watch(
  () => props.editable,
  (value) => {
    editor.value?.setEditable(value);
  },
);

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) {
      return;
    }
    editor.value.commands.setContent((value as object) ?? defaultDoc, false);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  editor.value?.destroy();
});

const save = () => {
  if (!editor.value) {
    return;
  }
  emit('save', editor.value.getJSON());
};

const openHistory = () => emit('open-history');

const emitLiveUpdate = () => {
  if (!editor.value || !props.editable) {
    return;
  }

  const selection = editor.value.state.selection;
  emit('live-update', {
    content: editor.value.getJSON(),
    text: editor.value.getText(),
    selection: {
      from: selection.from,
      to: selection.to,
    },
  });
};

const isActive = (name: string, attrs?: Record<string, unknown>) => editor.value?.isActive(name, attrs) ?? false;

const toggleBold = () => editor.value?.chain().focus().toggleBold().run();
const toggleItalic = () => editor.value?.chain().focus().toggleItalic().run();
const toggleBulletList = () => editor.value?.chain().focus().toggleBulletList().run();
const toggleOrderedList = () => editor.value?.chain().focus().toggleOrderedList().run();
const toggleCodeBlock = () => editor.value?.chain().focus().toggleCodeBlock().run();
const toggleBlockquote = () => editor.value?.chain().focus().toggleBlockquote().run();
const toggleHeading2 = () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run();
const toggleHeading3 = () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run();
const insertTable = () =>
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
const undo = () => editor.value?.chain().focus().undo().run();
const redo = () => editor.value?.chain().focus().redo().run();

const updateSlashMenu = () => {
  if (!editor.value || !props.editable) {
    slashMenuVisible.value = false;
    return;
  }

  const { state } = editor.value;
  const { from, empty } = state.selection;
  if (!empty) {
    slashMenuVisible.value = false;
    return;
  }

  const parentText = state.selection.$from.parent.textContent;
  slashMenuVisible.value = parentText.endsWith('/');

  if (!slashMenuVisible.value) {
    return;
  }

  const charBefore = state.doc.textBetween(Math.max(from - 1, 0), from, '\n', '\0');
  if (charBefore !== '/') {
    slashMenuVisible.value = false;
  }
};

const clearSlashTrigger = () => {
  if (!editor.value) {
    return;
  }
  const { from } = editor.value.state.selection;
  const charBefore = editor.value.state.doc.textBetween(Math.max(from - 1, 0), from, '\n', '\0');
  if (charBefore === '/') {
    editor.value.chain().focus().deleteRange({ from: from - 1, to: from }).run();
  }
};

const applySlashCommand = (command: 'heading2' | 'heading3' | 'bulletList' | 'codeBlock' | 'table') => {
  if (!editor.value) {
    return;
  }

  clearSlashTrigger();
  const chain = editor.value.chain().focus();
  if (command === 'heading2') {
    chain.toggleHeading({ level: 2 }).run();
  } else if (command === 'heading3') {
    chain.toggleHeading({ level: 3 }).run();
  } else if (command === 'bulletList') {
    chain.toggleBulletList().run();
  } else if (command === 'codeBlock') {
    chain.toggleCodeBlock().run();
  } else if (command === 'table') {
    chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }
  slashMenuVisible.value = false;
};
</script>

<style scoped>
.editor-shell {
  position: relative;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-shell.editing {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
}

.editor-shell.readonly {
  border: none;
  border-radius: 12px;
  background: #fff;
  height: auto;
  min-height: auto;
}

.toolbar {
  position: sticky;
  top: 0;
  z-index: 12;
  background: #fff;
  border-bottom: 1px solid var(--line);
  padding: 0.55rem 0.7rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.toolbar.focused {
  border-bottom-color: #85b8ff;
  background: #f7fbff;
}

.format-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.format-group button {
  min-width: 34px;
  padding: 0.35rem 0.45rem;
}

.icon-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.icon-btn :deep(.fa-solid),
.icon-btn :deep(.fa-regular) {
  margin-right: 0;
}

.format-group button.active {
  background: #e9f2ff;
  border-color: #85b8ff;
  color: #0c66e4;
}

.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.primary:hover {
  background: var(--accent-strong);
}

:deep(.tiptap.ProseMirror) {
  display: block;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  padding: 0;
  color: #172b4d;
  overflow: auto;
  border: none;
  box-shadow: none;
  border-radius: 0;
  background: transparent;
}

:deep(.tiptap.ProseMirror:focus) {
  outline: none;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
}

.editor-loading {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 0.9rem;
}

.editor-body :deep(.tiptap) {
  display: block;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  max-width: none;
}

.editor-content-wrap {
  display: block;
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
}

.editor-content-column {
  min-height: 100%;
  width: 100%;
  margin: 0 auto;
  padding: 0 clamp(0.35rem, 1vw, 0.8rem) 14vh;
}

.editor-content-host {
  display: block;
  width: 100%;
  height: 100%;
}

.editor-body :deep(.tiptap.ProseMirror) {
  width: 100%;
  padding: 0 0.15rem 2rem;
}

.editor-shell.readonly .editor-content-column {
  padding-top: clamp(0.9rem, 2vh, 1.35rem);
}

.editor-shell.editing .editor-content-column {
  padding-top: 0.8rem;
}

.editor-shell.readonly .editor-body {
  overflow: visible;
  min-height: auto;
}

.editor-shell.readonly .editor-content-wrap {
  overflow: visible;
  height: auto;
  min-height: auto;
  flex: 0 0 auto;
}

.editor-shell.readonly .editor-content-host {
  height: auto;
}

.editor-shell.readonly :deep(.tiptap.ProseMirror) {
  cursor: default;
  height: auto;
  min-height: auto;
  overflow: visible;
}

.editor-shell :deep(.tiptap.ProseMirror p),
.editor-shell :deep(.tiptap.ProseMirror ul),
.editor-shell :deep(.tiptap.ProseMirror ol),
.editor-shell :deep(.tiptap.ProseMirror blockquote),
.editor-shell :deep(.tiptap.ProseMirror pre),
.editor-shell :deep(.tiptap.ProseMirror table) {
  max-width: 100%;
}

.bubble-menu {
  display: flex;
  gap: 0.25rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  padding: 0.25rem;
  box-shadow: 0 6px 18px rgba(9, 30, 66, 0.2);
}

.bubble-menu button {
  min-width: 30px;
  padding: 0.25rem 0.35rem;
}

.bubble-menu button.active {
  background: #e9f2ff;
  border-color: #85b8ff;
  color: #0c66e4;
}

.slash-menu {
  position: absolute;
  z-index: 20;
  margin-top: 0.4rem;
  margin-left: 1rem;
  display: grid;
  gap: 0.2rem;
  width: 220px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(9, 30, 66, 0.16);
  padding: 0.35rem;
}

.slash-menu button {
  text-align: left;
  border: 1px solid transparent;
}

.slash-menu button:hover {
  background: #f1f7ff;
  border-color: #cce0ff;
}

:deep(.collaboration-cursor__caret) {
  border-left-width: 2px;
}

:deep(.collaboration-cursor__label) {
  border-radius: 4px;
  padding: 0.05rem 0.25rem;
  font-size: 0.7rem;
}

@media (max-width: 900px) {
  .editor-content-column {
    width: 100%;
    padding: 0 0 11vh;
  }
}
</style>
