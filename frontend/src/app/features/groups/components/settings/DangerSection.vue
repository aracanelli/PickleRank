<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, Copy, Archive } from 'lucide-vue-next'
import { groupsApi } from '../../services/groups.api'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const props = defineProps<{
  groupId: string
}>()

const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const isRecalculating = ref(false)
const isDuplicating = ref(false)
const isArchiving = ref(false)

async function recalculateRatings() {
  const ok = await confirm({
    title: 'Recalculate ratings?',
    message: 'This will reset all player ratings and recalculate from all completed events.',
    confirmLabel: 'Recalculate'
  })
  if (!ok) return
  isRecalculating.value = true
  try {
    const result = await groupsApi.recalculateRatings(props.groupId)
    toast.success(
      `Recalculated! ${result.eventsRecalculated} events processed, ${result.playersUpdated} players updated.`
    )
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to recalculate ratings'))
  } finally {
    isRecalculating.value = false
  }
}

async function duplicateGroup() {
  const ok = await confirm({
    title: 'Duplicate group?',
    message: 'Create a copy of this group with all players but no history?',
    confirmLabel: 'Duplicate'
  })
  if (!ok) return
  isDuplicating.value = true
  try {
    const newGroup = await groupsApi.duplicate(props.groupId)
    toast.success(`Created "${newGroup.name}"`)
    router.push(`/groups/${newGroup.id}`)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to duplicate group'))
    isDuplicating.value = false
  }
}

async function archiveGroup() {
  const ok = await confirm({
    title: 'Archive group?',
    message: 'It will be hidden from your dashboard.',
    confirmLabel: 'Archive',
    danger: true
  })
  if (!ok) return
  isArchiving.value = true
  try {
    await groupsApi.archive(props.groupId)
    router.push('/groups')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to archive group'))
    isArchiving.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4 rounded-[14px] border border-loss/30 bg-surface-1 p-4">
    <h2 class="eyebrow text-loss">Danger zone</h2>

    <div class="flex items-center justify-between gap-3">
      <span class="flex min-w-0 flex-col">
        <span class="text-sm font-medium text-ink">Recalculate all ratings</span>
        <span class="text-sm text-ink-faint">Replay every completed event from scratch</span>
      </span>
      <AppButton variant="secondary" size="sm" :loading="isRecalculating" @click="recalculateRatings">
        <RefreshCw class="size-4" />
        Recalculate
      </AppButton>
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-line pt-4">
      <span class="flex min-w-0 flex-col">
        <span class="text-sm font-medium text-ink">Duplicate group</span>
        <span class="text-sm text-ink-faint">Same players and settings, no history</span>
      </span>
      <AppButton variant="secondary" size="sm" :loading="isDuplicating" @click="duplicateGroup">
        <Copy class="size-4" />
        Duplicate
      </AppButton>
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-line pt-4">
      <span class="flex min-w-0 flex-col">
        <span class="text-sm font-medium text-ink">Archive group</span>
        <span class="text-sm text-ink-faint">Hide this group from your dashboard</span>
      </span>
      <AppButton variant="danger" size="sm" :loading="isArchiving" @click="archiveGroup">
        <Archive class="size-4" />
        Archive
      </AppButton>
    </div>
  </section>
</template>
