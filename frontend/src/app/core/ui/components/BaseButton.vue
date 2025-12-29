<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button
    class="btn"
    :class="[
      `btn-${variant || 'primary'}`,
      `btn-${size || 'md'}`,
      { loading, disabled }
    ]"
    :disabled="disabled || loading"
    :type="type || 'button'"
  >
    <span v-if="loading" class="spinner"></span>
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  font-weight: 500;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Active/press state for touch feedback */
.btn:active:not(:disabled) {
  transform: scale(0.97);
}

/* Sizes */
.btn-sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.875rem;
}

.btn-md {
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: 1rem;
}

.btn-lg {
  padding: var(--spacing-md) var(--spacing-xl);
  font-size: 1.125rem;
}

/* Variants */
.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-glow);
}

.btn-primary:active:not(:disabled) {
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3);
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-light);
}

.btn-secondary:active:not(:disabled) {
  background: var(--color-bg-secondary);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.btn-danger {
  background: var(--color-error);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
}

/* Loading */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Mobile touch enhancements */
@media (pointer: coarse) {
  .btn {
    min-height: 44px;
  }
  
  .btn:active:not(:disabled) {
    transform: scale(0.95);
    transition: transform 0.1s ease-out;
  }
}
</style>







