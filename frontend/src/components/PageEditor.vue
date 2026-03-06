<template>
  <section class="editor-shell" :class="{ editing: editable, readonly: !editable }">
    <header v-if="editable" class="toolbar" :class="{ focused: editorFocused }">
      <div class="format-group">
        <button type="button" class="icon-btn" :class="{ active: isActive('bold') }" @click="toggleBold"><i class="fa-solid fa-bold" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('italic') }" @click="toggleItalic"><i class="fa-solid fa-italic" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('strike') }" @click="toggleStrike" title="Barre"><i class="fa-solid fa-strikethrough" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('underline') }" @click="toggleUnderline" title="Souligne"><i class="fa-solid fa-underline" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('highlight') }" @click="toggleHighlight" title="Surlignage"><i class="fa-solid fa-highlighter" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('subscript') }" @click="toggleSubscript" title="Indice"><i class="fa-solid fa-subscript" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('superscript') }" @click="toggleSuperscript" title="Exposant"><i class="fa-solid fa-superscript" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('bulletList') }" @click="toggleBulletList"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('orderedList') }" @click="toggleOrderedList"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('taskList') }" @click="toggleTaskList" title="Checklist"><i class="fa-solid fa-list-check" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('link') }" @click="toggleLink" title="Lien"><i class="fa-solid fa-link" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="insertInternalLink" title="Lien interne"><i class="fa-solid fa-link-slash" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="insertMention" title="Mention"><i class="fa-solid fa-at" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('commentMark') }" @click="toggleComment" title="Commentaire"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('codeBlock') }" @click="toggleCodeBlock"><i class="fa-solid fa-code" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('blockquote') }" @click="toggleBlockquote"><i class="fa-solid fa-quote-left" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="insertHorizontalRule" title="Separateur"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn callout-btn callout-btn-info" @click="insertCallout('info')" title="Encart Information"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn callout-btn callout-btn-warning" @click="insertCallout('warning')" title="Encart Avertissement"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn callout-btn callout-btn-tip" @click="insertCallout('tip')" title="Encart Conseil"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn callout-btn callout-btn-danger" @click="insertCallout('danger')" title="Encart Danger"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isAligned('left') }" @click="setTextAlign('left')" title="Aligner a gauche"><i class="fa-solid fa-align-left" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isAligned('center') }" @click="setTextAlign('center')" title="Centrer le texte"><i class="fa-solid fa-align-center" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isAligned('right') }" @click="setTextAlign('right')" title="Aligner a droite"><i class="fa-solid fa-align-right" aria-hidden="true"></i></button>
        <button type="button" :class="{ active: isActive('heading', { level: 2 }) }" @click="toggleHeading2">H2</button>
        <button type="button" :class="{ active: isActive('heading', { level: 3 }) }" @click="toggleHeading3">H3</button>
        <button
          type="button"
          class="icon-btn"
          :disabled="imageUploading || !spaceId"
          title="Inserer une image"
          @mousedown.prevent="rememberImageInsertionSelection"
          @click="openImagePicker"
        >
          <i class="fa-regular fa-image" aria-hidden="true"></i>
        </button>
        <button type="button" class="icon-btn" @click="insertTable"><i class="fa-solid fa-table" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="undo"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="redo"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
      </div>
      <button type="button" class="icon-btn" @click="openHistory"><i class="fa-regular fa-clock" aria-hidden="true"></i></button>
      <input
        ref="imageInputRef"
        class="image-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        @change="onImageInputChange"
      />
    </header>
    <div v-if="internalLinkPickerOpen" class="internal-link-backdrop" @click.self="closeInternalLinkPicker">
      <section class="internal-link-modal" role="dialog" aria-modal="true" aria-label="Selectionner une page">
        <header class="internal-link-header">
          <h3>Lien interne</h3>
          <button type="button" class="icon-btn" @click="closeInternalLinkPicker">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>
        <div class="internal-link-body">
          <label class="internal-link-field">
            <span>Rechercher une page</span>
            <input v-model.trim="internalLinkQuery" type="text" placeholder="Titre ou id de page" />
          </label>
          <label class="internal-link-field">
            <span>Ancre (optionnel)</span>
            <input v-model.trim="internalLinkAnchor" type="text" placeholder="section-id" />
          </label>
          <p v-if="internalLinkError" class="editor-error">{{ internalLinkError }}</p>
          <p v-if="internalLinkLoading" class="internal-link-state">Chargement des pages...</p>
          <ul v-else class="internal-link-list">
            <li v-for="page in filteredInternalLinkPages" :key="`internal-link-${page.id}`">
              <button
                type="button"
                :class="['internal-link-item', { active: internalLinkSelectedId === page.id }]"
                @click="internalLinkSelectedId = page.id"
                @dblclick="confirmInternalLink"
              >
                <strong>{{ page.title }}</strong>
                <small>{{ page.id }}</small>
              </button>
            </li>
          </ul>
          <p v-if="!internalLinkLoading && !filteredInternalLinkPages.length" class="internal-link-state">Aucun resultat</p>
        </div>
        <footer class="internal-link-footer">
          <button type="button" @click="closeInternalLinkPicker">Annuler</button>
          <button type="button" class="primary" :disabled="!internalLinkSelectedId" @click="confirmInternalLink">Inserer le lien</button>
        </footer>
      </section>
    </div>
    <div ref="bubbleMenuHostRef" class="bubble-menu-host">
      <BubbleMenu
        v-if="editor && editable"
        :editor="editor"
        :tippy-options="bubbleMenuTippyOptions"
        :should-show="shouldShowTextBubbleMenu"
        class="bubble-menu"
      >
        <button type="button" class="icon-btn" :class="{ active: isActive('bold') }" @click="toggleBold"><i class="fa-solid fa-bold" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('italic') }" @click="toggleItalic"><i class="fa-solid fa-italic" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" :class="{ active: isActive('blockquote') }" @click="toggleBlockquote"><i class="fa-solid fa-quote-left" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="toggleBulletList"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" @click="toggleOrderedList"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button>
      </BubbleMenu>
      <BubbleMenu
        v-if="editor && editable"
        :editor="editor"
        :tippy-options="bubbleMenuTippyOptions"
        :should-show="shouldShowImageBubbleMenu"
        class="bubble-menu image-bubble-menu"
      >
        <button type="button" class="icon-btn" title="Remplacer l'image" @mousedown.prevent @click="openImagePicker">
          <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
        </button>
        <button type="button" class="icon-btn" title="Supprimer l'image" @mousedown.prevent @click="removeSelectedImage">
          <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
        </button>
        <div class="image-menu-group image-width-group">
          <button
            v-for="width in WIDTH_PRESETS"
            :key="`width-${width}`"
            type="button"
            :class="['size-btn', { active: selectedImageAttrs?.widthPct === width }]"
            @mousedown.prevent
            @click="setSelectedImageWidth(width)"
          >
            {{ width }}
          </button>
        </div>
        <div class="image-menu-group image-align-group">
          <button type="button" class="icon-btn" :class="{ active: selectedImageAttrs?.align === 'left' }" title="Aligner a gauche" @mousedown.prevent @click="setSelectedImageAlign('left')">
            <i class="fa-solid fa-align-left" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-btn" :class="{ active: selectedImageAttrs?.align === 'center' }" title="Centrer" @mousedown.prevent @click="setSelectedImageAlign('center')">
            <i class="fa-solid fa-align-center" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-btn" :class="{ active: selectedImageAttrs?.align === 'right' }" title="Aligner a droite" @mousedown.prevent @click="setSelectedImageAlign('right')">
            <i class="fa-solid fa-align-right" aria-hidden="true"></i>
          </button>
        </div>
        <div class="image-menu-group image-border-group">
          <button type="button" class="size-btn" :class="{ active: selectedImageAttrs?.borderWidth === 0 }" @mousedown.prevent @click="setSelectedImageBorderWidth(0)">Aucune</button>
          <button type="button" class="size-btn" :class="{ active: selectedImageAttrs?.borderWidth === 1 }" @mousedown.prevent @click="setSelectedImageBorderWidth(1)">Fine</button>
          <button type="button" class="size-btn" :class="{ active: selectedImageAttrs?.borderWidth === 2 }" @mousedown.prevent @click="setSelectedImageBorderWidth(2)">Moyenne</button>
          <button type="button" class="size-btn" :class="{ active: selectedImageAttrs?.borderWidth === 4 }" @mousedown.prevent @click="setSelectedImageBorderWidth(4)">Forte</button>
        </div>
        <div class="image-menu-group image-border-controls">
          <select :value="selectedImageAttrs?.borderStyle ?? 'solid'" @mousedown.stop @change="onBorderStyleChange">
            <option value="solid">solid</option>
            <option value="dashed">dashed</option>
          </select>
          <input type="color" :value="selectedImageAttrs?.borderColor ?? '#d0d7de'" @mousedown.stop @input="onBorderColorChange" />
        </div>
      </BubbleMenu>
    </div>
    <div v-if="editor && editable && slashMenuVisible" class="slash-menu">
      <button type="button" @click="applySlashCommand('heading2')">Titre H2</button>
      <button type="button" @click="applySlashCommand('heading3')">Titre H3</button>
      <button type="button" @click="applySlashCommand('bulletList')">Liste a puces</button>
      <button type="button" @click="applySlashCommand('taskList')">Checklist</button>
      <button type="button" @click="applySlashCommand('codeBlock')">Bloc de code</button>
      <button type="button" @click="applySlashCommand('table')">Table</button>
      <button type="button" @click="applySlashCommand('horizontalRule')">Separateur</button>
      <button type="button" @click="applySlashCommand('calloutInfo')">Encart Information</button>
      <button type="button" @click="applySlashCommand('calloutWarning')">Encart Avertissement</button>
      <button type="button" @click="applySlashCommand('calloutTip')">Encart Conseil</button>
      <button type="button" @click="applySlashCommand('calloutDanger')">Encart Danger</button>
    </div>
    <div v-if="editor && editable && isActive('table')" class="table-tools">
      <button type="button" @click="addColumnBefore">Col -</button>
      <button type="button" @click="addColumnAfter">Col +</button>
      <button type="button" @click="deleteColumn">Suppr col</button>
      <button type="button" @click="addRowBefore">Ligne -</button>
      <button type="button" @click="addRowAfter">Ligne +</button>
      <button type="button" @click="deleteRow">Suppr ligne</button>
      <button type="button" @click="mergeCells">Fusionner</button>
      <button type="button" @click="splitCell">Scinder</button>
      <button type="button" @click="toggleHeaderRow">Header ligne</button>
      <button type="button" @click="toggleHeaderColumn">Header col</button>
      <button type="button" @click="deleteTable">Suppr table</button>
    </div>
    <div class="editor-body">
      <p v-if="imageUploadError" class="editor-error">{{ imageUploadError }}</p>
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { common, createLowlight } from 'lowlight';
import axios from 'axios';
import type { Doc as YDoc } from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { resolveApiUrl, uploadEditorImage } from '../services/attachments';
import { api } from '../services/api';
import { ResizableImage } from './editor/resizable-image-extension';
import { Callout } from './editor/callout-extension';
import { CommentMark } from './editor/comment-mark-extension';

const props = defineProps<{
  modelValue: unknown;
  editable: boolean;
  spaceKey?: string;
  spaceId?: string;
  pageId?: string;
  ydoc?: YDoc | null;
  awareness?: Awareness | null;
  collabUser?: { name: string; color: string } | null;
}>();

const emit = defineEmits<{
  (e: 'open-history'): void;
  (e: 'live-update', payload: { content: unknown; text: string; selection: { from: number; to: number } }): void;
}>();

const defaultDoc = { type: 'doc', content: [] };
const editorFocused = ref(false);
const slashMenuVisible = ref(false);
const bubbleMenuHostRef = ref<HTMLElement | null>(null);
const imageInputRef = ref<HTMLInputElement | null>(null);
const imageUploading = ref(false);
const imageUploadError = ref('');
const pendingImageSelection = ref<{ from: number; to: number } | null>(null);
const pendingImageBaseAttrs = ref<Record<string, unknown> | null>(null);
const lastAppliedModelSignature = ref('');
const editableHydrationApplied = ref(false);
const internalLinkPickerOpen = ref(false);
const internalLinkLoading = ref(false);
const internalLinkError = ref('');
const internalLinkQuery = ref('');
const internalLinkAnchor = ref('');
const internalLinkSelectedId = ref('');
const internalLinkLoadedSpaceId = ref<string | null>(null);
const internalLinkPages = ref<Array<{ id: string; title: string; slug: string }>>([]);
const collabEnabled = Boolean(props.ydoc && props.awareness && props.collabUser);

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const WIDTH_PRESETS = [25, 50, 75, 100] as const;
const lowlight = createLowlight(common);

type ImageAlign = 'left' | 'center' | 'right';
type BorderLineStyle = 'solid' | 'dashed';

const bubbleMenuTippyOptions = {
  duration: 120,
  placement: 'top' as const,
  theme: 'cnav-bubble-menu',
  appendTo: () => bubbleMenuHostRef.value ?? document.body,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeAlign(value: unknown): ImageAlign {
  if (value === 'center' || value === 'right') {
    return value;
  }
  return 'left';
}

function normalizeBorderStyle(value: unknown): BorderLineStyle {
  return value === 'dashed' ? 'dashed' : 'solid';
}

function normalizeHexColor(value: unknown): string {
  const color = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }
  return '#d0d7de';
}

const getUploadErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return "Impossible d'envoyer l'image";
  }
  return String(error.response?.data?.message ?? error.response?.data?.error ?? "Impossible d'envoyer l'image");
};

const validateImageFile = (file: File): string | null => {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return 'Format image non supporte (png, jpeg, webp, gif, svg).';
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return 'Image trop volumineuse (max 5 Mo).';
  }
  return null;
};

const uploadAndInsertImage = async (file: File) => {
  if (!editor.value || !props.spaceId || !props.editable || imageUploading.value) {
    return;
  }

  const validationError = validateImageFile(file);
  if (validationError) {
    imageUploadError.value = validationError;
    return;
  }

  imageUploading.value = true;
  imageUploadError.value = '';

  try {
    const src = await uploadEditorImage(file, props.spaceId, props.pageId);
    const selection = pendingImageSelection.value ?? {
      from: editor.value.state.selection.from,
      to: editor.value.state.selection.to,
    };

    editor.value
      .chain()
      .focus()
      .insertContentAt(
        { from: selection.from, to: selection.to },
        {
          type: 'image',
          attrs: {
            ...(pendingImageBaseAttrs.value ?? {}),
            src,
            alt: file.name,
          },
        },
      )
      .run();
    pendingImageSelection.value = null;
    pendingImageBaseAttrs.value = null;
  } catch (error) {
    imageUploadError.value = getUploadErrorMessage(error);
  } finally {
    imageUploading.value = false;
  }
};

const rememberImageInsertionSelection = () => {
  if (!editor.value) {
    return;
  }

  const { from, to } = editor.value.state.selection;
  pendingImageSelection.value = { from, to };

  if (editor.value.isActive('image')) {
    const attrs = editor.value.getAttributes('image') as Record<string, unknown>;
    pendingImageBaseAttrs.value = {
      widthPct: clampNumber(attrs.widthPct, 10, 100, 100),
      align: normalizeAlign(attrs.align),
      borderWidth: clampNumber(attrs.borderWidth, 0, 12, 0),
      borderStyle: normalizeBorderStyle(attrs.borderStyle),
      borderColor: normalizeHexColor(attrs.borderColor),
    };
    return;
  }

  pendingImageBaseAttrs.value = null;
};

const normalizeImageSources = (content: unknown): unknown => {
  if (!content || typeof content !== 'object') {
    return content;
  }

  const cloned = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const record = node as Record<string, unknown>;
    if (record.type === 'image' && record.attrs && typeof record.attrs === 'object') {
      const attrs = record.attrs as Record<string, unknown>;
      if (typeof attrs.src === 'string' && attrs.src.startsWith('/api/')) {
        attrs.src = resolveApiUrl(attrs.src);
      }
    }

    if (!Array.isArray(record.content)) {
      return;
    }

    for (const child of record.content) {
      visit(child);
    }
  };

  visit(cloned);
  return cloned;
};

const toContentSignature = (content: unknown): string => {
  try {
    return JSON.stringify(content ?? null);
  } catch {
    return '';
  }
};

const openImagePicker = () => {
  imageUploadError.value = '';
  rememberImageInsertionSelection();
  imageInputRef.value?.click();
};

const onImageInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  await uploadAndInsertImage(file);
  input.value = '';
};

const editor = useEditor({
  editable: props.editable,
  extensions: [
    StarterKit.configure({
      history: collabEnabled ? false : undefined,
      codeBlock: false,
      horizontalRule: false,
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
    Link.configure({
      openOnClick: !props.editable,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
      },
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Underline,
    Highlight,
    Subscript,
    Superscript,
    HorizontalRule,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Mention.configure({
      HTMLAttributes: {
        class: 'mention-token',
      },
      renderText({ node }) {
        return `@${node.attrs.label ?? node.attrs.id ?? 'mention'}`;
      },
    }),
    CodeBlockLowlight.configure({
      lowlight,
    }),
    CommentMark,
    Callout,
    ResizableImage.configure({
      allowBase64: false,
      inline: false,
    }),
    Placeholder.configure({
      placeholder: 'Commence a ecrire...',
      showOnlyWhenEditable: true,
      includeChildren: true,
    }),
  ],
  content: normalizeImageSources(props.modelValue ?? defaultDoc),
  editorProps: {
    attributes: {
      class: 'tiptap',
    },
    handlePaste: (_view, event) => {
      if (!props.editable || !props.spaceId || imageUploading.value) {
        return false;
      }

      const clipboardFiles = Array.from(event.clipboardData?.files ?? []);
      const imageFile = clipboardFiles.find((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
      if (!imageFile) {
        return false;
      }

      pendingImageSelection.value = {
        from: editor.value?.state.selection.from ?? 0,
        to: editor.value?.state.selection.to ?? 0,
      };
      void uploadAndInsertImage(imageFile);
      return true;
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
    if (!value) {
      editableHydrationApplied.value = false;
    }
  },
);

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) {
      return;
    }

    const normalized = (normalizeImageSources(value) as object) ?? defaultDoc;
    const incomingSignature = toContentSignature(normalized);
    const currentSignature = toContentSignature(editor.value.getJSON());
    if (incomingSignature && incomingSignature === currentSignature) {
      lastAppliedModelSignature.value = incomingSignature;
      return;
    }

    // In collaborative editing, hydrate from external model only once when entering
    // edit mode, then ignore subsequent external syncs to preserve caret stability.
    if (props.editable && collabEnabled) {
      if (editableHydrationApplied.value) {
        lastAppliedModelSignature.value = incomingSignature;
        return;
      }

      editor.value.commands.setContent(normalized, false);
      lastAppliedModelSignature.value = incomingSignature;
      editableHydrationApplied.value = true;
      return;
    }

    if (incomingSignature && incomingSignature === lastAppliedModelSignature.value) {
      return;
    }

    editor.value.commands.setContent(normalized, false);
    lastAppliedModelSignature.value = incomingSignature;
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  editor.value?.destroy();
});

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

const shouldShowTextBubbleMenu = ({ editor: currentEditor }: { editor: { isActive: (name: string) => boolean } }) => {
  return !currentEditor.isActive('image');
};

const shouldShowImageBubbleMenu = ({ editor: currentEditor }: { editor: { isActive: (name: string) => boolean } }) => {
  return currentEditor.isActive('image');
};

const selectedImageAttrs = computed<{
  widthPct: number;
  align: ImageAlign;
  borderWidth: number;
  borderStyle: BorderLineStyle;
  borderColor: string;
} | null>(() => {
  if (!editor.value || !editor.value.isActive('image')) {
    return null;
  }

  const attrs = editor.value.getAttributes('image') as Record<string, unknown>;
  return {
    widthPct: clampNumber(attrs.widthPct, 10, 100, 100),
    align: normalizeAlign(attrs.align),
    borderWidth: clampNumber(attrs.borderWidth, 0, 12, 0),
    borderStyle: normalizeBorderStyle(attrs.borderStyle),
    borderColor: normalizeHexColor(attrs.borderColor),
  };
});

const filteredInternalLinkPages = computed(() => {
  const query = internalLinkQuery.value.trim().toLowerCase();
  if (!query) {
    return internalLinkPages.value.slice(0, 80);
  }
  return internalLinkPages.value
    .filter((page) => page.title.toLowerCase().includes(query) || page.id.toLowerCase().includes(query))
    .slice(0, 80);
});

const updateSelectedImageAttrs = (attrs: Record<string, unknown>) => {
  editor.value?.chain().focus().updateAttributes('image', attrs).run();
};

const setSelectedImageWidth = (widthPct: number) => {
  updateSelectedImageAttrs({ widthPct: clampNumber(widthPct, 10, 100, 100) });
};

const setSelectedImageAlign = (align: ImageAlign) => {
  updateSelectedImageAttrs({ align });
};

const setSelectedImageBorderWidth = (borderWidth: number) => {
  updateSelectedImageAttrs({ borderWidth: clampNumber(borderWidth, 0, 12, 0) });
};

const onBorderStyleChange = (event: Event) => {
  const next = normalizeBorderStyle((event.target as HTMLSelectElement).value);
  updateSelectedImageAttrs({ borderStyle: next });
};

const onBorderColorChange = (event: Event) => {
  const next = normalizeHexColor((event.target as HTMLInputElement).value);
  updateSelectedImageAttrs({ borderColor: next });
};

const toggleBold = () => editor.value?.chain().focus().toggleBold().run();
const toggleItalic = () => editor.value?.chain().focus().toggleItalic().run();
const toggleStrike = () => editor.value?.chain().focus().toggleStrike().run();
const toggleUnderline = () => editor.value?.chain().focus().toggleUnderline().run();
const toggleHighlight = () => editor.value?.chain().focus().toggleHighlight().run();
const toggleSubscript = () => editor.value?.chain().focus().toggleSubscript().run();
const toggleSuperscript = () => editor.value?.chain().focus().toggleSuperscript().run();
const toggleBulletList = () => editor.value?.chain().focus().toggleBulletList().run();
const toggleOrderedList = () => editor.value?.chain().focus().toggleOrderedList().run();
const toggleTaskList = () => editor.value?.chain().focus().toggleTaskList().run();
const toggleCodeBlock = () => editor.value?.chain().focus().toggleCodeBlock().run();
const toggleBlockquote = () => editor.value?.chain().focus().toggleBlockquote().run();
const toggleHeading2 = () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run();
const toggleHeading3 = () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run();
const insertTable = () =>
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
const undo = () => editor.value?.chain().focus().undo().run();
const redo = () => editor.value?.chain().focus().redo().run();
const removeSelectedImage = () => editor.value?.chain().focus().deleteSelection().run();
const insertHorizontalRule = () => editor.value?.chain().focus().setHorizontalRule().run();

const isAligned = (alignment: 'left' | 'center' | 'right') =>
  editor.value?.isActive({ textAlign: alignment }) ?? false;

const setTextAlign = (alignment: 'left' | 'center' | 'right') =>
  editor.value?.chain().focus().setTextAlign(alignment).run();

const normalizeLinkHref = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const toggleLink = () => {
  if (!editor.value) {
    return;
  }

  if (editor.value.isActive('link')) {
    editor.value.chain().focus().unsetLink().run();
    return;
  }

  const currentHref = String((editor.value.getAttributes('link') as Record<string, unknown>).href ?? '');
  const input = window.prompt('URL du lien', currentHref || 'https://');
  if (input === null) {
    return;
  }

  const href = normalizeLinkHref(input);
  if (!href) {
    editor.value.chain().focus().unsetLink().run();
    return;
  }

  editor.value.chain().focus().extendMarkRange('link').setLink({ href }).run();
};

const insertInternalLink = () => {
  if (!editor.value || !props.spaceKey || !props.spaceId) {
    return;
  }
  void openInternalLinkPicker();
};

const openInternalLinkPicker = async () => {
  if (!props.spaceId) {
    return;
  }

  internalLinkPickerOpen.value = true;
  internalLinkError.value = '';
  internalLinkQuery.value = '';
  internalLinkAnchor.value = '';

  if (internalLinkLoadedSpaceId.value === props.spaceId && internalLinkPages.value.length > 0) {
    internalLinkSelectedId.value = internalLinkPages.value[0]?.id ?? '';
    return;
  }

  internalLinkLoading.value = true;
  try {
    const response = await api.get(`/pages/space/${props.spaceId}/tree`);
    const pages = Array.isArray(response.data?.pages) ? response.data.pages : [];
    internalLinkPages.value = pages.map((page: Record<string, unknown>) => ({
      id: String(page.id),
      title: String(page.title ?? 'Sans titre'),
      slug: String(page.slug ?? ''),
    }));
    internalLinkLoadedSpaceId.value = props.spaceId;
    internalLinkSelectedId.value = internalLinkPages.value[0]?.id ?? '';
  } catch (error) {
    if (axios.isAxiosError(error)) {
      internalLinkError.value = String(error.response?.data?.message ?? error.response?.data?.error ?? 'Impossible de charger les pages');
    } else {
      internalLinkError.value = 'Impossible de charger les pages';
    }
  } finally {
    internalLinkLoading.value = false;
  }
};

const closeInternalLinkPicker = () => {
  internalLinkPickerOpen.value = false;
  internalLinkError.value = '';
};

const confirmInternalLink = () => {
  if (!editor.value || !props.spaceKey || !internalLinkSelectedId.value) {
    return;
  }

  const page = internalLinkPages.value.find((entry) => entry.id === internalLinkSelectedId.value);
  if (!page) {
    return;
  }

  const anchorRaw = internalLinkAnchor.value.trim().replace(/^#/, '');
  const anchor = anchorRaw ? `#${anchorRaw}` : '';
  const href = `/space/${props.spaceKey}/pages/${page.id}-${page.slug}${anchor}`;

  if (!editor.value.state.selection.empty) {
    editor.value.chain().focus().extendMarkRange('link').setLink({ href }).run();
  } else {
    editor.value
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: page.title,
        marks: [{ type: 'link', attrs: { href } }],
      })
      .run();
  }

  closeInternalLinkPicker();
};

const insertMention = () => {
  if (!editor.value) {
    return;
  }

  const label = window.prompt('Mention (nom affiche)');
  if (!label) {
    return;
  }

  const id = `mention-${Date.now()}`;
  editor.value.chain().focus().insertContent({ type: 'mention', attrs: { id, label: label.trim() } }).run();
};

const toggleComment = () => {
  if (!editor.value) {
    return;
  }

  if (editor.value.isActive('commentMark')) {
    editor.value.chain().focus().unsetCommentMark().run();
    return;
  }

  const text = window.prompt('Commentaire');
  if (!text) {
    return;
  }

  editor.value
    .chain()
    .focus()
    .setCommentMark({
      id: `comment-${Date.now()}`,
      text: text.trim(),
      author: props.collabUser?.name ?? 'User',
    })
    .run();
};

const insertCallout = (type: 'info' | 'warning' | 'tip' | 'danger') =>
  editor.value?.chain().focus().setCallout(type).run();

const addColumnBefore = () => editor.value?.chain().focus().addColumnBefore().run();
const addColumnAfter = () => editor.value?.chain().focus().addColumnAfter().run();
const deleteColumn = () => editor.value?.chain().focus().deleteColumn().run();
const addRowBefore = () => editor.value?.chain().focus().addRowBefore().run();
const addRowAfter = () => editor.value?.chain().focus().addRowAfter().run();
const deleteRow = () => editor.value?.chain().focus().deleteRow().run();
const mergeCells = () => editor.value?.chain().focus().mergeCells().run();
const splitCell = () => editor.value?.chain().focus().splitCell().run();
const toggleHeaderRow = () => editor.value?.chain().focus().toggleHeaderRow().run();
const toggleHeaderColumn = () => editor.value?.chain().focus().toggleHeaderColumn().run();
const deleteTable = () => editor.value?.chain().focus().deleteTable().run();

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

const applySlashCommand = (
  command:
    | 'heading2'
    | 'heading3'
    | 'bulletList'
    | 'taskList'
    | 'codeBlock'
    | 'table'
    | 'horizontalRule'
    | 'calloutInfo'
    | 'calloutWarning'
    | 'calloutTip'
    | 'calloutDanger',
) => {
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
  } else if (command === 'taskList') {
    chain.toggleTaskList().run();
  } else if (command === 'codeBlock') {
    chain.toggleCodeBlock().run();
  } else if (command === 'table') {
    chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  } else if (command === 'horizontalRule') {
    chain.setHorizontalRule().run();
  } else if (command === 'calloutInfo') {
    chain.setCallout('info').run();
  } else if (command === 'calloutWarning') {
    chain.setCallout('warning').run();
  } else if (command === 'calloutTip') {
    chain.setCallout('tip').run();
  } else if (command === 'calloutDanger') {
    chain.setCallout('danger').run();
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

.bubble-menu-host {
  position: relative;
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

.internal-link-backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(9, 30, 66, 0.3);
  display: grid;
  place-items: center;
}

.internal-link-modal {
  width: min(92vw, 620px);
  max-height: min(86vh, 720px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(9, 30, 66, 0.26);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}

.internal-link-header,
.internal-link-footer {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.internal-link-footer {
  border-top: 1px solid var(--line);
  border-bottom: none;
  justify-content: flex-end;
  gap: 0.45rem;
}

.internal-link-body {
  padding: 0.7rem;
  overflow: auto;
  display: grid;
  gap: 0.55rem;
}

.internal-link-field {
  display: grid;
  gap: 0.25rem;
  font-size: 0.82rem;
}

.internal-link-field input {
  border: 1px solid var(--line);
  border-radius: 8px;
  min-height: 34px;
  padding: 0 0.55rem;
}

.internal-link-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.35rem;
}

.internal-link-item {
  width: 100%;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  text-align: left;
  display: grid;
}

.internal-link-item small {
  color: var(--muted);
  font-size: 0.74rem;
}

.internal-link-item.active {
  border-color: #85b8ff;
  background: #e9f2ff;
}

.internal-link-state {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
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

.callout-btn.callout-btn-info {
  color: #0c66e4;
}

.callout-btn.callout-btn-warning {
  color: #c25100;
}

.callout-btn.callout-btn-tip {
  color: #2b8a3e;
}

.callout-btn.callout-btn-danger {
  color: #cc1f1f;
}

.image-input {
  display: none;
}

.editor-error {
  margin: 0.5rem 0.8rem 0;
  color: #c62828;
  font-size: 0.85rem;
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
.editor-shell :deep(.tiptap.ProseMirror ul[data-type='taskList']),
.editor-shell :deep(.tiptap.ProseMirror blockquote),
.editor-shell :deep(.tiptap.ProseMirror pre),
.editor-shell :deep(.tiptap.ProseMirror table) {
  max-width: 100%;
}

.editor-shell :deep(.tiptap.ProseMirror ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0.2rem;
}

.editor-shell :deep(.tiptap.ProseMirror ul[data-type='taskList'] li) {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
}

.editor-shell :deep(.tiptap.ProseMirror ul[data-type='taskList'] li > label) {
  margin-top: 0.18rem;
}

.editor-shell :deep(.tiptap.ProseMirror ul[data-type='taskList'] li > div) {
  flex: 1;
}

.editor-shell :deep(.tiptap.ProseMirror img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0.75rem 0;
  border-radius: 6px;
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

:deep(.tippy-box[data-theme~='cnav-bubble-menu']) {
  background: transparent;
  box-shadow: none;
}

:deep(.tippy-box[data-theme~='cnav-bubble-menu'] > .tippy-content) {
  padding: 0;
}

:deep(.tippy-box[data-theme~='cnav-bubble-menu'] > .tippy-arrow) {
  display: none;
}

.image-bubble-menu {
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
  max-width: min(92vw, 760px);
}

.image-menu-group {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.image-width-group,
.image-align-group,
.image-border-group,
.image-border-controls {
  border-left: 1px solid var(--line);
  padding-left: 0.45rem;
}

.size-btn {
  min-width: 36px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: #fff;
  padding: 0 0.45rem;
  font-size: 0.76rem;
}

.size-btn.active {
  background: #e9f2ff;
  border-color: #85b8ff;
  color: #0c66e4;
}

.image-border-controls select {
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 0.4rem;
}

.image-border-controls input[type='color'] {
  width: 34px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.1rem;
  background: #fff;
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

.table-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.45rem 0.7rem;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: #f8fbff;
}

.table-tools button {
  min-height: 28px;
  padding: 0.2rem 0.45rem;
  font-size: 0.78rem;
}

.editor-shell :deep(.tiptap.ProseMirror .mention-token) {
  display: inline-flex;
  align-items: center;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: #e9f2ff;
  color: #0c66e4;
  font-weight: 600;
}

.editor-shell :deep(.tiptap.ProseMirror .comment-annotation) {
  background: #fff4c4;
  border-bottom: 2px solid #f5c542;
}

.editor-shell :deep(.tiptap.ProseMirror .callout) {
  position: relative;
  border-radius: 8px;
  border: 1px solid #dbe2eb;
  padding: 0.8rem 0.9rem 0.8rem 4.8rem;
  margin: 0.8rem 0;
}

.editor-shell :deep(.tiptap.ProseMirror .callout::before) {
  position: absolute;
  left: 1.05rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 3rem;
  font-family: 'Font Awesome 7 Free';
  font-weight: 900;
  line-height: 1;
  opacity: 0.92;
}

.editor-shell :deep(.tiptap.ProseMirror .callout.callout-info) {
  background: #ebf5ff;
  border-color: #8fc0ff;
}

.editor-shell :deep(.tiptap.ProseMirror .callout.callout-info::before) {
  content: '\f05a';
  color: #0c66e4;
}

.editor-shell :deep(.tiptap.ProseMirror .callout.callout-warning) {
  background: #fff4e5;
  border-color: #ffc374;
}

.editor-shell :deep(.tiptap.ProseMirror .callout.callout-warning::before) {
  content: '\f071';
  color: #c25100;
}

.editor-shell :deep(.tiptap.ProseMirror .callout.callout-tip) {
  background: #e8f8ef;
  border-color: #86d7a4;
}

.editor-shell :deep(.tiptap.ProseMirror .callout.callout-tip::before) {
  content: '\f0eb';
  color: #2b8a3e;
}

.editor-shell :deep(.tiptap.ProseMirror .callout.callout-danger) {
  background: #ffecec;
  border-color: #ff9f9f;
}

.editor-shell :deep(.tiptap.ProseMirror .callout.callout-danger::before) {
  content: '\f057';
  color: #cc1f1f;
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
