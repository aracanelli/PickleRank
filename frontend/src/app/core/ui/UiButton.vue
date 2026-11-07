<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'optic'
  size?: 'md' | 'lg'
  block?: boolean
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  to?: RouteLocationRaw
}>(), { variant: 'secondary', size: 'md', type: 'button' })

const classes = computed(() => ['btn', `btn--${props.variant}`, `btn--${props.size}`, { 'btn--block': props.block, 'is-loading': props.loading }])
</script>

<template>
  <RouterLink v-if="to && !disabled" :to="to" :class="classes"><slot /></RouterLink>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="btn__spin" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  min-height: var(--tap);
  min-width: var(--tap);
  padding: 0 var(--s4);
  border-radius: var(--r-control);
  border: 2px solid transparent;
  font-weight: 700;
  font-size: var(--text-md);
  line-height: 1.1;
  text-decoration: none;
  text-align: center;
  transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease);
  touch-action: manipulation;
  user-select: none;
}
.btn--lg { min-height: var(--tap-lg); font-size: var(--text-md); padding: 0 var(--s5); }
.btn--block { display: flex; width: 100%; }

.btn--primary { background: var(--court); color: var(--on-court); }
.btn--primary:hover:not(:disabled) { background: var(--court-press); }
.btn--optic { background: var(--optic); color: var(--on-optic); }
.btn--secondary { background: var(--surface); color: var(--ink); border-color: var(--line-strong); }
.btn--secondary:hover:not(:disabled) { background: var(--surface-sunk); }
.btn--quiet { background: transparent; color: var(--court); padding: 0 var(--s2); }
.btn--quiet:hover:not(:disabled) { background: var(--court-tint); }
.btn--danger { background: var(--surface); color: var(--bad); border-color: var(--bad); }

.btn:disabled { opacity: 1; background: var(--surface-sunk); color: var(--ink-2); border-color: var(--line); }
.btn--quiet:disabled { background: transparent; }

.btn__spin {
  width: 1em; height: 1em;
  border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
