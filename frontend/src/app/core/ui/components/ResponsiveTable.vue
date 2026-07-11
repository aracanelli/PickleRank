<script setup lang="ts" generic="T">
import { useMediaQuery } from '@vueuse/core'

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
}

defineProps<{
  columns: TableColumn[]
  items: T[]
  /** Key extractor for v-for stability. */
  itemKey: (item: T) => string
  clickable?: boolean
}>()

const emit = defineEmits<{ rowClick: [item: T] }>()

// Card list below md, real table at md and up
const isDesktop = useMediaQuery('(min-width: 768px)')

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }
</script>

<template>
  <!-- Mobile: card list -->
  <ul v-if="!isDesktop" class="flex flex-col gap-2">
    <li
      v-for="item in items"
      :key="itemKey(item)"
      class="rounded-[14px] border border-line bg-surface-1"
      :class="clickable ? 'cursor-pointer transition-colors active:bg-surface-2' : ''"
      @click="clickable && emit('rowClick', item)"
    >
      <slot name="card" :item="item" />
    </li>
  </ul>

  <!-- Desktop: table -->
  <div v-else class="overflow-x-auto rounded-[14px] border border-line bg-surface-1">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-line">
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3 eyebrow text-ink-faint"
            :class="alignClass[col.align || 'left']"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="itemKey(item)"
          class="border-b border-line last:border-b-0"
          :class="clickable ? 'cursor-pointer transition-colors hover:bg-surface-2' : ''"
          @click="clickable && emit('rowClick', item)"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3 text-ink"
            :class="alignClass[col.align || 'left']"
          >
            <slot :name="`cell-${col.key}`" :item="item" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
