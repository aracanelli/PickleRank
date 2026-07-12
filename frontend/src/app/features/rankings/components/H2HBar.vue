<script setup lang="ts">
// Center-out "tale of the tape" row: label eyebrow in the middle, P1's value
// left / P2's value right, two bars growing outward from the center.
withDefaults(
  defineProps<{
    label: string
    left: string
    right: string
    /** 0–100 fill for each side, drawn from the center outward. */
    leftPct?: number
    rightPct?: number
  }>(),
  { leftPct: 0, rightPct: 0 }
)

function clamp(pct: number): string {
  return `${Math.min(100, Math.max(0, pct))}%`
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-baseline justify-between gap-2">
      <span class="min-w-0 flex-1 truncate numeral text-xl text-ink">{{ left }}</span>
      <span class="shrink-0 text-center eyebrow text-ink-faint">{{ label }}</span>
      <span class="min-w-0 flex-1 truncate text-right numeral text-xl text-ink">{{ right }}</span>
    </div>
    <div class="flex items-center gap-1" aria-hidden="true">
      <!-- P1: grows leftward from center -->
      <div class="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-surface-2">
        <div
          class="h-full rounded-full bg-accent-fill transition-[width] duration-[var(--dur-slow)] motion-reduce:transition-none"
          :style="{ width: clamp(leftPct) }"
        />
      </div>
      <!-- P2: grows rightward from center -->
      <div class="flex h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          class="h-full rounded-full bg-info transition-[width] duration-[var(--dur-slow)] motion-reduce:transition-none"
          :style="{ width: clamp(rightPct) }"
        />
      </div>
    </div>
  </div>
</template>
