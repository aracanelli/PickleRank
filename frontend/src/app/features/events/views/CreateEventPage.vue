<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Check, CalendarSync } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { eventsApi } from '../services/events.api'
import type { MembershipType } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiStepper from '@/app/core/ui/UiStepper.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
import { announce, toast } from '@/app/core/ui/feedback'
import SpondImportPanel, { type SpondImport } from '@/app/features/spond/components/SpondImportPanel.vue'
import {
  initialSelection, toggle, trimTo, requiredFor, selectionMessage,
  COURTS_MIN, COURTS_MAX, ROUNDS_MIN, ROUNDS_MAX
} from '../playerSelection'

const route = useRoute()
const router = useRouter()
const league = useLeagueStore()
const groupId = computed(() => route.params.groupId as string)

const name = ref('')
const courts = ref(2)
const rounds = ref(4)
const selected = ref<Set<string>>(new Set())
const tab = ref<MembershipType>('PERMANENT')
const query = ref('')
const creating = ref(false)
const error = ref('')
let initialized = false
const spondOpen = ref(false)
const importNote = ref('')

const required = computed(() => requiredFor(courts.value))
const ready = computed(() => selected.value.size === required.value)
const message = computed(() => selectionMessage(selected.value.size, required.value))

const regulars = computed(() => league.players.filter(p => p.membershipType === 'PERMANENT'))
const subs = computed(() => league.players.filter(p => p.membershipType === 'SUB'))
const visible = computed(() => {
  const src = tab.value === 'PERMANENT' ? regulars.value : subs.value
  const q = query.value.trim().toLowerCase()
  const list = q ? src.filter(p => p.displayName.toLowerCase().includes(q)) : src
  return [...list].sort((a, b) => a.displayName.localeCompare(b.displayName))
})
const selectedIn = (list: typeof regulars.value) => list.filter(p => selected.value.has(p.id)).length

watch(groupId, id => { void league.load(id) }, { immediate: true })

watch(() => [league.group?.id, league.players] as const, ([gid]) => {
  if (initialized || !gid || gid !== groupId.value) return
  initialized = true
  const init = initialSelection(league.players)
  courts.value = init.courts
  selected.value = init.selected
  if (league.group?.settings.defaultRounds) rounds.value = league.group.settings.defaultRounds
}, { immediate: true })

watch(courts, () => {
  selected.value = trimTo(selected.value, required.value)
})

function onToggle(id: string) {
  const before = selected.value.size
  selected.value = toggle(selected.value, id, required.value)
  if (selected.value.size === before) announce(`All ${required.value} spots are filled. Remove someone or add a court.`)
}

function clearAll() {
  selected.value = new Set()
  importNote.value = ''
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Spond import replaces the selection, using the same courts x 4 cap as picking by hand.
async function onSpondImport(r: SpondImport) {
  spondOpen.value = false
  await league.load(groupId.value, true) // picks up players added during the import
  const onRoster = new Set(league.players.map(p => p.id))
  const ids = Array.from(new Set(r.ids)).filter(id => onRoster.has(id))
  selected.value = trimTo(new Set(ids), required.value)
  const missing = r.total - ids.length
  const extra = ids.length - selected.value.size
  importNote.value = [
    `${ids.length} of ${r.total} people who said yes to ${r.eventName} matched roster players.`,
    missing ? `${missing} didn't match anyone on your roster and ${missing === 1 ? 'was' : 'were'} left out. To include them, import again and choose Add as new player.` : '',
    extra ? `Only ${required.value} fit on ${plural(courts.value, 'court', 'courts')}, so ${extra} matched ${extra === 1 ? 'player was' : 'players were'} left out. Add a court, then import again.` : ''
  ].filter(Boolean).join(' ')
  toast(`${plural(selected.value.size, 'player', 'players')} selected from Spond`)
}

async function create() {
  if (!ready.value || creating.value) return
  creating.value = true
  error.value = ''
  try {
    const event = await eventsApi.create(groupId.value, {
      name: name.value.trim() || undefined,
      courts: courts.value,
      rounds: rounds.value,
      participantIds: Array.from(selected.value)
    })
    // Make the schedule right away; if matchmaking can't find one, the event page explains and offers a retry.
    let scheduleError = ''
    try {
      await eventsApi.generate(event.id, false)
    } catch (e) {
      scheduleError = (e as { message?: string }).message || 'Schedule not made'
    }
    await router.replace({ path: `/events/${event.id}`, query: scheduleError ? { scheduleError } : {} })
  } catch (e) {
    error.value = (e as { message?: string }).message || 'Event not created. Check your connection and try again.'
    announce(error.value, true)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeader title="New event" :back-to="`/groups/${groupId}`" :back-label="league.group?.name || 'League'" />

    <UiState v-if="league.loading && !league.group" kind="loading" title="Loading roster" />
    <UiState v-else-if="league.error" kind="error" title="Roster didn't load" :body="league.error.message" @retry="league.load(groupId, true)" />
    <UiState
      v-else-if="league.group && !league.isOrganizer"
      kind="denied"
      title="Only organizers start events"
      body="Ask a league organizer to start tonight's event."
      action-label="Back to league"
      :action-to="`/groups/${groupId}`"
    />

    <form v-else-if="league.group" class="form" novalidate @submit.prevent="create">
      <UiField v-model="name" label="Event name" hint="Optional. Leave blank to use the date." placeholder="Week 6 ladder" autocomplete="off" :maxlength="80" />

      <fieldset class="group">
        <legend>Courts and rounds</legend>
        <UiStepper v-model="courts" label="Courts" :min="COURTS_MIN" :max="COURTS_MAX" />
        <UiStepper v-model="rounds" label="Rounds" :min="ROUNDS_MIN" :max="ROUNDS_MAX" />
        <p class="muted hint">Each court needs 4 players, so {{ courts }} {{ courts === 1 ? 'court needs' : 'courts need' }} {{ required }}.</p>
      </fieldset>

      <fieldset class="group">
        <legend>Who's playing</legend>
        <UiButton variant="secondary" block @click="spondOpen = true"><CalendarSync :size="18" aria-hidden="true" /> Import from Spond</UiButton>
        <p v-if="importNote" class="import-note" role="status">{{ importNote }}</p>
        <div class="seg" role="group" aria-label="Show roster">
          <button
            type="button" class="seg__btn"
            :aria-pressed="tab === 'PERMANENT'" @click="tab = 'PERMANENT'"
          >Regulars <span class="num">{{ selectedIn(regulars) }}/{{ regulars.length }}</span></button>
          <button
            type="button" class="seg__btn"
            :aria-pressed="tab === 'SUB'" @click="tab = 'SUB'"
          >Subs <span class="num">{{ selectedIn(subs) }}/{{ subs.length }}</span></button>
        </div>

        <div class="search">
          <Search :size="18" aria-hidden="true" class="search__icon" />
          <label for="roster-search" class="visually-hidden">Find a player</label>
          <input id="roster-search" v-model="query" type="search" placeholder="Find a player" autocomplete="off" enterkeyhint="search">
        </div>

        <p v-if="!league.players.length" class="muted">No players on this roster yet. Add players before starting an event.</p>
        <p v-else-if="!visible.length" class="muted">{{ query ? `No one named "${query}".` : tab === 'SUB' ? 'No subs on this roster.' : 'No regulars on this roster.' }}</p>

        <ul role="list" class="roster">
          <li v-for="p in visible" :key="p.id">
            <label class="pick" :class="{ 'pick--on': selected.has(p.id), 'pick--full': !selected.has(p.id) && ready }">
              <input
                type="checkbox"
                :checked="selected.has(p.id)"
                :disabled="!selected.has(p.id) && selected.size >= required"
                @change="onToggle(p.id)"
              >
              <span class="pick__box" aria-hidden="true"><Check v-if="selected.has(p.id)" :size="18" /></span>
              <span class="pick__name truncate">{{ p.displayName }}</span>
              <span class="pick__rating num muted">{{ Math.round(p.rating) }}</span>
            </label>
          </li>
        </ul>
        <UiButton v-if="selected.size" variant="quiet" @click="clearAll">Clear selection</UiButton>
      </fieldset>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <ActionBar>
        <template #meta><span aria-live="polite">{{ message }}</span></template>
        <UiButton type="submit" variant="primary" size="lg" :disabled="!ready" :loading="creating">
          {{ creating ? 'Making schedule…' : 'Create and make schedule' }}
        </UiButton>
      </ActionBar>
    </form>

    <SpondImportPanel
      v-if="league.group && league.isOrganizer"
      :open="spondOpen"
      :group-id="groupId"
      :players="league.players"
      @close="spondOpen = false"
      @import="onSpondImport"
    />
  </div>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--s5); }
.group { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s2); min-width: 0; }
legend { font-size: var(--text-md); font-weight: 700; padding: 0; margin-bottom: var(--s2); }
.hint { font-size: var(--text-sm); }

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: var(--r-control);
  background: var(--surface-sunk);
}
.seg__btn {
  min-height: var(--tap);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  font-weight: 700;
}
.seg__btn[aria-pressed='true'] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }

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

.roster { display: flex; flex-direction: column; }
.pick {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 52px;
  padding: 0 var(--s1);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  position: relative;
}
.pick input { position: absolute; opacity: 0; width: 100%; height: 100%; left: 0; top: 0; margin: 0; cursor: pointer; }
.pick input:disabled { cursor: not-allowed; }
.pick__box {
  width: 26px; height: 26px; flex: none;
  display: grid; place-items: center;
  border: 2px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface);
}
.pick--on .pick__box { background: var(--court); border-color: var(--court); color: var(--on-court); }
.pick__name { flex: 1; }
.pick--on .pick__name { font-weight: 700; }
.pick--full .pick__name { color: var(--ink-2); }
.pick--full .pick__box { border-color: var(--line); background: var(--surface-sunk); }
.pick:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: -3px; border-radius: 6px; }
.error { color: var(--bad); font-weight: 700; }
.import-note { padding: var(--s3); border-radius: var(--r-control); background: var(--surface-sunk); font-size: var(--text-sm); }
</style>
