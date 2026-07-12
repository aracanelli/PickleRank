<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Search } from 'lucide-vue-next'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'

// Two avatar slots around a volt VS mark. Tapping a slot opens a searchable
// player sheet. Models carry GLOBAL player ids (shareable ?h2h= values).
const props = defineProps<{ players: GroupPlayerDto[] }>()

const playerOne = defineModel<string>('playerOne', { default: '' })
const playerTwo = defineModel<string>('playerTwo', { default: '' })

const sheetOpen = ref(false)
const activeSlot = ref<1 | 2>(1)
const search = ref('')

const selectedOne = computed(
  () => props.players.find((p) => p.playerId === playerOne.value) ?? null
)
const selectedTwo = computed(
  () => props.players.find((p) => p.playerId === playerTwo.value) ?? null
)

function openSlot(slot: 1 | 2) {
  activeSlot.value = slot
  search.value = ''
  sheetOpen.value = true
}

const options = computed(() => {
  // The other slot's pick is excluded — a player can't face themselves
  const excluded = activeSlot.value === 1 ? playerTwo.value : playerOne.value
  const query = search.value.trim().toLowerCase()
  return [...props.players]
    .filter((p) => p.playerId !== excluded)
    .filter((p) => !query || p.displayName.toLowerCase().includes(query))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
})

function pick(player: GroupPlayerDto) {
  if (activeSlot.value === 1) playerOne.value = player.playerId
  else playerTwo.value = player.playerId
  sheetOpen.value = false
}
</script>

<template>
  <section
    class="ticket-clip stadium-glow relative overflow-hidden rounded-[20px] border border-line bg-surface-1 p-4"
  >
    <CourtLines crop="corner" class="absolute -right-4 -top-4 h-36 w-auto" />

    <div class="relative flex items-center gap-2">
      <!-- Slot 1 -->
      <button
        type="button"
        class="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-[14px] px-2 py-3 transition-colors hover:bg-surface-2"
        aria-label="Pick first player"
        @click="openSlot(1)"
      >
        <Avatar
          v-if="selectedOne"
          :name="selectedOne.displayName"
          size="xl"
          :seed="selectedOne.playerId"
        />
        <span
          v-else
          class="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-ink-faint"
        >
          <Plus class="size-7" />
        </span>
        <span
          class="w-full truncate text-center text-sm font-semibold"
          :class="selectedOne ? 'text-ink' : 'text-ink-faint'"
        >
          {{ selectedOne?.displayName || 'Pick player' }}
        </span>
        <span v-if="selectedOne" class="h-1 w-8 rounded-full bg-accent-fill" aria-hidden="true" />
      </button>

      <!-- VS mark -->
      <span
        class="display-wide inline-block shrink-0 -skew-x-6 text-3xl text-accent-text"
        aria-hidden="true"
      >VS</span>

      <!-- Slot 2 -->
      <button
        type="button"
        class="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-[14px] px-2 py-3 transition-colors hover:bg-surface-2"
        aria-label="Pick second player"
        @click="openSlot(2)"
      >
        <Avatar
          v-if="selectedTwo"
          :name="selectedTwo.displayName"
          size="xl"
          :seed="selectedTwo.playerId"
        />
        <span
          v-else
          class="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-ink-faint"
        >
          <Plus class="size-7" />
        </span>
        <span
          class="w-full truncate text-center text-sm font-semibold"
          :class="selectedTwo ? 'text-ink' : 'text-ink-faint'"
        >
          {{ selectedTwo?.displayName || 'Pick player' }}
        </span>
        <span v-if="selectedTwo" class="h-1 w-8 rounded-full bg-info" aria-hidden="true" />
      </button>
    </div>
  </section>

  <!-- Player picker sheet -->
  <Sheet v-model="sheetOpen" :title="activeSlot === 1 ? 'Pick first player' : 'Pick second player'">
    <div class="flex flex-col gap-3">
      <AppInput v-model="search" type="search" placeholder="Search players" inputmode="search">
        <template #leading><Search class="size-4" /></template>
      </AppInput>

      <div class="divide-y divide-line overflow-hidden rounded-[14px] border border-line">
        <button
          v-for="player in options"
          :key="player.playerId"
          type="button"
          class="flex min-h-13 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
          @click="pick(player)"
        >
          <Avatar :name="player.displayName" size="sm" :seed="player.playerId" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {{ player.displayName }}
          </span>
          <span class="shrink-0 numeral text-sm text-ink-muted">{{ player.rating.toFixed(1) }}</span>
        </button>
        <p v-if="options.length === 0" class="px-4 py-6 text-center text-sm text-ink-faint">
          No players match your search
        </p>
      </div>
    </div>
  </Sheet>
</template>
