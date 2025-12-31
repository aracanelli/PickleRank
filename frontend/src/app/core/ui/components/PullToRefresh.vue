<script setup lang="ts">
import { ref } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'

const props = defineProps<{
  onRefresh: () => Promise<void>
}>()

const isPulling = ref(false)
const isRefreshing = ref(false)
const pullDistance = ref(0)
const threshold = 80 // pixels to trigger refresh
const activationThreshold = 20 // minimum pull before activating gesture

let startY = 0
let currentY = 0
let isActivePull = false // True once we've confirmed this is a deliberate pull
let lastMoveTime = 0
let lastMoveY = 0

function onTouchStart(e: TouchEvent) {
  // Only enable if at top of scroll
  const container = e.currentTarget as HTMLElement
  if (container.scrollTop > 0) return
  
  // Don't allow refresh if already refreshing
  if (isRefreshing.value) return
  
  startY = e.touches[0].clientY
  lastMoveY = startY
  lastMoveTime = Date.now()
  isPulling.value = true
  isActivePull = false // Reset - not yet confirmed as intentional pull
}

function onTouchMove(e: TouchEvent) {
  if (!isPulling.value || isRefreshing.value) return
  
  const now = Date.now()
  currentY = e.touches[0].clientY
  const diff = currentY - startY
  
  // Check velocity - if scrolling too fast, it's likely a scroll not a pull
  const timeDelta = now - lastMoveTime
  const moveDelta = currentY - lastMoveY
  const velocity = timeDelta > 0 ? Math.abs(moveDelta / timeDelta) : 0
  
  lastMoveTime = now
  lastMoveY = currentY
  
  // Only activate as a pull gesture if:
  // 1. Moving downward (diff > 0)
  // 2. Not moving too fast (velocity < 2 pixels/ms threshold)
  // 3. Either already active OR reached activation threshold
  if (diff > 0) {
    if (!isActivePull && diff >= activationThreshold && velocity < 2) {
      isActivePull = true
    }
    
    if (isActivePull) {
      // Dampen the pull (resistance effect)
      pullDistance.value = Math.min(diff * 0.5, threshold * 1.5)
    }
  } else {
    // If user scrolls up, cancel the pull gesture
    isActivePull = false
    pullDistance.value = 0
  }
}

async function onTouchEnd() {
  if (!isPulling.value || isRefreshing.value) return
  
  // Only trigger refresh if it was an active, intentional pull
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
    class="pull-to-refresh-container"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Pull Indicator -->
    <div 
      class="pull-indicator" 
      :class="{ visible: isPulling && pullDistance > 10 || isRefreshing }"
      :style="{ transform: `translateY(${Math.min(pullDistance, threshold)}px)` }"
    >
      <LoadingSpinner v-if="isRefreshing" size="sm" />
      <template v-else>
        <span v-if="pullDistance >= threshold" class="release-text">↑ Release to refresh</span>
        <span v-else class="pull-text">↓ Pull to refresh</span>
      </template>
    </div>
    
    <!-- Content -->
    <div 
      class="pull-content"
      :style="{ transform: isPulling || isRefreshing ? `translateY(${Math.min(pullDistance, threshold)}px)` : 'none' }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.pull-to-refresh-container {
  position: relative;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.pull-indicator {
  position: absolute;
  top: -50px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50px;
  opacity: 0;
  transition: opacity 0.2s ease;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.pull-indicator.visible {
  opacity: 1;
}

.pull-text,
.release-text {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.release-text {
  color: var(--color-primary);
  font-weight: 500;
}

.pull-content {
  transition: transform 0.2s ease;
}

.pull-content.pulling {
  transition: none;
}
</style>
