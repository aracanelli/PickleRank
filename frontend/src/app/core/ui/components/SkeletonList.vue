<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number
    avatar?: boolean
  }>(),
  { rows: 4, avatar: false }
)
</script>

<template>
  <div class="flex flex-col gap-3" role="status" aria-label="Loading">
    <div
      v-for="i in rows"
      :key="i"
      class="flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-4"
    >
      <div v-if="avatar" class="size-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
      <div class="flex flex-1 flex-col gap-2">
        <div class="h-3.5 w-2/5 animate-pulse rounded bg-surface-2" />
        <div class="h-3 w-3/5 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  </div>
</template>
