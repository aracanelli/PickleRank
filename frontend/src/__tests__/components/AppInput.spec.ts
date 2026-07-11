import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppInput from '@/app/core/ui/components/AppInput.vue'

describe('AppInput', () => {
  it('renders label linked to the input', () => {
    const wrapper = mount(AppInput, { props: { label: 'Name' } })
    const label = wrapper.find('label')
    const input = wrapper.find('input')
    expect(label.text()).toContain('Name')
    expect(label.attributes('for')).toBe(input.attributes('id'))
  })

  it('supports v-model', async () => {
    const wrapper = mount(AppInput, {
      props: { modelValue: '', 'onUpdate:modelValue': (v: string | number | undefined) => wrapper.setProps({ modelValue: v }) }
    })
    await wrapper.find('input').setValue('hello')
    expect(wrapper.props('modelValue')).toBe('hello')
  })

  it('shows error text and aria-invalid', () => {
    const wrapper = mount(AppInput, { props: { error: 'Required' } })
    expect(wrapper.text()).toContain('Required')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('shows hint when no error', () => {
    const wrapper = mount(AppInput, { props: { hint: 'Optional', error: '' } })
    expect(wrapper.text()).toContain('Optional')
  })

  it('marks required fields', () => {
    const wrapper = mount(AppInput, { props: { label: 'Name', required: true } })
    expect(wrapper.find('label').text()).toContain('*')
    expect(wrapper.find('input').attributes('required')).toBeDefined()
  })
})
