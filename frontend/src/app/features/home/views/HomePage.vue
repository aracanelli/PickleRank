<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { useAuthStore } from '@/stores/auth'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import { Target, ChartBar, Trophy, Zap, Activity } from 'lucide-vue-next'

const authStore = useAuthStore()
const isLoggedIn = computed(() => authStore.isAuthenticated)

const features = [
  {
    icon: markRaw(Target),
    title: 'Smart Matchmaking',
    description: 'Generate fair 2v2 matchups with teammate and opponent constraints'
  },
  {
    icon: markRaw(ChartBar),
    title: 'ELO Ratings',
    description: 'Track player skill with Serious ELO or fun Catch-Up mode'
  },
  {
    icon: markRaw(Trophy),
    title: 'Live Rankings',
    description: 'See real-time standings, win rates, and match history'
  },
  {
    icon: markRaw(Zap),
    title: 'Quick Scoring',
    description: 'Enter scores on the go and complete events in seconds'
  }
]
</script>

<template>
  <div class="min-h-dvh bg-surface-page">
    <!-- Top bar -->
    <header class="pt-safe">
      <div class="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 md:px-6">
        <span class="flex items-center gap-2 text-lg font-bold text-ink">
          <Activity class="size-5 text-brand" aria-hidden="true" />
          PickleRank
        </span>
        <RouterLink v-if="!isLoggedIn" to="/login" class="text-sm font-semibold text-brand hover:text-brand-strong">
          Sign in
        </RouterLink>
      </div>
    </header>

    <!-- Hero -->
    <section class="mx-auto w-full max-w-5xl px-4 pb-14 pt-10 text-center md:px-6 md:pt-20">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
        <Activity class="size-3.5" aria-hidden="true" />
        For pickleball enthusiasts
      </span>
      <h1 class="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight text-ink md:text-6xl">
        Fair matchups,
        <span class="text-brand">real rankings</span>
      </h1>
      <p class="mx-auto mt-4 max-w-xl text-base text-ink-muted md:text-lg">
        Generate balanced 2v2 pickleball games, track ratings with ELO, and see who really dominates your league.
      </p>
      <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <RouterLink v-if="isLoggedIn" to="/groups" class="w-full sm:w-auto">
          <AppButton block>Go to dashboard</AppButton>
        </RouterLink>
        <template v-else>
          <RouterLink to="/signup" class="w-full sm:w-auto">
            <AppButton block>Get started free</AppButton>
          </RouterLink>
          <RouterLink to="/login" class="w-full sm:w-auto">
            <AppButton variant="secondary" block>Sign in</AppButton>
          </RouterLink>
        </template>
      </div>
    </section>

    <!-- Features -->
    <section class="border-t border-line bg-surface-1 py-14">
      <div class="mx-auto w-full max-w-5xl px-4 md:px-6">
        <h2 class="text-center text-2xl font-bold text-ink md:text-3xl">
          Everything you need to run your league
        </h2>
        <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-page p-5"
          >
            <div class="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
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
        <h2 class="text-2xl font-bold text-ink md:text-3xl">Ready to elevate your game nights?</h2>
        <p class="mt-2 text-ink-muted">Start tracking your group's rankings today. It's free!</p>
        <RouterLink :to="isLoggedIn ? '/groups' : '/signup'" class="mt-6 inline-block">
          <AppButton>{{ isLoggedIn ? 'Go to dashboard' : 'Get started' }}</AppButton>
        </RouterLink>
      </div>
    </section>

    <footer class="border-t border-line py-8 pb-safe text-center text-sm text-ink-faint">
      &copy; {{ new Date().getFullYear() }} PickleRank. Built for pickleball enthusiasts.
    </footer>
  </div>
</template>
