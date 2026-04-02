import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'

describe('EmptyState', () => {
  it('renders title', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No players found' }
    })
    expect(wrapper.find('.title').text()).toBe('No players found')
  })

  it('renders description when provided', () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'No events',
        description: 'Create your first event to get started'
      }
    })
    expect(wrapper.find('.description').text()).toBe('Create your first event to get started')
  })

  it('does not render description when not provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Empty' }
    })
    expect(wrapper.find('.description').exists()).toBe(false)
  })

  it('renders string icon', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data', icon: '🏓' }
    })
    expect(wrapper.find('.icon').text()).toContain('🏓')
  })

  it('does not render icon section when icon not provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data' }
    })
    expect(wrapper.find('.icon').exists()).toBe(false)
  })

  it('renders action slot when provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No groups' },
      slots: {
        action: '<button>Create Group</button>'
      }
    })
    expect(wrapper.find('.action').exists()).toBe(true)
    expect(wrapper.find('.action button').text()).toBe('Create Group')
  })

  it('does not render action area when no action slot', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No groups' }
    })
    expect(wrapper.find('.action').exists()).toBe(false)
  })
})
