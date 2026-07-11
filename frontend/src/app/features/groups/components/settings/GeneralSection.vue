<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { groupsApi } from '../../services/groups.api'
import type { GroupDto } from '@/app/core/models/dto'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const props = defineProps<{
  groupId: string
  currentName: string
}>()

const emit = defineEmits<{ renamed: [group: GroupDto] }>()

const toast = useToast()
const name = ref(props.currentName)
const isRenaming = ref(false)

watch(
  () => props.currentName,
  (value) => {
    name.value = value
  }
)

const canRename = computed(
  () => name.value.trim().length > 0 && name.value.trim() !== props.currentName
)

async function rename() {
  if (!canRename.value) return
  isRenaming.value = true
  try {
    const updated = await groupsApi.rename(props.groupId, name.value.trim())
    toast.success('Group renamed')
    emit('renamed', updated)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to rename group'))
  } finally {
    isRenaming.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-muted">General</h2>
    <div class="flex items-end gap-2">
      <div class="flex-1">
        <AppInput v-model="name" label="Group name" placeholder="Enter group name" />
      </div>
      <AppButton variant="secondary" :loading="isRenaming" :disabled="!canRename" @click="rename">
        Rename
      </AppButton>
    </div>
  </section>
</template>
