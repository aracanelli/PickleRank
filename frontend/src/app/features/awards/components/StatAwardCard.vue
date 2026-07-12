<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { StatAwardDto } from '@/app/core/models/dto'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import CountUpNumber from '@/app/core/ui/components/CountUpNumber.vue'

const props = defineProps<{
  award: StatAwardDto
  groupId: string
}>()

const router = useRouter()

const isChampion = computed(() => props.award.key === 'champion')

// Winner + optional partner names, joined for pairing awards.
const names = computed(() => {
  if (props.award.partner) {
    return `${props.award.winner.displayName} & ${props.award.partner.displayName}`
  }
  return props.award.winner.displayName
})

function openWinner() {
  router.push(`/groups/${props.groupId}/players/${props.award.winner.groupPlayerId}`)
}
</script>

<template>
  <div
    class="relative flex flex-col gap-3 overflow-hidden border border-line p-4"
    :class="
      isChampion
        ? 'stadium-glow ticket-clip rounded-[20px] bg-surface-court'
        : 'rounded-[14px] bg-surface-1'
    "
  >
    <div class="flex items-center gap-3">
      <span class="text-3xl leading-none" aria-hidden="true">{{ award.emoji }}</span>
      <div class="min-w-0 flex-1">
        <h3 class="display-wide text-sm text-ink">{{ award.title }}</h3>
      </div>
    </div>

    <button
      type="button"
      class="flex items-center gap-3 rounded-[10px] text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      @click="openWinner"
    >
      <span class="flex shrink-0 items-center">
        <Avatar
          :name="award.winner.displayName"
          :seed="award.winner.playerId"
          size="lg"
          :brand="isChampion"
        />
        <Avatar
          v-if="award.partner"
          :name="award.partner.displayName"
          :seed="award.partner.playerId"
          size="lg"
          class="-ml-4 ring-2 ring-surface-1"
        />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold text-ink">{{ names }}</span>
        <span class="mt-1 flex items-baseline gap-1.5">
          <span class="numeral text-3xl leading-none text-accent-text">
            <CountUpNumber :value="award.value" :decimals="Number.isInteger(award.value) ? 0 : 1" />
          </span>
          <span v-if="award.detail" class="truncate text-xs text-ink-faint">{{ award.detail }}</span>
        </span>
      </span>
    </button>

    <p class="text-xs leading-relaxed text-ink-muted">{{ award.blurb }}</p>
  </div>
</template>
