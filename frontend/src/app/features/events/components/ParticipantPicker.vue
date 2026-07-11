<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, Check, Star, RefreshCw } from 'lucide-vue-next'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import PlayerChip from '@/app/core/ui/components/PlayerChip.vue'

const props = defineProps<{
  players: GroupPlayerDto[]
  /** Exact number of players the event needs (courts × 4). */
  max: number
}>()

const selected = defineModel<string[]>({ required: true })

const search = ref('')

const selectedSet = computed(() => new Set(selected.value))
const isExact = computed(() => selected.value.length === props.max)
const atCapacity = computed(() => selected.value.length >= props.max)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.players
  return props.players.filter((p) => p.displayName.toLowerCase().includes(q))
})

const sections = computed(() => [
  {
    key: 'PERMANENT',
    title: 'Permanent',
    icon: Star,
    players: filtered.value.filter((p) => p.membershipType === 'PERMANENT'),
    total: props.players.filter((p) => p.membershipType === 'PERMANENT'),
    selectedCount: props.players.filter(
      (p) => p.membershipType === 'PERMANENT' && selectedSet.value.has(p.id)
    ).length
  },
  {
    key: 'SUB',
    title: 'Subs',
    icon: RefreshCw,
    players: filtered.value.filter((p) => p.membershipType === 'SUB'),
    total: props.players.filter((p) => p.membershipType === 'SUB'),
    selectedCount: props.players.filter(
      (p) => p.membershipType === 'SUB' && selectedSet.value.has(p.id)
    ).length
  }
])

const selectedPlayers = computed(() => props.players.filter((p) => selectedSet.value.has(p.id)))

function toggle(playerId: string) {
  const set = new Set(selected.value)
  if (set.has(playerId)) {
    // Deselecting is always allowed
    set.delete(playerId)
  } else if (set.size < props.max) {
    // Only allow selecting up to the required count (ported legacy guard)
    set.add(playerId)
  }
  selected.value = [...set]
}

// Ported: select all permanent players, keeping already-selected subs up to the limit
function selectAllPermanent() {
  const permanentIds = props.players
    .filter((p) => p.membershipType === 'PERMANENT')
    .map((p) => p.id)
  const current = selectedSet.value
  const next = new Set(permanentIds)
  let added = permanentIds.length
  for (const sub of props.players.filter((p) => p.membershipType === 'SUB')) {
    if (current.has(sub.id) && added < props.max) {
      next.add(sub.id)
      added++
    }
  }
  selected.value = [...next]
}

function clearSelection() {
  selected.value = []
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Sticky counter pill -->
    <div class="sticky top-14 z-20 -mx-1 flex items-center justify-between gap-3 bg-surface-page/95 px-1 py-2 backdrop-blur">
      <span
        class="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
        :class="isExact ? 'bg-brand text-brand-contrast' : 'bg-surface-2 text-ink-muted'"
        aria-live="polite"
      >
        <span class="font-mono tabular-nums">{{ selected.length }}&nbsp;/&nbsp;{{ max }}</span>
        <span class="ml-1.5 font-medium">selected</span>
      </span>
      <div class="flex items-center gap-3">
        <button type="button" class="min-h-11 text-sm font-medium text-brand hover:underline" @click="selectAllPermanent">
          All permanent
        </button>
        <button type="button" class="min-h-11 text-sm font-medium text-ink-muted hover:underline" @click="clearSelection">
          Clear
        </button>
      </div>
    </div>

    <!-- Selected chips -->
    <div v-if="selectedPlayers.length > 0" class="flex flex-wrap gap-1.5">
      <PlayerChip
        v-for="p in selectedPlayers"
        :key="p.id"
        :name="p.displayName"
        removable
        @remove="toggle(p.id)"
      />
    </div>

    <AppInput v-model="search" placeholder="Search players" inputmode="search">
      <template #leading><Search class="size-4" /></template>
    </AppInput>

    <div v-for="section in sections" :key="section.key" class="flex flex-col gap-2">
      <div class="flex items-center justify-between px-1">
        <h3 class="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <component :is="section.icon" class="size-4 text-ink-faint" aria-hidden="true" />
          {{ section.title }}
        </h3>
        <span class="text-xs text-ink-faint">
          <span class="font-mono tabular-nums">{{ section.selectedCount }} / {{ section.total.length }}</span> selected
        </span>
      </div>

      <p v-if="section.players.length === 0" class="rounded-xl border border-dashed border-line px-4 py-4 text-center text-sm text-ink-faint">
        {{ section.total.length === 0 ? `No ${section.title.toLowerCase()} players in this group.` : 'No matches.' }}
      </p>

      <div v-else class="flex flex-col gap-1.5">
        <button
          v-for="player in section.players"
          :key="player.id"
          type="button"
          class="flex min-h-11 w-full items-center gap-3 rounded-xl border bg-surface-1 px-3 py-2 text-left transition-colors"
          :class="[
            selectedSet.has(player.id)
              ? 'border-brand ring-2 ring-brand/40'
              : 'border-line hover:bg-surface-2',
            !selectedSet.has(player.id) && atCapacity ? 'opacity-50' : ''
          ]"
          :aria-pressed="selectedSet.has(player.id)"
          @click="toggle(player.id)"
        >
          <Avatar :name="player.displayName" size="sm" :brand="selectedSet.has(player.id)" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink">{{ player.displayName }}</span>
          <AppBadge v-if="player.membershipType === 'SUB'" variant="warning">Sub</AppBadge>
          <span class="font-mono text-xs tabular-nums text-ink-faint">{{ Math.round(player.rating) }}</span>
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors"
            :class="selectedSet.has(player.id) ? 'border-brand bg-brand text-brand-contrast' : 'border-line-strong text-transparent'"
            aria-hidden="true"
          >
            <Check class="size-4" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
