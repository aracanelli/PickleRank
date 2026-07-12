<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Link, Unlink, Copy, Share2, RefreshCw } from 'lucide-vue-next'
import { playersApi } from '../services/players.api'
import type { PlayerDto } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppTextarea from '@/app/core/ui/components/AppTextarea.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const props = defineProps<{
  player: PlayerDto | null
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ updated: [] }>()

const toast = useToast()
const { confirm } = useConfirm()

const name = ref('')
const notes = ref('')
const isSaving = ref(false)
const isUnlinking = ref(false)
const inviteLink = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = props.player?.displayName ?? ''
  notes.value = props.player?.notes ?? ''
  inviteLink.value = ''
})

const dirty = computed(
  () =>
    !!props.player &&
    (name.value.trim() !== props.player.displayName || (notes.value.trim() || '') !== (props.player.notes || ''))
)

async function saveDetails() {
  if (!props.player || !name.value.trim()) return
  isSaving.value = true
  try {
    await playersApi.update(props.player.id, {
      displayName: name.value.trim(),
      notes: notes.value.trim() || undefined
    })
    toast.success('Player updated')
    emit('updated')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to update player'))
  } finally {
    isSaving.value = false
  }
}

async function generateInvite() {
  if (!props.player) return
  try {
    const token = await playersApi.generateInvite(props.player.id)
    inviteLink.value = `${window.location.origin}/link-player?token=${token}`
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to generate invite'))
  }
}

async function shareInvite() {
  if (!inviteLink.value || !props.player) return
  if (navigator.share) {
    try {
      await navigator.share({ title: `Link ${props.player.displayName}`, url: inviteLink.value })
      return
    } catch {
      /* user cancelled share — fall through to clipboard */
    }
  }
  await copyInvite()
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    toast.success('Invite link copied')
  } catch {
    toast.error('Failed to copy link')
  }
}

async function unlinkPlayer() {
  if (!props.player) return
  const ok = await confirm({
    title: 'Unlink player?',
    message: `Disconnect ${props.player.displayName} from their user account. A new invite link will be generated so they can re-link if needed.`,
    confirmLabel: 'Unlink',
    danger: true
  })
  if (!ok) return
  isUnlinking.value = true
  try {
    await playersApi.unlinkPlayer(props.player.id)
    toast.success('Player unlinked')
    emit('updated')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to unlink player'))
  } finally {
    isUnlinking.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" :title="player?.displayName || 'Player'" :persistent="isSaving || isUnlinking">
    <div v-if="player" class="flex flex-col gap-5">
      <div class="flex items-center gap-3">
        <Avatar :name="player.displayName" :seed="player.id" size="lg" />
        <div class="flex min-w-0 flex-col gap-1">
          <span class="truncate text-base font-semibold text-ink">{{ player.displayName }}</span>
          <AppBadge v-if="player.userId" variant="success" class="w-fit">Linked</AppBadge>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <AppInput v-model="name" label="Name" placeholder="Player name" />
        <AppTextarea v-model="notes" label="Notes" :rows="2" placeholder="e.g., Left-handed, prefers kitchen play" />
        <AppButton :loading="isSaving" :disabled="!dirty || !name.trim()" @click="saveDetails">
          Save changes
        </AppButton>
      </div>

      <div class="flex flex-col gap-2 rounded-[14px] border border-line bg-surface-1 p-4">
        <span class="text-sm font-medium text-ink">Invite</span>
        <template v-if="player.userId">
          <p class="text-sm text-ink-muted">
            This player is linked to a user account. Unlink to generate a fresh invite.
          </p>
          <AppButton variant="secondary" size="sm" :loading="isUnlinking" @click="unlinkPlayer">
            <Unlink class="size-4" />
            Unlink account
          </AppButton>
        </template>
        <template v-else-if="!inviteLink">
          <p class="text-sm text-ink-muted">
            Generate a link this player can open to claim the profile with their login.
          </p>
          <AppButton variant="secondary" size="sm" @click="generateInvite">
            <Link class="size-4" />
            Generate invite link
          </AppButton>
        </template>
        <template v-else>
          <p class="break-all rounded-lg bg-surface-2 p-2.5 font-mono text-xs text-ink-muted">{{ inviteLink }}</p>
          <div class="flex gap-2">
            <AppButton variant="secondary" size="sm" block @click="shareInvite">
              <Share2 class="size-4" />
              Share
            </AppButton>
            <AppButton variant="secondary" size="sm" block @click="copyInvite">
              <Copy class="size-4" />
              Copy
            </AppButton>
          </div>
          <AppButton variant="ghost" size="sm" @click="generateInvite">
            <RefreshCw class="size-4" />
            Regenerate link
          </AppButton>
        </template>
      </div>
    </div>
  </Sheet>
</template>
