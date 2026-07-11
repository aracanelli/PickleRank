<script setup lang="ts">
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-vue-next'
import { useToast, type ToastType } from '../composables/useToast'

const { toasts, dismiss } = useToast()

const icons: Record<ToastType, unknown> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle
}

const iconColor: Record<ToastType, string> = {
  success: 'text-win',
  error: 'text-loss',
  info: 'text-info',
  warning: 'text-warn'
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-safe"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto mt-2 flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-line bg-surface-1 px-4 py-3 shadow-lg"
        >
          <component :is="icons[toast.type]" class="mt-0.5 size-5 shrink-0" :class="iconColor[toast.type]" aria-hidden="true" />
          <p class="flex-1 text-sm text-ink">{{ toast.message }}</p>
          <button
            type="button"
            class="shrink-0 rounded-md p-0.5 text-ink-faint transition-colors hover:text-ink"
            aria-label="Dismiss"
            @click="dismiss(toast.id)"
          >
            <X class="size-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
