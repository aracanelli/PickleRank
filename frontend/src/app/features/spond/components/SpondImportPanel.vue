<script setup lang="ts">
import { ref, computed, watch, useId } from 'vue'
import { ChevronRight, RefreshCw } from 'lucide-vue-next'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import SpondConnectSheet from './SpondConnectSheet.vue'
import SpondAttendeeLinks, { type LinkChoice } from './SpondAttendeeLinks.vue'
import { spondApi } from '../services/spond.api'
import type {
  GroupPlayerDto,
  SpondEventDto,
  SpondGroupDto,
  SpondResolveResponse,
  SpondAttendeeLinkInput,
  SpondStatusDto
} from '@/app/core/models/dto'

export interface SpondImport {
  /** group player ids to select (may include players created during the import) */
  ids: string[]
  /** everyone who said yes in Spond */
  total: number
  eventName: string
}

const props = defineProps<{ open: boolean; groupId: string; players: GroupPlayerDto[] }>()
const emit = defineEmits<{ close: []; import: [result: SpondImport] }>()

type Phase = 'loading' | 'error' | 'not-connected' | 'need-group' | 'events' | 'link'
const groupFormId = useId()
const phase = ref<Phase>('loading')
const error = ref('')
const busy = ref(false)
const connectOpen = ref(false)

const spondGroups = ref<SpondGroupDto[]>([])
const chosenGroup = ref('')
const spondGroupName = ref('')
const events = ref<SpondEventDto[]>([])

const event = ref<SpondEventDto | null>(null)
const resolved = ref<SpondResolveResponse | null>(null)
const choices = ref<Record<string, LinkChoice>>({})

const msg = (e: unknown, fallback: string) => (e as { message?: string }).message || fallback
const title = computed(() => phase.value === 'link' ? 'Check Spond names' : 'Import from Spond')
const unmatched = computed(() => resolved.value?.attendees.filter(a => !a.matchedGroupPlayerId) ?? [])

watch(() => props.open, isOpen => { if (isOpen) void init() })

async function run(work: () => Promise<void>, fallback: string) {
  error.value = ''
  busy.value = true
  try {
    await work()
  } catch (e) {
    error.value = msg(e, fallback)
  } finally {
    busy.value = false
  }
}

async function init() {
  phase.value = 'loading'
  error.value = ''
  event.value = null
  try {
    const status = await spondApi.status()
    if (!status.connected) { phase.value = 'not-connected'; return }
    const link = await spondApi.getGroupLink(props.groupId)
    if (!link.linked) {
      spondGroups.value = (await spondApi.listGroups()).groups
      chosenGroup.value = spondGroups.value.length === 1 ? spondGroups.value[0].spondGroupId : ''
      phase.value = 'need-group'
      return
    }
    spondGroupName.value = link.spondGroupName || 'your Spond group'
    events.value = (await spondApi.listEvents(props.groupId)).events
    phase.value = 'events'
  } catch (e) {
    error.value = msg(e, 'Check your connection and try again.')
    phase.value = 'error'
  }
}

function onConnectChange(s: SpondStatusDto) {
  if (!s.connected) return
  connectOpen.value = false
  void init()
}

const linkGroup = () => run(async () => {
  if (!chosenGroup.value) { error.value = 'Choose a Spond group.'; return }
  const link = await spondApi.setGroupLink(props.groupId, chosenGroup.value)
  spondGroupName.value = link.spondGroupName || 'your Spond group'
  events.value = (await spondApi.listEvents(props.groupId)).events
  phase.value = 'events'
}, 'Spond group not linked. Try again.')

const refresh = () => run(async () => {
  events.value = (await spondApi.listEvents(props.groupId)).events
}, 'Events didn\'t load. Try again.')

const pick = (ev: SpondEventDto) => run(async () => {
  event.value = ev
  const res = await spondApi.resolveEvent(props.groupId, ev.spondEventId)
  resolved.value = res
  if (!res.attendees.some(a => !a.matchedGroupPlayerId)) {
    finish(res.matchedGroupPlayerIds)
    return
  }
  choices.value = Object.fromEntries(res.attendees.filter(a => !a.matchedGroupPlayerId)
    .map(a => [a.spondMemberId, a.suggestedGroupPlayerId ?? 'create']))
  phase.value = 'link'
}, 'That Spond event didn\'t load. Try again.')

const confirmLinks = () => run(async () => {
  const res = resolved.value!
  const links: SpondAttendeeLinkInput[] = []
  for (const a of unmatched.value) {
    const c = choices.value[a.spondMemberId]
    if (c === 'skip') continue
    links.push(c === 'create' ? { spondMemberId: a.spondMemberId, createName: a.name } : { spondMemberId: a.spondMemberId, groupPlayerId: c })
  }
  const added = links.length ? (await spondApi.confirmLinks(props.groupId, event.value!.spondEventId, links)).groupPlayerIds : []
  finish([...res.matchedGroupPlayerIds, ...added])
}, 'Names weren\'t saved. Try again.')

function finish(ids: string[]) {
  emit('import', { ids, total: resolved.value?.attendees.length ?? ids.length, eventName: event.value?.name || 'the Spond event' })
}

function formatDate(iso?: string) {
  if (!iso) return 'No date set'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'No date set' : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
</script>

<template>
  <UiSheet :open="open" :title="title" @close="emit('close')">
    <UiState v-if="phase === 'loading'" kind="loading" title="Loading Spond" />
    <UiState v-else-if="phase === 'error'" kind="error" title="Spond didn't load" :body="error" @retry="init" />

    <UiState
      v-else-if="phase === 'not-connected'"
      kind="empty"
      title="Spond isn't connected"
      body="Connect your Spond account once. Then you can import who said yes to a Spond event."
      action-label="Connect Spond"
      @action="connectOpen = true"
    />

    <form v-else-if="phase === 'need-group'" :id="groupFormId" class="stack" @submit.prevent="linkGroup">
      <fieldset class="choices">
        <legend>Which Spond group is this league?</legend>
        <p class="muted small">PickleRank remembers this for next time.</p>
        <p v-if="!spondGroups.length" class="muted">Your Spond account isn't in any groups.</p>
        <label v-for="g in spondGroups" :key="g.spondGroupId" class="choice">
          <input v-model="chosenGroup" type="radio" name="spond-group" :value="g.spondGroupId">
          <span class="choice__name truncate">{{ g.name }}</span>
          <span class="muted num">{{ g.memberCount }} members</span>
        </label>
      </fieldset>
    </form>

    <div v-else-if="phase === 'events'" class="stack">
      <p class="muted small">Upcoming events in {{ spondGroupName }}. Choose one to select the people who said yes.</p>
      <p v-if="!events.length" class="muted">No upcoming events in {{ spondGroupName }}. Make the event in Spond, then refresh.</p>
      <ul v-else role="list" class="events">
        <li v-for="ev in events" :key="ev.spondEventId">
          <button type="button" class="event" :disabled="busy" :aria-busy="busy && event?.spondEventId === ev.spondEventId || undefined" @click="pick(ev)">
            <span class="event__text">
              <strong class="truncate">{{ ev.name }}</strong>
              <span class="muted small">{{ formatDate(ev.startsAt) }}</span>
            </span>
            <span class="event__count"><span class="num">{{ ev.acceptedCount }}</span> going</span>
            <ChevronRight :size="20" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>

    <SpondAttendeeLinks
      v-else-if="phase === 'link' && resolved"
      v-model="choices"
      :attendees="unmatched"
      :matched="resolved.matchedGroupPlayerIds.length"
      :total="resolved.attendees.length"
      :players="players"
    />

    <p v-if="error && phase !== 'error'" class="error" role="alert">{{ error }}</p>

    <template v-if="phase === 'need-group' || phase === 'events' || phase === 'link'" #actions>
      <UiButton v-if="phase === 'need-group'" type="submit" :form="groupFormId" variant="primary" block :loading="busy" :disabled="!spondGroups.length">Link Spond group</UiButton>
      <UiButton v-else-if="phase === 'events'" variant="secondary" block :loading="busy" @click="refresh"><RefreshCw :size="18" aria-hidden="true" /> Refresh events</UiButton>
      <template v-else>
        <UiButton variant="primary" block :loading="busy" @click="confirmLinks">Select these players</UiButton>
        <UiButton variant="quiet" block :disabled="busy" @click="phase = 'events'">Back to events</UiButton>
      </template>
    </template>
  </UiSheet>

  <SpondConnectSheet :open="connectOpen" @close="connectOpen = false" @change="onConnectChange" />
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: var(--s3); }
.small { font-size: var(--text-sm); }
.error { color: var(--bad); font-weight: 700; margin-top: var(--s3); }

.choices { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s2); min-width: 0; }
legend { font-weight: 700; padding: 0; margin-bottom: var(--s1); }
.choice {
  display: flex; align-items: center; gap: var(--s3);
  min-height: var(--tap-lg);
  padding: 0 var(--s3);
  border: 2px solid var(--line);
  border-radius: var(--r-control);
  cursor: pointer;
}
.choice:has(input:checked) { border-color: var(--court); background: var(--court-tint); }
.choice:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 1px; }
.choice input { width: 22px; height: 22px; margin: 0; accent-color: var(--court); flex: none; }
.choice__name { flex: 1; font-weight: 700; }

.events { display: flex; flex-direction: column; gap: var(--s2); }
.event {
  display: flex; align-items: center; gap: var(--s3);
  width: 100%;
  min-height: 64px;
  padding: var(--s2) var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-tile);
  background: var(--surface);
  color: var(--ink);
  text-align: left;
}
.event:hover:not(:disabled) { background: var(--surface-sunk); }
.event:disabled { color: var(--ink-2); }
.event__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.event__count { flex: none; font-size: var(--text-sm); }
.event__count .num { font-size: var(--text-md); font-weight: 700; }
</style>
