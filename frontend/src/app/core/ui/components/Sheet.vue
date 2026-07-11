<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { X } from 'lucide-vue-next'
import IconButton from './IconButton.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    /** Prevent closing via backdrop / swipe / escape (e.g. while saving). */
    persistent?: boolean
    /** Max width of the desktop dialog. */
    size?: 'md' | 'lg'
  }>(),
  { persistent: false, size: 'md' }
)

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ closed: [] }>()

const panel = ref<HTMLElement | null>(null)

// Swipe-to-dismiss (mobile): track vertical drag from the handle/header area
const dragOffset = ref(0)
let dragStartY = 0
let dragging = false

function onTouchStart(e: TouchEvent) {
  if (props.persistent) return
  dragging = true
  dragStartY = e.touches[0].clientY
}

function onTouchMove(e: TouchEvent) {
  if (!dragging) return
  dragOffset.value = Math.max(0, e.touches[0].clientY - dragStartY)
}

function onTouchEnd() {
  if (!dragging) return
  dragging = false
  if (dragOffset.value > 90) close()
  dragOffset.value = 0
}

function close() {
  if (props.persistent) return
  open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  open,
  async (isOpen) => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      panel.value?.focus()
    } else {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeydown)
      emit('closed')
    }
  },
  { immediate: false }
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <!-- Backdrop -->
        <div class="sheet-backdrop absolute inset-0 bg-black/60" @click="close" />

        <!-- Panel -->
        <div
          ref="panel"
          tabindex="-1"
          class="sheet-panel relative flex w-full flex-col rounded-t-[20px] bg-surface-1 shadow-xl outline-none md:rounded-[20px]"
          :class="size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-md'"
          :style="dragOffset ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : undefined"
        >
          <!-- Drag handle (mobile) -->
          <div
            class="flex justify-center pt-2.5 pb-1 md:hidden"
            @touchstart.passive="onTouchStart"
            @touchmove.passive="onTouchMove"
            @touchend.passive="onTouchEnd"
          >
            <div class="h-1 w-10 rounded-full bg-line-strong" />
          </div>

          <!-- Header -->
          <div
            v-if="title || !persistent"
            class="flex items-center justify-between gap-3 px-5 pt-1 pb-2 md:pt-4"
            @touchstart.passive="onTouchStart"
            @touchmove.passive="onTouchMove"
            @touchend.passive="onTouchEnd"
          >
            <h2 class="display-wide text-base text-ink">{{ title }}</h2>
            <IconButton v-if="!persistent" label="Close" @click="close">
              <X class="size-5" />
            </IconButton>
          </div>

          <!-- Body -->
          <div class="max-h-[75dvh] overflow-y-auto overscroll-contain px-5 pb-5 md:max-h-[70vh]">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="border-t border-line px-5 py-4 pb-safe md:pb-4">
            <slot name="footer" />
          </div>
          <div v-else class="pb-safe md:pb-0" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet-panel,
.sheet-leave-to .sheet-panel {
  transform: translateY(100%);
}
@media (min-width: 768px) {
  .sheet-enter-from .sheet-panel,
  .sheet-leave-to .sheet-panel {
    transform: translateY(16px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active,
  .sheet-leave-active,
  .sheet-enter-active .sheet-panel,
  .sheet-leave-active .sheet-panel {
    transition: none;
  }
}
</style>
