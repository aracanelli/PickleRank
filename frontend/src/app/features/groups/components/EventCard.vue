<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Trash2 } from 'lucide-vue-next'
import type { EventListItemDto, EventStatus } from '@/app/core/models/dto'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'

const props = withDefaults(
  defineProps<{
    event: EventListItemDto
    /** Show a delete action (organizers, pending events only). */
    deletable?: boolean
  }>(),
  { deletable: false }
)

const emit = defineEmits<{ click: []; delete: [] }>()

const statusVariant: Record<EventStatus, 'muted' | 'info' | 'warning' | 'success'> = {
  DRAFT: 'muted',
  GENERATED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success'
}

const statusLabel: Record<EventStatus, string> = {
  DRAFT: 'Draft',
  GENERATED: 'Generated',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed'
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formattedDate = computed(() => formatDate(props.event.startsAt))
const title = computed(() => props.event.name || formattedDate.value || 'Unnamed event')

const subtitle = computed(() => {
  const parts: string[] = []
  // Only repeat the date when it isn't already the title
  if (props.event.name) parts.push(formattedDate.value || 'No date')
  parts.push(`${props.event.courts} courts × ${props.event.rounds} rounds`)
  return parts.join(' · ')
})
</script>

<template>
  <div class="flex items-center rounded-xl border border-line bg-surface-1 transition-colors hover:bg-surface-2">
    <button
      type="button"
      class="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
      @click="emit('click')"
    >
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="flex items-center gap-2">
          <span class="truncate text-sm font-semibold text-ink">{{ title }}</span>
          <AppBadge :variant="statusVariant[event.status]">{{ statusLabel[event.status] }}</AppBadge>
        </span>
        <span class="truncate text-sm text-ink-faint">{{ subtitle }}</span>
      </span>
      <ChevronRight v-if="!deletable" class="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
    </button>
    <div v-if="deletable" class="pr-2">
      <IconButton label="Delete event" variant="danger" @click.stop="emit('delete')">
        <Trash2 class="size-5" />
      </IconButton>
    </div>
  </div>
</template>
