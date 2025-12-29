<script setup lang="ts">
defineProps<{
  icon?: any
  title: string
  description?: string
}>()
</script>

<template>
  <div class="empty-state">
    <div v-if="icon" class="icon">
      <component :is="icon" v-if="typeof icon !== 'string'" />
      <span v-else>{{ icon }}</span>
    </div>
    <h3 class="title">{{ title }}</h3>
    <p v-if="description" class="description">{{ description }}</p>
    <div v-if="$slots.action" class="action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--spacing-2xl);
  min-height: 300px;
}

.icon {
  font-size: 4rem;
  margin-bottom: var(--spacing-lg);
  opacity: 0.5;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.description {
  color: var(--color-text-secondary);
  max-width: 400px;
  margin-bottom: var(--spacing-lg);
}

.action {
  margin-top: var(--spacing-md);
}
</style>







