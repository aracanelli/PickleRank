<script setup lang="ts">
/**
 * Bottom sheet on phones, centered panel on wide screens.
 * Built on <dialog>.showModal(): focus is trapped, the page behind is inert,
 * Esc closes, and focus returns to the opener on close.
 */
import { ref, watch, onMounted, nextTick, useId } from 'vue'
import { X } from 'lucide-vue-next'
import { useKeyboardInset } from './useKeyboardInset'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  size?: 'sheet' | 'alert'
  closeLabel?: string
  dismissible?: boolean
}>(), { size: 'sheet', closeLabel: 'Close', dismissible: true })
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()
let opener: HTMLElement | null = null
useKeyboardInset()

function sync() {
  const d = dialog.value
  if (!d) return
  if (props.open && !d.open) {
    opener = document.activeElement as HTMLElement | null
    d.showModal()
    nextTick(() => {
      const target = d.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
      target?.focus()
    })
  } else if (!props.open && d.open) {
    d.close()
  }
}

onMounted(sync)
watch(() => props.open, sync)

function onCancel(e: Event) {
  e.preventDefault()
  if (props.dismissible) emit('close')
}

function onClose() {
  if (opener && document.contains(opener)) opener.focus()
  opener = null
  if (props.open) emit('close')
}

function onBackdrop(e: MouseEvent) {
  if (props.dismissible && e.target === dialog.value) emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :class="`sheet--${size}`"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @close="onClose"
    @click="onBackdrop"
  >
    <div class="sheet__panel">
      <header class="sheet__head">
        <div class="sheet__titles">
          <slot name="title" :title-id="titleId"><h2 :id="titleId">{{ title }}</h2></slot>
          <p v-if="description" class="muted">{{ description }}</p>
        </div>
        <button v-if="dismissible" type="button" class="sheet__close" :aria-label="closeLabel" @click="emit('close')">
          <X :size="22" aria-hidden="true" />
        </button>
      </header>
      <div class="sheet__body"><slot /></div>
      <footer v-if="$slots.actions" class="sheet__actions"><slot name="actions" /></footer>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  max-width: 100vw;
  max-height: 100dvh;
  width: 100%;
  margin: auto auto 0;
  overflow: visible;
}
.sheet::backdrop { background: var(--scrim); }
.sheet__panel {
  background: var(--surface);
  border-radius: var(--r-sheet) var(--r-sheet) 0 0;
  box-shadow: 0 -8px 32px rgb(0 0 0 / 0.18);
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - var(--safe-top) - 24px - var(--kb-inset, 0px));
  margin-bottom: var(--kb-inset, 0px);
  padding-bottom: var(--safe-bottom);
}
.sheet__head {
  display: flex;
  align-items: flex-start;
  gap: var(--s3);
  padding: var(--s4) var(--s4) var(--s2) calc(var(--s4) + var(--safe-left));
}
.sheet__titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--s1); }
.sheet__close {
  width: var(--tap); height: var(--tap);
  display: grid; place-items: center;
  border: 0; border-radius: 50%;
  background: var(--surface-sunk);
  color: var(--ink);
  flex: none;
}
.sheet__body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--s2) var(--s4) var(--s4);
}
.sheet__actions {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s3) var(--s4) var(--s4);
  border-top: 1px solid var(--line);
}

.sheet[open] .sheet__panel { animation: rise 220ms var(--ease); }
@keyframes rise { from { transform: translateY(24px); opacity: 0.6; } }

.sheet--alert { margin: auto; width: min(100% - 32px, 420px); }
.sheet--alert .sheet__panel { border-radius: var(--r-sheet); padding-bottom: 0; }

@media (min-width: 720px) {
  .sheet { margin: auto; width: min(100% - 48px, 520px); }
  .sheet__panel { border-radius: var(--r-sheet); padding-bottom: 0; }
}
</style>
