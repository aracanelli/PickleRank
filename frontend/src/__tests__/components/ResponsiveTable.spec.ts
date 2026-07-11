import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// Control the media query result per test
const isDesktop = vi.hoisted(() => {
  return { ref: null as { value: boolean } | null, value: false }
})
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return {
    useMediaQuery: () => {
      const r = ref(isDesktop.value)
      isDesktop.ref = r
      return r
    }
  }
})

import ResponsiveTable from '@/app/core/ui/components/ResponsiveTable.vue'

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'rating', label: 'Rating', align: 'right' as const }
]
const items = [
  { id: '1', name: 'Alice', rating: 1200 },
  { id: '2', name: 'Bob', rating: 1100 }
]

function mountTable(clickable = false) {
  return mount(ResponsiveTable, {
    props: { columns, items, itemKey: (item: unknown) => (item as { id: string }).id, clickable },
    slots: {
      card: '<template #card="{ item }"><div class="card-slot">{{ item.name }}</div></template>',
      'cell-name': '<template #cell-name="{ item }">{{ item.name }}</template>',
      'cell-rating': '<template #cell-rating="{ item }">{{ item.rating }}</template>'
    }
  })
}

describe('ResponsiveTable', () => {
  beforeEach(() => {
    isDesktop.value = false
  })

  it('renders a card list on mobile', () => {
    const wrapper = mountTable()
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.findAll('.card-slot')).toHaveLength(2)
    expect(wrapper.text()).toContain('Alice')
  })

  it('renders a table on desktop with column headers', () => {
    isDesktop.value = true
    const wrapper = mountTable()
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.findAll('th').map((th) => th.text())).toEqual(['Name', 'Rating'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('emits rowClick when clickable', async () => {
    const wrapper = mountTable(true)
    await wrapper.findAll('li')[1].trigger('click')
    expect(wrapper.emitted('rowClick')?.[0]).toEqual([items[1]])
  })

  it('does not emit rowClick when not clickable', async () => {
    const wrapper = mountTable(false)
    await wrapper.findAll('li')[0].trigger('click')
    expect(wrapper.emitted('rowClick')).toBeUndefined()
  })
})
