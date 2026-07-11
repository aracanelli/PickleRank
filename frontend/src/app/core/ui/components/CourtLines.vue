<script setup lang="ts">
// Faint pickleball-court diagram (perimeter + kitchen + center line) used as
// a background motif on hero cards and the scoreboard. Position via wrapper.
withDefaults(
  defineProps<{
    /** Which crop of the court to show. */
    crop?: 'full' | 'corner' | 'half'
  }>(),
  { crop: 'corner' }
)
</script>

<template>
  <svg
    v-if="crop === 'full'"
    class="pointer-events-none select-none text-line-strong opacity-35"
    viewBox="0 0 220 100"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    aria-hidden="true"
  >
    <rect x="10" y="8" width="200" height="84" rx="2" />
    <line x1="110" y1="8" x2="110" y2="92" />
    <line x1="76" y1="8" x2="76" y2="92" stroke-width="2.5" />
    <line x1="144" y1="8" x2="144" y2="92" stroke-width="2.5" />
    <line x1="10" y1="50" x2="76" y2="50" />
    <line x1="144" y1="50" x2="210" y2="50" />
  </svg>
  <svg
    v-else-if="crop === 'half'"
    class="pointer-events-none select-none text-line-strong opacity-35"
    viewBox="0 0 110 100"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    aria-hidden="true"
  >
    <path d="M10 8 H110 M10 92 H110 M10 8 V92" />
    <line x1="76" y1="8" x2="76" y2="92" stroke-width="2.5" />
    <line x1="10" y1="50" x2="76" y2="50" />
  </svg>
  <svg
    v-else
    class="pointer-events-none select-none text-line-strong opacity-35"
    viewBox="0 0 120 80"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    aria-hidden="true"
  >
    <path d="M8 80 V10 H120" />
    <line x1="8" y1="44" x2="80" y2="44" />
    <line x1="80" y1="10" x2="80" y2="80" stroke-width="2.5" />
  </svg>
</template>
