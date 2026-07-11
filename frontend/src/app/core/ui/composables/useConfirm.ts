import { reactive } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions
  resolve: ((value: boolean) => void) | null
}

// Module-level state rendered by ConfirmSheet (mounted once in AppShell).
const state = reactive<ConfirmState>({
  open: false,
  options: { title: '' },
  resolve: null
})

/** Promise-based confirmation dialog: `if (await confirm({...})) { ... }` */
function confirm(options: ConfirmOptions): Promise<boolean> {
  // Settle any confirm already in flight as cancelled
  state.resolve?.(false)
  state.options = options
  state.open = true
  return new Promise((resolve) => {
    state.resolve = resolve
  })
}

function settle(value: boolean) {
  state.open = false
  state.resolve?.(value)
  state.resolve = null
}

export function useConfirm() {
  return { state, confirm, settle }
}
