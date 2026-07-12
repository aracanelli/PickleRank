<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { RatingUpdateDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import CountUpNumber from '@/app/core/ui/components/CountUpNumber.vue'

const props = defineProps<{
  updates: RatingUpdateDto[]
  groupId: string
}>()

const open = defineModel<boolean>({ required: true })
const router = useRouter()

const sortedUpdates = computed(() => [...props.updates].sort((a, b) => b.delta - a.delta))

// Top gainer of the night — only if somebody actually gained
const mvpPlayerId = computed(() => {
  const top = sortedUpdates.value[0]
  return top && top.delta > 0 ? top.playerId : null
})

function deltaClasses(delta: number) {
  if (delta > 0) return 'text-win'
  if (delta < 0) return 'text-loss'
  return 'text-ink-faint'
}
</script>

<template>
  <Sheet v-model="open" title="Ratings updated">
    <div class="flex flex-col gap-2 py-1">
      <div
        v-for="(update, i) in sortedUpdates"
        :key="update.playerId"
        class="reveal-row flex items-center gap-3 rounded-[14px] border bg-surface-1 px-3 py-2.5"
        :class="update.playerId === mvpPlayerId ? 'border-line-strong shadow-glow' : 'border-line'"
        :style="{ '--reveal-delay': `${i * 60}ms` }"
      >
        <Avatar :name="update.displayName" :seed="update.playerId" size="sm" />
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm font-semibold text-ink">
            <span class="min-w-0 truncate">{{ update.displayName }}</span>
            <TapeChip v-if="update.playerId === mvpPlayerId" variant="volt">MVP of the night</TapeChip>
          </p>
          <p class="mt-0.5 font-mono text-xs tabular-nums text-ink-muted">
            {{ Math.round(update.ratingBefore) }} → {{ Math.round(update.ratingAfter) }}
          </p>
        </div>
        <span class="flex h-8 w-16 items-center justify-end text-xl" :class="deltaClasses(update.delta)">
          <CountUpNumber :value="update.delta" :decimals="1" signed />
        </span>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-col gap-2">
        <AppButton variant="broadcast" block @click="router.push(`/groups/${groupId}/rankings`)">
          View ladder
        </AppButton>
        <AppButton variant="secondary" block @click="router.push(`/groups/${groupId}`)">
          Back to club
        </AppButton>
      </div>
    </template>
  </Sheet>
</template>

<!-- Tiny keyframe Tailwind can't express: staggered row entrance. -->
<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .reveal-row {
    opacity: 0;
    animation: reveal-row-in 0.35s var(--ease-out) forwards;
    animation-delay: var(--reveal-delay, 0ms);
  }
  @keyframes reveal-row-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
}
</style>
