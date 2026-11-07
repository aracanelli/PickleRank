<script setup lang="ts">
/**
 * The screen's next action, pinned in the thumb zone.
 * Sits above the tab bar when tabs are shown, and above the keyboard when it is open.
 */
import { useKeyboardInset } from './useKeyboardInset'

withDefaults(defineProps<{ aboveTabs?: boolean }>(), { aboveTabs: false })
useKeyboardInset()
</script>

<template>
  <div class="actionbar" :class="{ 'actionbar--tabs': aboveTabs }">
    <div class="actionbar__inner">
      <p v-if="$slots.meta" class="actionbar__meta"><slot name="meta" /></p>
      <div class="actionbar__buttons"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.actionbar {
  position: sticky;
  bottom: calc(var(--safe-bottom) + var(--kb-inset, 0px));
  z-index: 15;
  margin: auto calc(var(--gutter) * -1) calc(var(--s6) * -1);
  padding: var(--s3) var(--gutter) calc(var(--s3) + var(--safe-bottom));
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.actionbar--tabs { bottom: calc(var(--tabbar-h) + var(--safe-bottom) + var(--kb-inset, 0px)); padding-bottom: var(--s3); }
.actionbar__inner { display: flex; flex-direction: column; gap: var(--s2); }
.actionbar__meta { font-size: var(--text-sm); color: var(--ink-2); font-weight: 700; }
.actionbar__buttons { display: flex; gap: var(--s2); }
.actionbar__buttons > :deep(*) { flex: 1; }
@media (min-width: 720px) {
  .actionbar--tabs { bottom: calc(var(--safe-bottom) + var(--kb-inset, 0px)); }
}
</style>
