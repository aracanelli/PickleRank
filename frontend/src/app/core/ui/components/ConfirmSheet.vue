<script setup lang="ts">
import { computed } from 'vue'
import Sheet from './Sheet.vue'
import AppButton from './AppButton.vue'
import { useConfirm } from '../composables/useConfirm'

// Rendered once in AppShell; driven by the module-level useConfirm() state.
const { state, settle } = useConfirm()

const open = computed({
  get: () => state.open,
  set: (value: boolean) => {
    if (!value) settle(false)
  }
})
</script>

<template>
  <Sheet v-model="open" :title="state.options.title">
    <p v-if="state.options.message" class="text-sm text-ink-muted">
      {{ state.options.message }}
    </p>
    <template #footer>
      <div class="flex gap-3">
        <AppButton variant="secondary" class="flex-1" @click="settle(false)">
          {{ state.options.cancelLabel || 'Cancel' }}
        </AppButton>
        <AppButton
          :variant="state.options.danger ? 'danger' : 'primary'"
          class="flex-1"
          @click="settle(true)"
        >
          {{ state.options.confirmLabel || 'Confirm' }}
        </AppButton>
      </div>
    </template>
  </Sheet>
</template>
