<script setup lang="ts">
import { computed } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import { useThemeStore, type ThemePreference } from '@/stores/theme'

const themeStore = useThemeStore()

const model = computed({
  get: () => themeStore.preference,
  set: (value: string) => themeStore.setPreference(value as ThemePreference)
})

const options = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Auto', value: 'system' }
]
</script>

<template>
  <SegmentedControl v-model="model" :options="options" />
</template>
