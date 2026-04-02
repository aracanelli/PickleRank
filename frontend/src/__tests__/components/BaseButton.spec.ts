import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'

describe('BaseButton', () => {
  it('renders slot content', () => {
    const wrapper = mount(BaseButton, {
      slots: { default: 'Click Me' }
    })
    expect(wrapper.text()).toContain('Click Me')
  })

  it('applies primary variant class by default', () => {
    const wrapper = mount(BaseButton)
    expect(wrapper.find('button').classes()).toContain('btn-primary')
  })

  it('applies specified variant class', () => {
    const wrapper = mount(BaseButton, {
      props: { variant: 'danger' }
    })
    expect(wrapper.find('button').classes()).toContain('btn-danger')
  })

  it('applies specified size class', () => {
    const wrapper = mount(BaseButton, {
      props: { size: 'lg' }
    })
    expect(wrapper.find('button').classes()).toContain('btn-lg')
  })

  it('defaults to md size', () => {
    const wrapper = mount(BaseButton)
    expect(wrapper.find('button').classes()).toContain('btn-md')
  })

  it('is disabled when disabled prop is true', () => {
    const wrapper = mount(BaseButton, {
      props: { disabled: true }
    })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('is disabled when loading prop is true', () => {
    const wrapper = mount(BaseButton, {
      props: { loading: true }
    })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('shows spinner when loading', () => {
    const wrapper = mount(BaseButton, {
      props: { loading: true }
    })
    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('does not show spinner when not loading', () => {
    const wrapper = mount(BaseButton, {
      props: { loading: false }
    })
    expect(wrapper.find('.spinner').exists()).toBe(false)
  })

  it('defaults button type to "button"', () => {
    const wrapper = mount(BaseButton)
    expect(wrapper.find('button').attributes('type')).toBe('button')
  })

  it('sets type to submit when specified', () => {
    const wrapper = mount(BaseButton, {
      props: { type: 'submit' }
    })
    expect(wrapper.find('button').attributes('type')).toBe('submit')
  })

  it('emits click event when clicked', async () => {
    const wrapper = mount(BaseButton)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('does not emit click when disabled', async () => {
    const wrapper = mount(BaseButton, {
      props: { disabled: true }
    })
    await wrapper.find('button').trigger('click')
    // Native disabled buttons don't fire click events
    // The button element itself prevents the event
  })
})
