<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useCountUp } from '../composables/useCountUp'

const props = withDefaults(
  defineProps<{
    value: number
    duration?: number
    decimals?: number
    /** Prefix like "+" for deltas (a "-" comes from the number itself). */
    signed?: boolean
  }>(),
  { duration: 800, decimals: 0, signed: false }
)

const { display } = useCountUp(toRef(props, 'value'), {
  duration: props.duration,
  decimals: props.decimals
})

const text = computed(() => {
  const formatted = display.value.toFixed(props.decimals)
  return props.signed && display.value > 0 ? `+${formatted}` : formatted
})
</script>

<template>
  <!-- numeral = Archivo condensed + tabular digits: no jitter during counts -->
  <span class="numeral tabular-nums">{{ text }}</span>
</template>
