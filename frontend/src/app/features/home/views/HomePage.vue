<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { useAuthStore } from '@/stores/auth'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import TapeChip from '@/app/core/ui/components/TapeChip.vue'
import LiveDot from '@/app/core/ui/components/LiveDot.vue'
import CourtLines from '@/app/core/ui/components/CourtLines.vue'
import { Target, ChartBar, Zap, Activity } from 'lucide-vue-next'

const authStore = useAuthStore()
const isLoggedIn = computed(() => authStore.isAuthenticated)

const features = [
  {
    icon: markRaw(Target),
    title: 'Smart matchmaking',
    description: 'Fair 2v2 matchups with teammate and opponent constraints, balanced by rating.'
  },
  {
    icon: markRaw(ChartBar),
    title: 'Elo ratings',
    description: 'Track player skill with Serious Elo, RACS, or the underdog-friendly Catch-Up mode.'
  },
  {
    icon: markRaw(Zap),
    title: 'Live scoring',
    description: 'Enter scores courtside and watch the ladder update the moment a game ends.'
  }
]
</script>

<template>
  <div class="min-h-dvh bg-surface-page">
    <!-- Top bar -->
    <header class="pt-safe">
      <div class="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 md:px-6">
        <span class="display-wide flex items-center gap-2 text-lg text-ink">
          <Activity class="size-5 text-accent-text" aria-hidden="true" />
          PickleRank
        </span>
        <RouterLink
          v-if="!isLoggedIn"
          to="/login"
          class="text-sm font-semibold text-accent-text transition-colors hover:text-brand-strong"
        >
          Sign in
        </RouterLink>
      </div>
      <div class="mx-auto w-full max-w-5xl px-4 md:px-6">
        <div class="kitchen-line" />
      </div>
    </header>

    <!-- Hero -->
    <section class="mx-auto w-full max-w-5xl px-4 pb-14 pt-10 text-center md:px-6 md:pt-16">
      <p class="eyebrow text-ink-faint">Your league · Broadcast-grade</p>
      <h1 class="display-wide mx-auto mt-4 max-w-3xl text-4xl leading-[1.05] text-ink md:text-6xl">
        Fair Matchups.
        <span class="text-accent-text">Real Rankings.</span>
      </h1>
      <p class="mx-auto mt-5 max-w-xl text-base text-ink-muted md:text-lg">
        Generate balanced 2v2 pickleball games, track ratings with Elo, and see who really
        dominates your league — every game night, scored like it's on TV.
      </p>
      <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <RouterLink v-if="isLoggedIn" to="/groups" class="w-full sm:w-auto">
          <AppButton variant="broadcast" block>Go to dashboard</AppButton>
        </RouterLink>
        <template v-else>
          <RouterLink to="/signup" class="w-full sm:w-auto">
            <AppButton variant="broadcast" block>Get started free</AppButton>
          </RouterLink>
          <RouterLink to="/login" class="w-full sm:w-auto">
            <AppButton variant="secondary" block>Sign in</AppButton>
          </RouterLink>
        </template>
      </div>

      <!-- Pure-CSS scoreboard mock -->
      <div
        class="relative mx-auto mt-12 w-full max-w-md overflow-hidden rounded-[20px] ticket-clip stadium-glow border border-line bg-surface-court p-5 text-left"
        aria-hidden="true"
      >
        <CourtLines crop="corner" class="absolute -right-3 -top-4 h-32 w-auto" />
        <div class="relative flex items-center justify-between">
          <span class="eyebrow text-ink-faint">Thursday Night Ladder</span>
          <TapeChip variant="live"><LiveDot /> Live</TapeChip>
        </div>
        <div class="relative mt-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <span class="min-w-0 truncate text-base font-semibold text-ink">Maya &amp; Deshawn</span>
            <span class="flex h-12 w-14 shrink-0 -skew-x-6 items-center justify-center rounded-[8px] bg-accent-fill">
              <span class="numeral skew-x-6 text-3xl leading-none text-accent-contrast">11</span>
            </span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="min-w-0 truncate text-base font-semibold text-ink-muted">Priya &amp; Marcus</span>
            <span class="flex h-12 w-14 shrink-0 -skew-x-6 items-center justify-center rounded-[8px] bg-surface-2">
              <span class="numeral skew-x-6 text-3xl leading-none text-ink">7</span>
            </span>
          </div>
        </div>
        <p class="relative mt-4 font-mono text-xs tabular-nums text-ink-faint">
          COURT 1 · ROUND 3 · GAME TO 11
        </p>
      </div>
    </section>

    <!-- Features -->
    <section class="border-t border-line bg-surface-1 py-14">
      <div class="mx-auto w-full max-w-5xl px-4 md:px-6">
        <p class="eyebrow text-center text-ink-faint">The full broadcast package</p>
        <h2 class="display-wide mt-2 text-center text-2xl text-ink md:text-3xl">
          Everything you need to run your league
        </h2>
        <div class="mt-8 grid gap-4 sm:grid-cols-3">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface-page p-5"
          >
            <div class="flex size-11 items-center justify-center rounded-[14px] bg-accent-soft text-accent-text">
              <component :is="feature.icon" class="size-6" aria-hidden="true" />
            </div>
            <h3 class="font-semibold text-ink">{{ feature.title }}</h3>
            <p class="text-sm text-ink-muted">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-14 text-center">
      <div class="mx-auto w-full max-w-xl px-4">
        <p class="eyebrow text-ink-faint">Free to start</p>
        <h2 class="display-wide mt-2 text-2xl text-ink md:text-3xl">
          Ready to elevate your game nights?
        </h2>
        <p class="mt-3 text-ink-muted">Start tracking your club's rankings today.</p>
        <RouterLink :to="isLoggedIn ? '/groups' : '/signup'" class="mt-6 inline-block">
          <AppButton variant="broadcast">{{ isLoggedIn ? 'Go to dashboard' : 'Get started' }}</AppButton>
        </RouterLink>
      </div>
    </section>

    <footer class="border-t border-line py-8 pb-safe text-center">
      <p class="eyebrow text-ink-faint">
        &copy; {{ new Date().getFullYear() }} PickleRank · Courtside
      </p>
    </footer>
  </div>
</template>
