<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'

const props = defineProps<{
  onRefresh: () => Promise<void>
}>()

const containerRef = ref<HTMLElement | null>(null)
const isPulling = ref(false)
const isRefreshing = ref(false)
const pullDistance = ref(0)
const threshold = 80 // pixels to trigger refresh

let startY = 0
let currentY = 0
let isActivePull = false // Track if we've started an active pull gesture

// Feature detect passive event listener support
function getSupportsPassive() {
  if (typeof window === 'undefined') return false

  let supports = false
  try {
    const opts = Object.defineProperty({}, 'passive', {
      get() {
        supports = true
        return true
      }
    })
    window.addEventListener('testPassive', null as unknown as EventListener, opts)
    window.removeEventListener('testPassive', null as unknown as EventListener, opts)
  } catch (e) {
    // Passive not supported
  }
  return supports
}

function onTouchStart(e: TouchEvent) {
  const container = containerRef.value
  if (!container) return
  
  // Only enable if at top of scroll
  if (container.scrollTop > 0) {
    isActivePull = false
    return
  }
  
  startY = e.touches[0].clientY
  isPulling.value = true
  isActivePull = false // Will be set to true if we detect a valid downward pull
}

function onTouchMove(e: TouchEvent) {
  if (!isPulling.value || isRefreshing.value) return
  
  const container = containerRef.value
  if (!container) return
  
  currentY = e.touches[0].clientY
  const diff = currentY - startY
  
  // Only activate pull-to-refresh when:
  // 1. Scroll is at the top (scrollTop === 0)
  // 2. User is pulling downward (diff > 0)
  if (container.scrollTop === 0 && diff > 0) {
    isActivePull = true
    // Prevent default only during an active pull-to-refresh gesture
    // This prevents the native browser pull-to-refresh from conflicting
    e.preventDefault()
    
    // Dampen the pull (resistance effect)
    pullDistance.value = Math.min(diff * 0.5, threshold * 1.5)
  } else if (diff <= 0) {
    // User is scrolling up, reset pull state
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
      // Reset all state after refresh completes (or fails)
      // This keeps the visual state pulled during the entire refresh operation
      isRefreshing.value = false
      isPulling.value = false
      isActivePull = false
      pullDistance.value = 0
      startY = 0
      currentY = 0
    }
  } else {
    // No refresh triggered, reset state immediately
    isPulling.value = false
    isActivePull = false
    pullDistance.value = 0
    startY = 0
    currentY = 0
  }
}

// Dynamically add event listeners with proper passive handling
onMounted(() => {
  const supportsPassive = getSupportsPassive()
  const container = containerRef.value
  if (!container) return
  
  // Use passive for touchstart (we don't need to prevent default there)
  const passiveOption = supportsPassive ? { passive: true } : false
  // Use non-passive for touchmove so we can conditionally call preventDefault
  const nonPassiveOption = supportsPassive ? { passive: false } : false
  
  container.addEventListener('touchstart', onTouchStart, passiveOption as AddEventListenerOptions)
  container.addEventListener('touchmove', onTouchMove, nonPassiveOption as AddEventListenerOptions)
  container.addEventListener('touchend', onTouchEnd, passiveOption as AddEventListenerOptions)
})

onUnmounted(() => {
  const container = containerRef.value
  if (!container) return
  
  container.removeEventListener('touchstart', onTouchStart)
  container.removeEventListener('touchmove', onTouchMove)
  container.removeEventListener('touchend', onTouchEnd)
})
</script>

<template>
  <div 
    ref="containerRef"
    class="pull-to-refresh-container"
  >
    <!-- Pull Indicator -->
    <div 
      class="pull-indicator" 
      :class="{ visible: isPulling && pullDistance > 10 || isRefreshing }"
    >
      <LoadingSpinner v-if="isRefreshing" />
      <template v-else>
        <span v-if="pullDistance >= threshold" class="release-text">↑ Release to refresh</span>
        <span v-else class="pull-text">↓ Pull to refresh</span>
      </template>
    </div>
    
    <!-- Content -->
    <div 
      class="pull-content"
      :class="{ pulling: isPulling && !isRefreshing }"
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
