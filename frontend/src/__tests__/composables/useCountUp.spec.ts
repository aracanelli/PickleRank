import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

const reducedState = { matches: false }

beforeEach(() => {
  reducedState.matches = false
  let now = 0
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    // Each frame advances 100ms, driven synchronously via queueMicrotask-free loop
    return setTimeout(() => {
      now += 100
      cb(now)
    }, 0) as unknown as number
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: reducedState.matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  )
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

import { useCountUp } from '@/app/core/ui/composables/useCountUp'

function setup(target = ref(0), options: Parameters<typeof useCountUp>[1] = {}) {
  let result!: ReturnType<typeof useCountUp>
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useCountUp(target, options)
        return () => null
      }
    })
  )
  return { target, result, wrapper }
}

describe('useCountUp', () => {
  it('animates toward the target over the duration', async () => {
    const { target, result } = setup(ref(0), { duration: 500 })
    target.value = 100
    await nextTick()

    await vi.advanceTimersToNextTimerAsync() // exactly one frame (t=100/500)
    expect(result.display.value).toBeGreaterThan(0)
    expect(result.display.value).toBeLessThan(100)

    await vi.advanceTimersByTimeAsync(100) // run remaining frames
    expect(result.display.value).toBe(100)
  })

  it('jumps straight to the value under reduced motion', async () => {
    reducedState.matches = true
    const { target, result } = setup(ref(0), { duration: 500 })
    target.value = 42
    await nextTick()
    expect(result.display.value).toBe(42)
  })

  it('retargets mid-flight without overshooting', async () => {
    const { target, result } = setup(ref(0), { duration: 500 })
    target.value = 100
    await nextTick()
    await vi.advanceTimersByTimeAsync(10)

    target.value = 10
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    expect(result.display.value).toBe(10)
  })

  it('respects decimals', async () => {
    const { target, result } = setup(ref(0), { duration: 300, decimals: 1 })
    target.value = 5.5
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    expect(result.display.value).toBe(5.5)
  })

  it('cancels the rAF loop on unmount', async () => {
    const { target, wrapper } = setup(ref(0), { duration: 500 })
    target.value = 100
    await nextTick()
    wrapper.unmount()
    // Advancing timers after unmount must not throw or keep animating
    await vi.advanceTimersByTimeAsync(500)
  })
})
