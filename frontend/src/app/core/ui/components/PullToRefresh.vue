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

let startY = 0
let currentY = 0

function onTouchStart(e: TouchEvent) {
  // Only enable if at top of scroll
  const container = e.currentTarget as HTMLElement
  if (container.scrollTop > 0) return
  
  startY = e.touches[0].clientY
  isPulling.value = true
}

function onTouchMove(e: TouchEvent) {
  if (!isPulling.value || isRefreshing.value) return
  
  currentY = e.touches[0].clientY
  const diff = currentY - startY
  
  if (diff > 0) {
    // Dampen the pull (resistance effect)
    pullDistance.value = Math.min(diff * 0.5, threshold * 1.5)
  }
}

async function onTouchEnd() {
  if (!isPulling.value || isRefreshing.value) return
  
  if (pullDistance.value >= threshold) {
    isRefreshing.value = true
    try {
      await props.onRefresh()
    } finally {
      isRefreshing.value = false
    }
  }
  
  isPulling.value = false
  pullDistance.value = 0
  startY = 0
  currentY = 0
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
