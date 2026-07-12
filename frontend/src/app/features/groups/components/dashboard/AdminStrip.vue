<script setup lang="ts">
import { Users, Settings, DollarSign, Upload, Trophy } from 'lucide-vue-next'
import { formatCurrency } from '@/app/features/payments/components/currency'

// Quiet organizer toolbar — pills, not cards, so it never competes with the
// scoreboard content above it.
defineProps<{
  groupId: string
  trackPayments: boolean
  /** Outstanding sub balance total; null when unknown (fetch failed/skipped). */
  totalOwed: number | null
  currency: string
}>()

const emit = defineEmits<{ import: [] }>()

const pillClass =
  'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-3'
</script>

<template>
  <section class="flex flex-col gap-2">
    <h2 class="eyebrow text-ink-faint">Organizer</h2>
    <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
      <RouterLink :to="`/groups/${groupId}/players/manage`" :class="pillClass">
        <Users class="size-4 text-ink-muted" aria-hidden="true" />
        Manage players
      </RouterLink>
      <RouterLink :to="`/groups/${groupId}/settings`" :class="pillClass">
        <Settings class="size-4 text-ink-muted" aria-hidden="true" />
        Settings
      </RouterLink>
      <RouterLink v-if="trackPayments" :to="`/groups/${groupId}/payments`" :class="pillClass">
        <DollarSign class="size-4 text-ink-muted" aria-hidden="true" />
        Payments
        <span
          v-if="totalOwed !== null && totalOwed > 0"
          class="numeral rounded-full bg-accent-fill px-1.5 py-0.5 text-xs text-accent-contrast"
        >
          {{ formatCurrency(totalOwed, currency) }}
        </span>
      </RouterLink>
      <RouterLink :to="`/groups/${groupId}/awards`" :class="pillClass">
        <Trophy class="size-4 text-ink-muted" aria-hidden="true" />
        Awards
      </RouterLink>
      <button type="button" :class="pillClass" @click="emit('import')">
        <Upload class="size-4 text-ink-muted" aria-hidden="true" />
        Import history
      </button>
    </div>
  </section>
</template>
