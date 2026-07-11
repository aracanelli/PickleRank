<script setup lang="ts">
// Last-N results strip: win = filled, loss = ring, tie = tie-colored.
withDefaults(
  defineProps<{
    results: Array<'W' | 'L' | 'T'>
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' }
)
</script>

<template>
  <span
    class="inline-flex items-center"
    :class="size === 'sm' ? 'gap-1' : 'gap-1.5'"
    role="img"
    :aria-label="`Recent form: ${results.join(', ')}`"
  >
    <span
      v-for="(result, i) in results"
      :key="i"
      class="inline-flex items-center justify-center rounded-full font-display font-bold uppercase"
      :class="[
        size === 'sm' ? 'size-4 text-[8px]' : 'size-5 text-[9px]',
        result === 'W'
          ? 'bg-win text-surface-page'
          : result === 'L'
            ? 'border-2 border-loss text-loss'
            : 'bg-tie/20 text-tie'
      ]"
    >{{ result }}</span>
  </span>
</template>
