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

  it('applies variant classes', () => {
    const primary = mount(AppButton, { props: { variant: 'primary' } })
    const danger = mount(AppButton, { props: { variant: 'danger' } })
    expect(primary.classes().join(' ')).toContain('bg-brand')
    expect(danger.classes().join(' ')).toContain('bg-loss')
  })

  it('renders full width with block', () => {
    const wrapper = mount(AppButton, { props: { block: true } })
    expect(wrapper.classes()).toContain('w-full')
  })
})
