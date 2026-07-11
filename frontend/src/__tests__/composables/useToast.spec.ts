import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useToast } from '@/app/core/ui/composables/useToast'

describe('useToast', () => {
  const toast = useToast()

  beforeEach(() => {
    toast.toasts.splice(0)
    vi.useRealTimers()
  })

  it('pushes toasts of each type', () => {
    toast.success('saved')
    toast.error('failed')
    expect(toast.toasts).toHaveLength(2)
    expect(toast.toasts[0]).toMatchObject({ type: 'success', message: 'saved' })
    expect(toast.toasts[1]).toMatchObject({ type: 'error', message: 'failed' })
  })

  it('dismisses by id', () => {
    const id = toast.info('hello')
    expect(toast.toasts).toHaveLength(1)
    toast.dismiss(id)
    expect(toast.toasts).toHaveLength(0)
  })

  it('auto-dismisses after the duration', () => {
    vi.useFakeTimers()
    toast.success('temp', 1000)
    expect(toast.toasts).toHaveLength(1)
    vi.advanceTimersByTime(1100)
    expect(toast.toasts).toHaveLength(0)
  })

  it('keeps toasts with duration 0 until dismissed', () => {
    vi.useFakeTimers()
    toast.warning('sticky', 0)
    vi.advanceTimersByTime(10000)
    expect(toast.toasts).toHaveLength(1)
  })
})
