<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Link, Unlink, Copy, Share2, Trash2 } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import { playersApi } from '@/app/features/players/services/players.api'
import type { GroupPlayerDto, MembershipType, SkillLevel, GroupRole } from '@/app/core/models/dto'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import Avatar from '@/app/core/ui/components/Avatar.vue'
import AppBadge from '@/app/core/ui/components/AppBadge.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import SegmentedControl from '@/app/core/ui/components/SegmentedControl.vue'
import ToggleSwitch from '@/app/core/ui/components/ToggleSwitch.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const props = defineProps<{
  groupId: string
  player: GroupPlayerDto | null
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ updated: [] }>()

const toast = useToast()
const { confirm } = useConfirm()

const updating = ref(false)
const inviteLink = ref('')

watch(open, (isOpen) => {
  if (isOpen) inviteLink.value = ''
})

const membershipOptions = [
  { label: 'Permanent', value: 'PERMANENT' },
  { label: 'Sub', value: 'SUB' }
]
const skillOptions = [
  { label: 'Beginner', value: 'BEGINNER' },
  { label: 'Intermediate', value: 'INTERMEDIATE' },
  { label: 'Advanced', value: 'ADVANCED' }
]

async function update(
  params: { membershipType?: MembershipType; skillLevel?: SkillLevel; role?: GroupRole },
  successMessage: string
) {
  if (!props.player || updating.value) return
  updating.value = true
  try {
    await groupsApi.updateGroupPlayer(props.groupId, props.player.id, params)
    toast.success(successMessage)
    emit('updated')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to update player'))
  } finally {
    updating.value = false
  }
}

const membershipType = computed<string>({
  get: () => props.player?.membershipType ?? 'PERMANENT',
  set: (value) => {
    if (!props.player || value === props.player.membershipType) return
    void update(
      { membershipType: value as MembershipType },
      `Changed ${props.player.displayName} to ${value === 'PERMANENT' ? 'Permanent' : 'Sub'}`
    )
  }
})

const skillLevel = computed<string>({
  get: () => props.player?.skillLevel ?? 'INTERMEDIATE',
  set: (value) => {
    if (!props.player || value === (props.player.skillLevel ?? 'INTERMEDIATE')) return
    void update({ skillLevel: value as SkillLevel }, 'Skill level updated')
  }
})

const isOrganizer = computed({
  get: () => props.player?.role === 'ORGANIZER',
  set: (value) => {
    if (!props.player) return
    const newRole: GroupRole = value ? 'ORGANIZER' : 'PLAYER'
    if (newRole === props.player.role) return
    void update(
      { role: newRole },
      `Changed ${props.player.displayName} to ${newRole === 'ORGANIZER' ? 'Organizer' : 'Player'}`
    )
  }
})

async function generateInvite() {
  if (!props.player) return
  try {
    const token = await playersApi.generateInvite(props.player.playerId)
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
    message: `Disconnect ${props.player.displayName} from their login. A new invite link will be generated so they can re-link if needed.`,
    confirmLabel: 'Unlink',
    danger: true
  })
  if (!ok) return
  updating.value = true
  try {
    await playersApi.unlinkPlayer(props.player.playerId)
    toast.success('Player unlinked. A new invite link can be generated.')
    emit('updated')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to unlink player'))
  } finally {
    updating.value = false
  }
}

async function removePlayer() {
  if (!props.player) return
  const ok = await confirm({
    title: 'Remove player?',
    message: `Remove ${props.player.displayName} from the group?`,
    confirmLabel: 'Remove',
    danger: true
  })
  if (!ok) return
  updating.value = true
  try {
    await groupsApi.removePlayer(props.groupId, props.player.id)
    toast.success(`Removed ${props.player.displayName}`)
    open.value = false
    emit('updated')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to remove player'))
  } finally {
    updating.value = false
  }
}
</script>

<template>
  <Sheet v-model="open" :title="player?.displayName || 'Player'" :persistent="updating">
    <div v-if="player" class="flex flex-col gap-5">
      <div class="flex items-center gap-3">
        <Avatar :name="player.displayName" :seed="player.playerId" size="lg" />
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-base font-semibold text-ink">{{ player.displayName }}</span>
          <span class="text-sm text-ink-muted font-mono tabular-nums">
            {{ player.rating.toFixed(1) }} · {{ player.gamesPlayed }} games
          </span>
          <AppBadge v-if="player.userId" variant="success" class="mt-1 w-fit">Linked</AppBadge>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-ink">Membership</span>
        <SegmentedControl v-model="membershipType" :options="membershipOptions" />
      </div>

      <div v-if="membershipType === 'SUB'" class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-ink">Skill level</span>
        <SegmentedControl v-model="skillLevel" :options="skillOptions" />
        <p class="text-sm text-ink-faint">
          Skill level only affects a sub's starting rating (Advanced +100, Beginner -100).
        </p>
      </div>

      <div class="rounded-[14px] border border-line bg-surface-1 px-4 py-1">
        <ToggleSwitch
          v-model="isOrganizer"
          label="Organizer"
          description="Can manage players, events, and settings"
          :disabled="updating"
        />
      </div>

      <div class="flex flex-col gap-2 rounded-[14px] border border-line bg-surface-1 p-4">
        <span class="text-sm font-medium text-ink">Account link</span>
        <template v-if="player.userId">
          <p class="text-sm text-ink-muted">This player is linked to a user account.</p>
          <AppButton variant="secondary" size="sm" :disabled="updating" @click="unlinkPlayer">
            <Unlink class="size-4" />
            Unlink account
          </AppButton>
        </template>
        <template v-else-if="!inviteLink">
          <p class="text-sm text-ink-muted">Invite this player to claim their profile with a login.</p>
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
        </template>
      </div>
    </div>

    <template #footer>
      <AppButton variant="danger" block :loading="updating" @click="removePlayer">
        <Trash2 class="size-4" />
        Remove from group
      </AppButton>
    </template>
  </Sheet>
</template>
