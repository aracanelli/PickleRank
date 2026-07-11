import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppButton from '@/app/core/ui/components/AppButton.vue'

describe('AppButton', () => {
  it('renders slot content', () => {
    const wrapper = mount(AppButton, { slots: { default: 'Save' } })
    expect(wrapper.text()).toContain('Save')
  })

  it('emits click', async () => {
    const wrapper = mount(AppButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('is disabled while loading and shows a spinner', () => {
    const wrapper = mount(AppButton, { props: { loading: true } })
    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('does not emit click when disabled', async () => {
    const wrapper = mount(AppButton, { props: { disabled: true } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('exposes the variant as a data attribute', () => {
    const primary = mount(AppButton, { props: { variant: 'primary' } })
    const danger = mount(AppButton, { props: { variant: 'danger' } })
    const broadcast = mount(AppButton, { props: { variant: 'broadcast' } })
    expect(primary.attributes('data-variant')).toBe('primary')
    expect(danger.attributes('data-variant')).toBe('danger')
    expect(broadcast.attributes('data-variant')).toBe('broadcast')
  })

  it('defaults to the primary variant', () => {
    const wrapper = mount(AppButton)
    expect(wrapper.attributes('data-variant')).toBe('primary')
  })

  it('renders full width with block', () => {
    const wrapper = mount(AppButton, { props: { block: true } })
    expect(wrapper.classes()).toContain('w-full')
  })
})
