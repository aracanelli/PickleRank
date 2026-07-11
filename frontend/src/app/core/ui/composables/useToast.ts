import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: number
  type: ToastType
  message: string
}

const DEFAULT_DURATION = 4000
let nextId = 1

// Module-level state: one toast queue for the whole app, rendered by ToastHost.
const toasts = reactive<Toast[]>([])

function dismiss(id: number) {
  const idx = toasts.findIndex((t) => t.id === id)
  if (idx !== -1) toasts.splice(idx, 1)
}

function push(type: ToastType, message: string, duration = DEFAULT_DURATION) {
  const id = nextId++
  toasts.push({ id, type, message })
  if (duration > 0) setTimeout(() => dismiss(id), duration)
  return id
}

export function useToast() {
  return {
    toasts,
    dismiss,
    success: (message: string, duration?: number) => push('success', message, duration),
    error: (message: string, duration?: number) => push('error', message, duration),
    info: (message: string, duration?: number) => push('info', message, duration),
    warning: (message: string, duration?: number) => push('warning', message, duration)
  }
}
