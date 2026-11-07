<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'

const model = defineModel<number>({ required: true })
const props = withDefaults(defineProps<{ label: string; min?: number; max?: number; unit?: string }>(), { min: 0, max: 99 })

function set(v: number) {
  model.value = Math.min(props.max, Math.max(props.min, v))
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="label">
    <span class="stepper__label">{{ label }}</span>
    <div class="stepper__ctrl">
      <button type="button" :disabled="model <= min" :aria-label="`Fewer ${label.toLowerCase()}`" @click="set(model - 1)">
        <Minus :size="22" aria-hidden="true" />
      </button>
      <output class="num" aria-live="polite">{{ model }}<span class="visually-hidden"> {{ unit ?? label.toLowerCase() }}</span></output>
      <button type="button" :disabled="model >= max" :aria-label="`More ${label.toLowerCase()}`" @click="set(model + 1)">
        <Plus :size="22" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s2) var(--s3);
  padding: var(--s2) 0;
}
.stepper__label { font-weight: 700; }
.stepper__ctrl { display: flex; align-items: center; gap: var(--s1); margin-left: auto; }
button {
  width: var(--tap-lg); height: var(--tap-lg);
  display: grid; place-items: center;
  border-radius: var(--r-control);
  border: 2px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
}
button:disabled { color: var(--ink-2); border-color: var(--line); background: var(--surface-sunk); }
output { min-width: 2.5ch; text-align: center; font-size: var(--num-md); }
</style>
