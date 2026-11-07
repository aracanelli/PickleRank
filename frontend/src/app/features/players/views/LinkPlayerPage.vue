<script setup lang="ts">
/**
 * Invite deep link: /link-player?token=...
 * Ties the signed-in account to the invited player, then opens that player's league.
 */
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { playersApi } from '../services/players.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { api } from '@/app/core/http/api-client'
import UiState from '@/app/core/ui/UiState.vue'
import { toast } from '@/app/core/ui/feedback'

const route = useRoute()
const router = useRouter()
const state = ref<'loading' | 'missing' | 'invalid' | 'failed' | 'linked'>('loading')
const message = ref('')
const linkedName = ref('')

/** The league whose roster holds this player; null if none or several. */
async function leagueFor(playerId: string): Promise<string | null> {
  api.invalidateCache('/api/groups')
  const [own, member] = await Promise.all([groupsApi.list(), groupsApi.listMemberGroups()])
  const groups = [...member.groups, ...own.groups]
  const hits = await Promise.all(groups.map(g =>
    groupsApi.getPlayers(g.id).then(r => (r.players.some(p => p.playerId === playerId) ? g.id : null)).catch(() => null)
  ))
  const ids = [...new Set(hits.filter((x): x is string => !!x))]
  return ids.length === 1 ? ids[0] : null
}

async function link() {
  const token = typeof route.query.token === 'string' ? route.query.token.trim() : ''
  if (!token) {
    state.value = 'missing'
    return
  }
  state.value = 'loading'
  let player
  try {
    player = await playersApi.linkPlayer(token)
  } catch (e) {
    const err = e as { status?: number; message?: string }
    // 4xx: the token itself is bad or used; anything else is worth retrying
    state.value = err.status && err.status >= 400 && err.status < 500 ? 'invalid' : 'failed'
    message.value = (err.message || '').replace(/\.$/, '')
    return
  }
  linkedName.value = player.displayName
  const groupId = await leagueFor(player.id).catch(() => null)
  if (groupId) {
    toast(`You're linked as ${player.displayName}`)
    await router.replace(`/groups/${groupId}`)
  } else {
    state.value = 'linked'
  }
}

onMounted(link)
</script>

<template>
  <div class="page">
    <UiState v-if="state === 'loading'" kind="loading" title="Linking your account" />
    <UiState
      v-else-if="state === 'missing'"
      heading="h1"
      kind="denied"
      title="This invite link is incomplete"
      body="Part of the link is missing. Open the full link from the message, or ask your organizer to send it again."
      action-label="See your leagues"
      action-to="/groups"
    />
    <UiState
      v-else-if="state === 'invalid'"
      heading="h1"
      kind="denied"
      title="This invite link doesn't work"
      :body="`${message ? message + '. ' : ''}Links work once. Ask your organizer for a new one.`"
      action-label="See your leagues"
      action-to="/groups"
    />
    <UiState
      v-else-if="state === 'failed'"
      heading="h1"
      kind="error"
      title="Account not linked yet"
      :body="message || 'Check your connection and try again.'"
      @retry="link"
    />
    <UiState
      v-else
      heading="h1"
      kind="empty"
      :title="`You're linked as ${linkedName}`"
      body="Your stats now show in your leagues."
      action-label="See your leagues"
      action-to="/groups"
    />
  </div>
</template>
