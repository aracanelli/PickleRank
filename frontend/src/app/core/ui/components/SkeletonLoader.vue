<script setup lang="ts">
defineProps<{
  rows?: number
  showAvatar?: boolean
}>()
</script>

<template>
  <div class="skeleton-container" role="status" aria-busy="true" aria-label="Loading content">
    <div 
      v-for="i in (rows || 3)" 
      :key="i" 
      class="skeleton-row"
      aria-hidden="true"
    >
      <div v-if="showAvatar !== false" class="skeleton-avatar"></div>
      <div class="skeleton-content">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-value"></div>
    </div>
  </div></template>

<style scoped>
.skeleton-container {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  background: linear-gradient(
    90deg,
    var(--color-bg-tertiary) 0%,
    var(--color-bg-hover) 20%,
    var(--color-bg-tertiary) 40%,
    var(--color-bg-tertiary) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

.skeleton-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.skeleton-line {
  height: 14px;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--color-bg-tertiary) 0%,
    var(--color-bg-hover) 20%,
    var(--color-bg-tertiary) 40%,
    var(--color-bg-tertiary) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

.skeleton-line.short {
  width: 60%;
  animation-delay: 0.1s;
}

.skeleton-value {
  width: 50px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--color-bg-tertiary) 0%,
    var(--color-bg-hover) 20%,
    var(--color-bg-tertiary) 40%,
    var(--color-bg-tertiary) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  animation-delay: 0.2s;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
