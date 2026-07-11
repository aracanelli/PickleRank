import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Sheet from '@/app/core/ui/components/Sheet.vue'

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(Sheet, {
    props: { modelValue: true, title: 'Test sheet', ...props },
    slots: { default: '<p>Body content</p>' },
    attachTo: document.body
  })
}

describe('Sheet', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('teleports content to body when open', () => {
    mountSheet()
    expect(document.body.textContent).toContain('Body content')
    expect(document.body.textContent).toContain('Test sheet')
  })

  it('renders nothing when closed', () => {
    mountSheet({ modelValue: false })
    expect(document.body.textContent).not.toContain('Body content')
  })

  it('closes on backdrop click', async () => {
    const wrapper = mountSheet()
    await document.querySelector<HTMLElement>('.sheet-backdrop')!.click()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
  })

  it('does not close on backdrop click when persistent', async () => {
    const wrapper = mountSheet({ persistent: true })
    await document.querySelector<HTMLElement>('.sheet-backdrop')!.click()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('locks body scroll while open', async () => {
    const wrapper = mountSheet({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect(document.body.style.overflow).toBe('hidden')
    await wrapper.setProps({ modelValue: false })
    expect(document.body.style.overflow).toBe('')
  })
})
