<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
  clickable?: boolean
}>()
</script>

<template>
  <div class="card" :class="{ clickable }">
    <div v-if="title || $slots.header" class="card-header">
      <div v-if="title" class="card-title">
        <h3>{{ title }}</h3>
        <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
      </div>
      <slot name="header" />
    </div>
    <div class="card-body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition-fast);
}

.card.clickable {
  cursor: pointer;
}

.card.clickable:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md), 0 0 20px rgba(16, 185, 129, 0.1);
  transform: translateY(-2px);
}

/* Active/press state for touch feedback */
.card.clickable:active {
  transform: translateY(0) scale(0.98);
  box-shadow: var(--shadow-sm);
  transition: transform 0.1s ease-out;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.card-title h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.card-title .subtitle {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
}

.card-body {
  padding: var(--spacing-lg);
}

.card-footer {
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
}

/* Mobile touch enhancements */
@media (pointer: coarse) {
  .card.clickable:active {
    transform: scale(0.97);
    transition: transform 0.1s ease-out;
  }
}
</style>







