<script setup lang="ts">
import { useId } from 'vue'

const model = defineModel<string | number | null>()
const props = withDefaults(defineProps<{
  label: string
  hint?: string
  error?: string
  type?: string
  inputmode?: 'text' | 'numeric' | 'decimal' | 'search' | 'email' | 'tel'
  placeholder?: string
  autocomplete?: string
  required?: boolean
  disabled?: boolean
  maxlength?: number
  hideLabel?: boolean
  multiline?: boolean
}>(), { type: 'text' })

const id = useId()
const describedBy = () => [props.hint ? `${id}-hint` : '', props.error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
</script>

<template>
  <div class="field" :class="{ 'field--error': !!error }">
    <label :for="id" :class="{ 'visually-hidden': hideLabel }">{{ label }}</label>
    <textarea
      v-if="multiline"
      :id="id"
      v-model="model as string"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :aria-invalid="!!error || undefined"
      :aria-describedby="describedBy()"
      rows="4"
      :maxlength="maxlength"
    />
    <input
      v-else
      :id="id"
      v-model="model"
      :type="type"
      :inputmode="inputmode"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      :disabled="disabled"
      :maxlength="maxlength"
      :aria-invalid="!!error || undefined"
      :aria-describedby="describedBy()"
    >
    <p v-if="hint" :id="`${id}-hint`" class="field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-err`" class="field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: var(--s1); }
label { font-weight: 700; font-size: var(--text-sm); }
input, textarea {
  width: 100%;
  min-height: var(--tap);
  padding: var(--s2) var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--ink);
  scroll-margin-block: 96px 160px;
}
input::placeholder, textarea::placeholder { color: var(--ink-2); opacity: 1; }
input:focus-visible, textarea:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
.field--error input, .field--error textarea { border-color: var(--bad); }
.field__hint { font-size: var(--text-sm); color: var(--ink-2); }
.field__error { font-size: var(--text-sm); color: var(--bad); font-weight: 700; }
</style>
