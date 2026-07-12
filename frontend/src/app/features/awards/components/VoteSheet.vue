<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search, Check } from 'lucide-vue-next'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'

const props = defineProps<{
  players: GroupPlayerDto[]
  /** The caller's current pick (group-player id), if any. */
  currentVote?: string | null
  title?: string
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ select: [groupPlayerId: string] }>()

const query = ref('')

watch(open, (isOpen) => {
  if (isOpen) query.value = ''
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = [...props.players].sort((a, b) => a.displayName.localeCompare(b.displayName))
  if (!q) return list
  return list.filter((p) => p.displayName.toLowerCase().includes(q))
})

function choose(player: GroupPlayerDto) {
  emit('select', player.id)
}
</script>

<template>
  <Sheet v-model="open" :title="title || 'Cast your vote'">
    <div class="flex flex-col gap-3">
      <AppInput v-model="query" placeholder="Search players" inputmode="search">
        <template #leading><Search class="size-4" /></template>
      </AppInput>

      <ul class="flex flex-col gap-1">
        <li v-for="player in filtered" :key="player.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-[10px] border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            :class="
              player.id === currentVote
                ? 'border-accent-fill bg-accent-soft'
                : 'border-transparent hover:bg-surface-2'
            "
            @click="choose(player)"
          >
            <Avatar
              :name="player.displayName"
              :seed="player.playerId"
              size="md"
              :brand="player.id === currentVote"
            />
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {{ player.displayName }}
            </span>
            <Check
              v-if="player.id === currentVote"
              class="size-5 shrink-0 text-accent-text"
              aria-hidden="true"
            />
          </button>
        </li>
        <li v-if="filtered.length === 0" class="px-2 py-6 text-center text-sm text-ink-faint">
          No players match "{{ query }}".
        </li>
      </ul>
    </div>
  </Sheet>
</template>
