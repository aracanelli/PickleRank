import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseInput from '@/app/core/ui/components/BaseInput.vue'

describe('BaseInput', () => {
  it('renders label when provided', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Player Name' }
    })
    expect(wrapper.find('.label').text()).toBe('Player Name')
  })

  it('does not render label when not provided', () => {
    const wrapper = mount(BaseInput)
    expect(wrapper.find('.label').exists()).toBe(false)
  })

  it('renders with text type by default', () => {
    const wrapper = mount(BaseInput)
    expect(wrapper.find('input').attributes('type')).toBe('text')
  })

  it('uses specified type', () => {
    const wrapper = mount(BaseInput, {
      props: { type: 'email' }
    })
    expect(wrapper.find('input').attributes('type')).toBe('email')
  })

  it('renders placeholder', () => {
    const wrapper = mount(BaseInput, {
      props: { placeholder: 'Enter name...' }
    })
    expect(wrapper.find('input').attributes('placeholder')).toBe('Enter name...')
  })

  it('displays the modelValue', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: 'John' }
    })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('John')
  })

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: '' }
    })
    const input = wrapper.find('input')
    await input.setValue('Alice')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })

  it('shows error message when provided', () => {
    const wrapper = mount(BaseInput, {
      props: { error: 'Name is required' }
    })
    expect(wrapper.find('.error').text()).toBe('Name is required')
  })

  it('does not show error when not provided', () => {
    const wrapper = mount(BaseInput)
    expect(wrapper.find('.error').exists()).toBe(false)
  })

  it('adds has-error class when error is present', () => {
    const wrapper = mount(BaseInput, {
      props: { error: 'Required' }
    })
    expect(wrapper.find('.input-group').classes()).toContain('has-error')
  })

  it('does not add has-error class when no error', () => {
    const wrapper = mount(BaseInput)
    expect(wrapper.find('.input-group').classes()).not.toContain('has-error')
  })
})
