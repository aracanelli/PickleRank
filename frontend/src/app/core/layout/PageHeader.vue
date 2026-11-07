<script setup lang="ts">
/**
 * Top of every screen: optional back link, the screen title, and optional trailing actions.
 * The back link names where it goes ("Spring ladder"), never just "Back".
 */
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { ChevronLeft } from 'lucide-vue-next'

defineProps<{ title: string; backTo?: RouteLocationRaw; backLabel?: string; subtitle?: string }>()
</script>

<template>
  <header class="ph">
    <div class="ph__bar">
      <RouterLink v-if="backTo" :to="backTo" class="ph__back">
        <ChevronLeft :size="22" aria-hidden="true" />
        <span class="truncate">{{ backLabel || 'Back' }}</span>
      </RouterLink>
      <span v-else class="ph__spacer" />
      <div v-if="$slots.actions" class="ph__actions"><slot name="actions" /></div>
    </div>
    <slot name="title">
      <h1 class="ph__title">{{ title }}</h1>
    </slot>
    <p v-if="subtitle" class="ph__sub muted">{{ subtitle }}</p>
    <slot />
  </header>
</template>

<style scoped>
.ph { display: flex; flex-direction: column; gap: var(--s1); padding-top: var(--safe-top); }
.ph__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s2);
  min-height: var(--tap);
  margin-left: calc(var(--s2) * -1);
}
.ph__back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: var(--tap);
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 var(--s2) 0 0;
  color: var(--court);
  font-weight: 700;
  text-decoration: none;
}
.ph__spacer { flex: 1; }
.ph__actions { display: flex; align-items: center; gap: var(--s1); margin-left: auto; flex: none; }
.ph__title { overflow-wrap: anywhere; }
.ph__sub { font-size: var(--text-sm); }
</style>
