<script setup lang="ts">
/**
 * Every player you have created, across leagues. Create players here, then add them to leagues
 * from a league's Players tab. Tap a name to rename it or edit notes. Invite links tie a player
 * to someone's account.
 */
import { ref, computed, onMounted } from 'vue'
import { Search } from 'lucide-vue-next'
import { playersApi } from '../services/players.api'
import { api } from '@/app/core/http/api-client'
import type { PlayerDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiState from '@/app/core/ui/UiState.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
import { confirm, toast } from '@/app/core/ui/feedback'
import BulkPlayerCreateModal from '../components/BulkPlayerCreateModal.vue'
import InviteSheet from '../components/InviteSheet.vue'
import { findByName, inviteUrl, count } from '../roster'

const players = ref<PlayerDto[]>([])
const loading = ref(true)
const error = ref('')
const query = ref('')
const visible = computed(() => findByName(players.value, query.value))

async function load() {
  loading.value = true
  error.value = ''
  try {
    players.value = (await playersApi.list()).players
  } catch (e) {
    error.value = (e as { message?: string }).message || 'Your player list did not load.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// ---- create one, or edit one (editing set) ----
const editing = ref<PlayerDto | null>(null)
const createOpen = ref(false)
const name = ref('')
const notes = ref('')
const nameError = ref('')
const creating = ref(false)

function openCreate() {
  editing.value = null
  name.value = ''
  notes.value = ''
  nameError.value = ''
  createOpen.value = true
}

function openEdit(p: PlayerDto) {
  editing.value = p
  name.value = p.displayName
  notes.value = p.notes ?? ''
  nameError.value = ''
  createOpen.value = true
}

async function create() {
  const displayName = name.value.trim()
  if (!displayName) {
    nameError.value = 'Enter a name.'
    return
  }
  creating.value = true
  nameError.value = ''
  try {
    if (editing.value) {
      await playersApi.update(editing.value.id, { displayName, notes: notes.value.trim() })
      // names show on every league roster the player is on
      api.invalidateCache('/players')
    } else {
      await playersApi.create({ displayName, notes: notes.value.trim() || undefined })
    }
    createOpen.value = false
    toast(editing.value ? 'Player saved' : `${displayName} created`)
    await load()
  } catch (e) {
    nameError.value = (e as { message?: string }).message || (editing.value ? 'Player not saved. Try again.' : 'Player not created. Try again.')
  } finally {
    creating.value = false
  }
}

const bulkOpen = ref(false)

// ---- account links ----
const busyId = ref<string | null>(null)
const invite = ref<{ name: string; link: string } | null>(null)

async function makeInvite(p: PlayerDto) {
  busyId.value = p.id
  try {
    const token = await playersApi.generateInvite(p.id)
    invite.value = { name: p.displayName, link: inviteUrl(window.location.origin, token) }
  } catch (e) {
    toast((e as { message?: string }).message || 'Invite link not created. Try again.', 'bad')
  } finally {
    busyId.value = null
  }
}

async function unlink(p: PlayerDto) {
  const ok = await confirm({
    title: `Unlink ${p.displayName}'s account?`,
    body: 'Their stats stay. They lose access until they open a new invite link.',
    confirmLabel: 'Unlink account',
    danger: true
  })
  if (!ok) return
  busyId.value = p.id
  try {
    await playersApi.unlinkPlayer(p.id)
    toast('Account unlinked')
    await load()
  } catch (e) {
    toast((e as { message?: string }).message || 'Account not unlinked. Try again.', 'bad')
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="page">
    <PageHeader title="Your players" subtitle="Everyone you've created. Add them to a league from its Players tab.">
      <template #actions><AccountButton /></template>
    </PageHeader>

    <UiState v-if="loading && !players.length" kind="loading" title="Loading players" />
    <UiState v-else-if="error" kind="error" title="Players didn't load" :body="error" @retry="load" />
    <UiState
      v-else-if="!players.length"
      kind="empty"
      title="No players yet"
      body="Create the people you play with. You can add them to any of your leagues."
      action-label="Create a player"
      @action="openCreate"
    />

    <template v-else>
      <div class="search">
        <Search :size="18" aria-hidden="true" class="search__icon" />
        <label for="players-search" class="visually-hidden">Find a player</label>
        <input id="players-search" v-model="query" type="search" placeholder="Find a player" autocomplete="off" enterkeyhint="search">
      </div>
      <p v-if="!visible.length" class="muted" role="status">No one named "{{ query }}".</p>

      <ul role="list" class="list" aria-label="Players">
        <li v-for="p in visible" :key="p.id" class="prow">
          <button type="button" class="prow__text prow__edit" @click="openEdit(p)">
            <span class="prow__name truncate">{{ p.displayName }}</span>
            <span v-if="p.userId || p.notes" class="prow__meta truncate muted">{{ [p.userId ? 'Account linked' : '', p.notes || ''].filter(Boolean).join(', ') }}</span>
          </button>
          <UiButton
            v-if="p.userId"
            variant="quiet"
            :disabled="busyId === p.id"
            :aria-label="`Unlink ${p.displayName}'s account`"
            @click="unlink(p)"
          >Unlink</UiButton>
          <UiButton
            v-else
            variant="quiet"
            :loading="busyId === p.id"
            :aria-label="`Create invite link for ${p.displayName}`"
            @click="makeInvite(p)"
          >Invite</UiButton>
        </li>
      </ul>
    </template>

    <ActionBar v-if="!error" above-tabs>
      <template v-if="players.length" #meta>{{ count(players.length) }}</template>
      <UiButton variant="primary" @click="openCreate">New player</UiButton>
      <UiButton @click="bulkOpen = true">Add several</UiButton>
    </ActionBar>

    <UiSheet :open="createOpen" :title="editing ? `Edit ${editing.displayName}` : 'New player'" @close="createOpen = false">
      <form id="create-player" class="form" novalidate @submit.prevent="create">
        <UiField v-model="name" label="Name" autocomplete="off" :maxlength="80" :error="nameError || undefined" required />
        <UiField v-model="notes" label="Notes" hint="Optional. Only you see these." multiline />
      </form>
      <template #actions>
        <UiButton type="submit" form="create-player" variant="primary" size="lg" block :loading="creating">{{ editing ? 'Save player' : 'Create player' }}</UiButton>
      </template>
    </UiSheet>

    <BulkPlayerCreateModal v-model:open="bulkOpen" @success="load" />
    <InviteSheet :link="invite?.link ?? null" :name="invite?.name ?? ''" @close="invite = null" />
  </div>
</template>

<style scoped>
.search { position: relative; }
.search__icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-2); }
.search input {
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--s3) 0 40px;
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
}
.list { display: flex; flex-direction: column; min-width: 0; }
.prow {
  display: flex;
  align-items: center;
  gap: var(--s2);
  min-height: 56px;
  border-bottom: 1px solid var(--line);
}
.prow__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.prow__name { font-weight: 700; }
.prow__meta { font-size: var(--text-sm); }
.form { display: flex; flex-direction: column; gap: var(--s4); }
.prow__edit {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-height: var(--tap);
  justify-content: center;
}
.prow__edit:hover .prow__name { text-decoration: underline; }
</style>
