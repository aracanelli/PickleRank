<script setup lang="ts">
import { ref } from 'vue'
import {
  ClipboardList,
  Users,
  CalendarPlus,
  Shuffle,
  Zap,
  Trophy,
  Home,
  History,
  User,
  Link2,
  ArrowDown,
  Swords,
  Smartphone,
  Settings,
  Wallet,
  Pencil
} from 'lucide-vue-next'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'

// Static how-to guide, openable from My Clubs and the Account sheet.
const open = defineModel<boolean>({ required: true })

const audience = ref<'organizers' | 'players'>('organizers')
const audienceOptions = [
  { label: 'Organizers', value: 'organizers' },
  { label: 'Players', value: 'players' }
]

const organizerSteps = [
  {
    icon: ClipboardList,
    title: 'Create a club',
    text: 'A club is your league — its players, events, and ladder all live inside it.'
  },
  {
    icon: Users,
    title: 'Add your players',
    text: 'Open Manage players from the club dashboard. Share a player’s invite link so they can sign in and follow their own stats.'
  },
  {
    icon: CalendarPlus,
    title: 'Schedule an event',
    text: 'Tap New event, pick courts and rounds, then select exactly courts × 4 players.'
  },
  {
    icon: Shuffle,
    title: 'Generate matchups',
    text: 'PickleRank builds fair 2v2 games — balanced teams, no repeat partners. Not happy? Regenerate.'
  },
  {
    icon: Zap,
    title: 'Score it live',
    text: 'Hit Enter Scoreboard on game night. Swipe between rounds and tap a court to punch in scores — they save automatically.'
  },
  {
    icon: Trophy,
    title: 'Complete the event',
    text: 'Once every game has a score, complete the event. Ratings update instantly and the ladder reshuffles.'
  }
]

const organizerExtras = [
  { icon: Settings, text: 'Rating systems and matchmaking rules live in the club Settings.' },
  { icon: Wallet, text: 'Track sub fees in Payments (enable it in Settings first).' },
  { icon: Pencil, text: 'Fix a past score from the Feed — ratings recalculate for you.' }
]

const playerTabs = [
  { icon: Home, title: 'Club', text: 'The dashboard: live or upcoming event, podium, and recent results.' },
  { icon: Trophy, title: 'Ladder', text: 'Full rankings with rating changes after every event.' },
  { icon: History, title: 'Feed', text: 'Every result, filterable — plus head-to-head comparisons.' },
  { icon: User, title: 'Me', text: 'Your player card: form, rating history, rivals and teammates.' }
]

const playerTips = [
  {
    icon: Link2,
    text: 'Got an invite link from your organizer? Open it and sign in — that connects your account to your player.'
  },
  { icon: Swords, text: 'Tap Compare on any player card to see a head-to-head tale of the tape.' },
  { icon: ArrowDown, text: 'Pull down on any page to refresh the latest scores.' },
  { icon: Smartphone, text: 'Add PickleRank to your home screen — it installs like an app.' }
]
</script>

<template>
  <Sheet v-model="open" title="How PickleRank works" size="lg">
    <div class="flex flex-col gap-5 pb-2">
      <SegmentedControl v-model="audience" :options="audienceOptions" />

      <!-- Organizers -->
      <template v-if="audience === 'organizers'">
        <ol class="flex flex-col gap-3">
          <li
            v-for="(step, i) in organizerSteps"
            :key="step.title"
            class="flex items-start gap-3 rounded-[14px] border border-line bg-surface-2 p-3.5"
          >
            <span
              class="numeral flex size-8 shrink-0 -skew-x-6 items-center justify-center rounded-[8px] bg-accent-fill text-base text-accent-contrast"
            >
              <span class="skew-x-6">{{ i + 1 }}</span>
            </span>
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <component :is="step.icon" class="size-4 shrink-0 text-accent-text" aria-hidden="true" />
                {{ step.title }}
              </span>
              <span class="text-sm text-ink-muted">{{ step.text }}</span>
            </span>
          </li>
        </ol>

        <div class="flex flex-col gap-2">
          <h3 class="eyebrow text-ink-faint">Good to know</h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="extra in organizerExtras"
              :key="extra.text"
              class="flex items-start gap-2.5 text-sm text-ink-muted"
            >
              <component :is="extra.icon" class="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              {{ extra.text }}
            </li>
          </ul>
        </div>
      </template>

      <!-- Players -->
      <template v-else>
        <div class="flex flex-col gap-2">
          <h3 class="eyebrow text-ink-faint">Finding your way around</h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="tab in playerTabs"
              :key="tab.title"
              class="flex items-start gap-3 rounded-[14px] border border-line bg-surface-2 p-3.5"
            >
              <span class="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-accent-text">
                <component :is="tab.icon" class="size-4" aria-hidden="true" />
              </span>
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="text-sm font-semibold text-ink">{{ tab.title }}</span>
                <span class="text-sm text-ink-muted">{{ tab.text }}</span>
              </span>
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="eyebrow text-ink-faint">Tips</h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="tip in playerTips"
              :key="tip.text"
              class="flex items-start gap-2.5 text-sm text-ink-muted"
            >
              <component :is="tip.icon" class="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              {{ tip.text }}
            </li>
          </ul>
        </div>
      </template>
    </div>
  </Sheet>
</template>
