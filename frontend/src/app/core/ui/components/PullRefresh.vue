<script setup lang="ts">
import { ref } from 'vue'
import { Loader2, ArrowDown } from 'lucide-vue-next'

// Touch gesture logic ported from the legacy PullToRefresh component.
// Handlers should invalidate the API cache before refetching, otherwise
// the pull just re-serves cached data.
const props = defineProps<{
  onRefresh: () => Promise<void>
}>()

const isPulling = ref(false)
const isRefreshing = ref(false)
const pullDistance = ref(0)
const threshold = 80
const activationThreshold = 20

let startY = 0
let currentY = 0
let isActivePull = false
let lastMoveTime = 0
let lastMoveY = 0

function onTouchStart(e: TouchEvent) {
  if (window.scrollY > 0 || isRefreshing.value) return
  startY = e.touches[0].clientY
  lastMoveY = startY
  lastMoveTime = Date.now()
  isPulling.value = true
  isActivePull = false
}

function onTouchMove(e: TouchEvent) {
  if (!isPulling.value || isRefreshing.value) return

  const now = Date.now()
  currentY = e.touches[0].clientY
  const diff = currentY - startY

  // Velocity check: a fast downward flick is a scroll, not a pull
  const timeDelta = now - lastMoveTime
  const moveDelta = currentY - lastMoveY
  const velocity = timeDelta > 0 ? Math.abs(moveDelta / timeDelta) : 0
  lastMoveTime = now
  lastMoveY = currentY

  if (diff > 0) {
    if (!isActivePull && diff >= activationThreshold && velocity < 2) {
      isActivePull = true
    }
    if (isActivePull) {
      // Dampened pull for resistance effect
      pullDistance.value = Math.min(diff * 0.5, threshold * 1.5)
    }
  } else {
    isActivePull = false
    pullDistance.value = 0
  }
}

async function onTouchEnd() {
  if (!isPulling.value || isRefreshing.value) return

  if (isActivePull && pullDistance.value >= threshold) {
    isRefreshing.value = true
    try {
      await props.onRefresh()
    } finally {
      isRefreshing.value = false
    }
  }

  isPulling.value = false
  isActivePull = false
  pullDistance.value = 0
  startY = 0
  currentY = 0
  lastMoveY = 0
  lastMoveTime = 0
}
</script>

<template>
  <div
    class="relative"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Pull indicator -->
    <div
      class="absolute -top-12 inset-x-0 flex h-12 items-center justify-center text-sm text-ink-faint transition-opacity"
      :class="(isPulling && pullDistance > 10) || isRefreshing ? 'opacity-100' : 'opacity-0'"
      :style="{ transform: `translateY(${Math.min(pullDistance, threshold)}px)` }"
    >
      <Loader2 v-if="isRefreshing" class="size-5 animate-spin text-accent-text" />
      <span v-else-if="pullDistance >= threshold" class="flex items-center gap-1 font-medium text-accent-text">
        Release to refresh
      </span>
      <span v-else class="flex items-center gap-1">
        <ArrowDown class="size-4" /> Pull to refresh
      </span>
    </div>

    <!-- Content -->
    <div
      :class="isPulling ? '' : 'transition-transform duration-200'"
      :style="{ transform: isPulling || isRefreshing ? `translateY(${Math.min(pullDistance, threshold)}px)` : 'none' }"
    >
      <slot />
    </div>
  </div>
</template>
