<script setup lang="ts">
import { computed } from 'vue'
import type { GroupPlayerDto } from '@/app/core/models/dto'
import type { Outcome } from '@/app/features/rankings/utils/match-derivations'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import CountUpNumber from '@/app/core/ui/components/CountUpNumber.vue'
import FormGuideDots from '@/app/core/ui/components/FormGuideDots.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'

// Trading-card hero for the player profile: identity, tape chips, the big
// rating numeral with delta, and the recent form guide.
const props = withDefaults(
  defineProps<{
    player: GroupPlayerDto
    /** Last-N results, newest first (computed by the parent from one history fetch). */
    form?: Outcome[]
    /** The signed-in user's own player — gets the volt avatar ring. */
    isMe?: boolean
  }>(),
  { form: () => [], isMe: false }
)

const skillLabel = computed(() => {
  const level = props.player.skillLevel
  if (!level) return null
  return level.charAt(0) + level.slice(1).toLowerCase()
})

const ratingDelta = computed(() => props.player.ratingDelta)
</script>

<template>
  <section
    class="ticket-clip stadium-glow relative overflow-hidden rounded-[20px] border border-line bg-surface-1 p-5"
  >
    <CourtLines crop="corner" class="absolute -right-5 -top-5 h-44 w-auto" />

    <!-- Identity row -->
    <div class="relative flex items-start gap-4">
      <Avatar :name="player.displayName" size="xl" :seed="player.playerId" :brand="isMe" />
      <div class="min-w-0 flex-1 pt-1">
        <h1 class="display-wide truncate text-2xl text-ink">{{ player.displayName }}</h1>
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <TapeChip v-if="player.membershipType === 'SUB'" variant="warn">Sub</TapeChip>
          <TapeChip v-if="skillLabel" variant="muted">{{ skillLabel }}</TapeChip>
          <TapeChip v-if="player.role === 'ORGANIZER'" variant="info">Organizer</TapeChip>
        </div>
      </div>
    </div>

    <!-- Rating + form guide -->
    <div class="relative mt-6 flex items-end justify-between gap-4">
      <div class="flex flex-col">
        <span class="eyebrow text-ink-faint">Rating</span>
        <span class="flex h-13 items-center text-ink">
          <CountUpNumber :value="player.rating" :decimals="1" class="text-5xl" />
        </span>
        <span
          v-if="ratingDelta"
          class="mt-0.5 flex h-5 items-center gap-1 text-sm font-semibold"
          :class="ratingDelta > 0 ? 'text-win' : 'text-loss'"
        >
          <span aria-hidden="true">{{ ratingDelta > 0 ? '▲' : '▼' }}</span>
          <CountUpNumber :value="ratingDelta" :decimals="1" signed class="text-sm" />
          <span class="sr-only">rating change</span>
        </span>
      </div>

      <div v-if="form.length > 0" class="flex flex-col items-end gap-1.5 pb-1">
        <span class="eyebrow text-ink-faint">Form</span>
        <FormGuideDots :results="form" />
      </div>
    </div>
  </section>
</template>
