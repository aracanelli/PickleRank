<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { groupsApi } from '../services/groups.api'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const open = defineModel<boolean>({ required: true })

const router = useRouter()
const toast = useToast()

const name = ref('')
const isCreating = ref(false)

watch(open, (isOpen) => {
  if (isOpen) name.value = ''
})

async function createGroup() {
  if (!name.value.trim() || isCreating.value) return
  isCreating.value = true
  try {
    const group = await groupsApi.create({ name: name.value.trim() })
    toast.success(`Created "${group.name}"`)
    open.value = false
    router.push(`/groups/${group.id}`)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to create group'))
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" title="New group" :persistent="isCreating">
    <form @submit.prevent="createGroup">
      <AppInput
        v-model="name"
        label="Group name"
        placeholder="e.g. Friday Night Picklers"
        required
      />
    </form>
    <template #footer>
      <div class="flex gap-2">
        <AppButton variant="secondary" block :disabled="isCreating" @click="open = false">
          Cancel
        </AppButton>
        <AppButton block :loading="isCreating" :disabled="!name.trim()" @click="createGroup">
          Create group
        </AppButton>
      </div>
    </template>
  </Sheet>
</template>
