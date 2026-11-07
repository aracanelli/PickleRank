import { reactive } from 'vue'

/**
 * App-wide feedback channels rendered once by AppShell:
 * - announce(): screen-reader live region (polite or assertive)
 * - confirm(): promise-based confirm dialog for destructive or score-changing actions
 * - toast(): short visible confirmation that does not block
 */

export const liveRegion = reactive({ polite: '', assertive: '' })

export function announce(message: string, assertive = false) {
  const key = assertive ? 'assertive' : 'polite'
  // clear first so repeating the same message is announced again
  liveRegion[key] = ''
  setTimeout(() => { liveRegion[key] = message }, 50)
}

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
}

export const confirmState = reactive<{ open: boolean; options: ConfirmOptions | null; resolve: ((v: boolean) => void) | null }>({
  open: false,
  options: null,
  resolve: null
})

export function confirm(options: ConfirmOptions): Promise<boolean> {
  confirmState.resolve?.(false)
  return new Promise(resolve => {
    confirmState.options = options
    confirmState.resolve = resolve
    confirmState.open = true
  })
}

export function settleConfirm(value: boolean) {
  const r = confirmState.resolve
  confirmState.open = false
  confirmState.resolve = null
  r?.(value)
}

export const toastState = reactive<{ message: string; kind: 'ok' | 'bad'; id: number }>({ message: '', kind: 'ok', id: 0 })
let toastTimer: ReturnType<typeof setTimeout> | undefined

export function toast(message: string, kind: 'ok' | 'bad' = 'ok') {
  toastState.message = message
  toastState.kind = kind
  toastState.id++
  announce(message, kind === 'bad')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastState.message = '' }, kind === 'bad' ? 6000 : 3000)
}
