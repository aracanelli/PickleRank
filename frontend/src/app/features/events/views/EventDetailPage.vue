<script setup lang="ts">
/**
 * Live scoring: the round board.
 * Every court in the round is a tile; tap the court you were told about, enter two numbers,
 * "Save court N". Confirmed scores live in `event`; unsent or failed ones live in the saver,
 * so completion is never offered while a score is still on its way.
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, RouterLink } from 'vue-router'
import { ChevronLeft, ChevronRight, MoreHorizontal, Shuffle, Share2, Pencil, Trash2, Check, Wrench } from 'lucide-vue-next'
import { eventsApi } from '../services/events.api'
import type { EventDto, GameDto } from '@/app/core/models/dto'
import { useLeagueStore } from '@/stores/league'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import CourtTile from '@/app/core/ui/CourtTile.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import UiField from '@/app/core/ui/UiField.vue'
import { useKeyboardInset } from '@/app/core/ui/useKeyboardInset'
import { announce, confirm, toast } from '@/app/core/ui/feedback'
import { shareElementAsImage, safeFileName } from '@/app/core/ui/shareImage'
import type { CourtState } from '@/app/core/ui/SaveStatus.vue'
import ShareableSchedule from '../components/ShareableSchedule.vue'
import { useScoreSaver } from '../composables/useScoreSaver'
import { gamesByRound, currentRoundIndex, progress, eventTitle, isScored } from '../eventProgress'
import { validatePair, digitsOnly } from '../scoreInput'

const route = useRoute()
const router = useRouter()
const league = useLeagueStore()
useKeyboardInset()

const eventId = computed(() => route.params.eventId as string)
const event = ref<EventDto | null>(null)
const loading = ref(true)
const loadError = ref<{ status?: number; message: string } | null>(null)
const round = ref(0)
const busy = ref<'' | 'generate' | 'complete' | 'share' | 'rename' | 'delete'>('')
const scheduleError = ref((route.query.scheduleError as string) || '')
const flashId = ref<string | null>(null)
let loadToken = 0

const saver = useScoreSaver({
  updateScore: (id, body) => eventsApi.updateScore(id, body),
  onSaved: (game: GameDto) => {
    if (!event.value) return
    const i = event.value.games.findIndex(g => g.id === game.id)
    if (i !== -1) event.value.games[i] = game
    if (event.value.status === 'GENERATED') event.value.status = 'IN_PROGRESS'
    flashId.value = game.id
    setTimeout(() => { if (flashId.value === game.id) flashId.value = null }, 1300)
    announce(game.scoreTeam1 == null
      ? `Court ${game.courtIndex + 1} score cleared.`
      : `Court ${game.courtIndex + 1} saved, ${game.scoreTeam1} to ${game.scoreTeam2}.`)
  },
  onFailed: (gameId) => {
    const g = event.value?.games.find(x => x.id === gameId)
    if (g) announce(`Court ${g.courtIndex + 1} score not saved. Tap court ${g.courtIndex + 1} to retry.`, true)
  }
})

const rounds = computed(() => (event.value ? gamesByRound(event.value) : []))
const roundGames = computed(() => rounds.value[round.value] ?? [])
const prog = computed(() => (event.value ? progress(event.value) : null))
const completed = computed(() => event.value?.status === 'COMPLETED')
const hasGames = computed(() => (event.value?.games.length ?? 0) > 0)
const scoredCount = computed(() => event.value?.games.filter(isScored).length ?? 0)
const roundDone = (i: number) => (rounds.value[i]?.length ?? 0) > 0 && rounds.value[i].every(isScored)
const failedGames = computed(() =>
  (event.value?.games ?? []).filter(g => saver.status(g.id).state === 'failed').sort((a, b) => a.roundIndex - b.roundIndex || a.courtIndex - b.courtIndex)
)
const retryLabel = computed(() => {
  const f = failedGames.value
  if (f.length === 1) return `Retry court ${f[0].courtIndex + 1}${f[0].roundIndex !== round.value ? `, round ${f[0].roundIndex + 1}` : ''}`
  return `Retry ${f.length} courts`
})
function retryFailed() {
  for (const g of failedGames.value) void saver.retry(g.id)
  announce(failedGames.value.length === 1 ? 'Retrying 1 court.' : `Retrying ${failedGames.value.length} courts.`)
}
const canComplete = computed(() => !!prog.value?.allScored && !saver.hasUnsaved() && !completed.value)

function tileState(g: GameDto): CourtState {
  if (completed.value) return 'final'
  const s = saver.status(g.id).state
  if (s === 'saving' || s === 'failed') return s
  return isScored(g) ? 'saved' : 'needs'
}
function tileScores(g: GameDto) {
  const st = saver.status(g.id)
  if ((st.state === 'saving' || st.state === 'failed') && st.draft) return [st.draft.score1, st.draft.score2] as const
  return [g.scoreTeam1, g.scoreTeam2] as const
}

async function load(opts: { keepRound?: boolean } = {}) {
  const token = ++loadToken
  loading.value = !event.value
  loadError.value = null
  try {
    const e = await eventsApi.get(eventId.value)
    if (token !== loadToken) return
    event.value = e
    void league.load(e.groupId)
    saver.restoreDrafts(e.games)
    if (!opts.keepRound) round.value = currentRoundIndex(e)
  } catch (err) {
    if (token !== loadToken) return
    const x = err as { status?: number; message?: string }
    loadError.value = { status: x.status, message: x.message || 'Event did not load' }
  } finally {
    if (token === loadToken) loading.value = false
  }
}

onMounted(load)
watch(eventId, () => { saver.reset(); event.value = null; void load() })

// ---- court sheet ----
const sheetGame = ref<GameDto | null>(null)
const in1 = ref('')
const in2 = ref('')
const err1 = ref('')
const err2 = ref('')
const field1 = ref<HTMLInputElement | null>(null)
const field2 = ref<HTMLInputElement | null>(null)

const sheetStatus = computed(() => (sheetGame.value ? saver.status(sheetGame.value.id) : null))
const sheetWas = computed(() => {
  const g = sheetGame.value
  return g && isScored(g) ? `${g.scoreTeam1}–${g.scoreTeam2}` : ''
})

function openCourt(g: GameDto) {
  if (completed.value) return
  const st = saver.status(g.id)
  const d = st.state === 'failed' || st.state === 'saving' ? st.draft : undefined
  in1.value = d?.score1 != null ? String(d.score1) : g.scoreTeam1 != null ? String(g.scoreTeam1) : ''
  in2.value = d?.score2 != null ? String(d.score2) : g.scoreTeam2 != null ? String(g.scoreTeam2) : ''
  err1.value = ''
  err2.value = ''
  sheetGame.value = g
  nextTick(() => field1.value?.select())
}
function closeSheet() { sheetGame.value = null }
// Typing into a field replaces its score; it never appends to the old one (9 + 7 must not become 97).
function selectAll(e: FocusEvent) {
  const el = e.target as HTMLInputElement
  requestAnimationFrame(() => el.select())
}

function onInput(which: 1 | 2, e: Event) {
  const el = e.target as HTMLInputElement
  const v = digitsOnly(el.value)
  if (v !== el.value) el.value = v
  if (which === 1) { in1.value = v; err1.value = '' } else { in2.value = v; err2.value = '' }
}

function saveCourt() {
  const g = sheetGame.value
  if (!g) return
  const v = validatePair(in1.value, in2.value)
  err1.value = v.error1 || ''
  err2.value = v.error2 || ''
  if (!v.ok) {
    nextTick(() => (v.error1 ? field1.value : field2.value)?.focus())
    return
  }
  const court = g.courtIndex + 1
  if (isScored(g) && g.scoreTeam1 === v.score1 && g.scoreTeam2 === v.score2 && saver.status(g.id).state !== 'failed') {
    closeSheet()
    return
  }
  void saver.save(g.id, v.score1, v.score2)
  announce(`Saving court ${court}.`)
  closeSheet()
}

async function clearCourt() {
  const g = sheetGame.value
  if (!g) return
  const ok = await confirm({
    title: `Clear court ${g.courtIndex + 1}'s score?`,
    body: `${g.scoreTeam1}–${g.scoreTeam2} is removed and the court goes back to needing a score.`,
    confirmLabel: 'Clear score',
    danger: true
  })
  if (!ok) return
  void saver.save(g.id, undefined, undefined)
  closeSheet()
}

// ---- rounds ----
function goRound(i: number) {
  if (i < 0 || i >= rounds.value.length) return
  round.value = i
  announce(`Round ${i + 1} of ${rounds.value.length}. ${rounds.value[i].filter(g => !isScored(g)).length} courts need scores.`)
  window.scrollTo({ top: 0 })
}

// ---- schedule ----
async function generate(isRegenerate: boolean) {
  if (!event.value) return
  if (isRegenerate) {
    const n = scoredCount.value
    const ok = await confirm({
      title: 'Shuffle the schedule?',
      body: n
        ? `Every matchup changes and the ${n} ${n === 1 ? 'score' : 'scores'} already entered ${n === 1 ? 'is' : 'are'} deleted.`
        : 'Every matchup changes. No scores have been entered yet.',
      confirmLabel: n ? `Shuffle and delete ${n} ${n === 1 ? 'score' : 'scores'}` : 'Shuffle schedule',
      danger: n > 0
    })
    if (!ok) return
  }
  moreOpen.value = false
  busy.value = 'generate'
  scheduleError.value = ''
  try {
    saver.reset()
    const res = await eventsApi.generate(event.value.id, isRegenerate)
    event.value = { ...event.value, status: res.status, generationMeta: res.generationMeta, games: res.games }
    round.value = 0
    toast(isRegenerate ? 'New schedule made' : 'Schedule made')
    if (route.query.scheduleError) void router.replace({ query: {} })
  } catch (e) {
    scheduleError.value = (e as { message?: string }).message || 'Schedule not made'
    announce(scheduleError.value, true)
  } finally {
    busy.value = ''
  }
}

// ---- complete ----
async function completeEvent() {
  if (!event.value || !canComplete.value) return
  const ok = await confirm({
    title: `Complete ${eventTitle(event.value)}?`,
    body: `Ratings update for ${event.value.participantCount} players. You can still correct scores later from History.`,
    confirmLabel: 'Complete event'
  })
  if (!ok) return
  busy.value = 'complete'
  try {
    await eventsApi.complete(event.value.id, event.value.groupId)
    saver.reset()
    toast('Event completed. Rankings updated.')
    await router.push(`/groups/${event.value.groupId}/rankings`)
  } catch (e) {
    const msg = (e as { message?: string }).message || 'Event not completed'
    toast(`${msg}. Your scores are saved; try again.`, 'bad')
    await load({ keepRound: true })
  } finally {
    busy.value = ''
  }
}

// ---- more menu ----
const moreOpen = ref(false)
const renameOpen = ref(false)
const newName = ref('')
const shareEl = ref<HTMLElement | null>(null)

function startRename() {
  moreOpen.value = false
  newName.value = event.value?.name || ''
  renameOpen.value = true
}
async function saveName() {
  if (!event.value) return
  const name = newName.value.trim()
  if (!name) return
  busy.value = 'rename'
  const old = event.value.name
  try {
    event.value.name = name
    await eventsApi.update(event.value.id, { name })
    renameOpen.value = false
    toast('Event renamed')
  } catch (e) {
    event.value.name = old
    toast((e as { message?: string }).message || 'Name not saved', 'bad')
  } finally {
    busy.value = ''
  }
}
async function share() {
  if (!event.value) return
  moreOpen.value = false
  busy.value = 'share'
  try {
    await nextTick()
    const el = shareEl.value?.firstElementChild as HTMLElement | null
    if (el) await shareElementAsImage(el, `${safeFileName(eventTitle(event.value))}-schedule.png`)
  } catch {
    toast('Image not created', 'bad')
  } finally {
    busy.value = ''
  }
}
async function deleteEvent() {
  if (!event.value) return
  moreOpen.value = false
  const ok = await confirm({
    title: `Delete ${eventTitle(event.value)}?`,
    body: scoredCount.value ? `The schedule and ${scoredCount.value} entered scores are removed.` : 'The schedule is removed.',
    confirmLabel: 'Delete event',
    danger: true
  })
  if (!ok) return
  busy.value = 'delete'
  try {
    await eventsApi.delete(event.value.id)
    saver.reset()
    toast('Event deleted')
    await router.replace(`/groups/${event.value.groupId}`)
  } catch (e) {
    toast((e as { message?: string }).message || 'Event not deleted', 'bad')
  } finally {
    busy.value = ''
  }
}

// ---- leaving with unsaved scores ----
function beforeUnload(e: BeforeUnloadEvent) {
  if (saver.hasUnsaved()) { e.preventDefault(); e.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onUnmounted(() => { window.removeEventListener('beforeunload', beforeUnload); saver.dispose() })
onBeforeRouteLeave(async () => {
  if (!saver.hasUnsaved()) return true
  return confirm({
    title: 'Some scores are not saved',
    body: 'They stay on this phone and come back when you reopen this event, but nobody else will see them until they save.',
    confirmLabel: 'Leave anyway',
    cancelLabel: 'Stay and retry'
  })
})

const backTo = computed(() => (event.value ? `/groups/${event.value.groupId}` : '/groups'))
const nextRoundLabel = computed(() => `Go to round ${round.value + 2}`)
const dockAction = computed<'' | 'retry' | 'complete' | 'next'>(() => {
  if (completed.value) return ''
  if (failedGames.value.length) return 'retry'
  if (prog.value?.allScored) return 'complete'
  if (roundDone(round.value) && round.value < rounds.value.length - 1) return 'next'
  return ''
})
const roundNeeds = computed(() => roundGames.value.filter(g => !isScored(g)).length)
</script>

<template>
  <div class="page scoring">
    <UiState v-if="loading" kind="loading" title="Loading event" />
    <UiState
      v-else-if="loadError?.status === 403"
      kind="denied" heading="h1"
      title="Only organizers can open live events"
      body="Results show up in History as soon as the organizer completes the event."
      action-label="Back to league"
      :action-to="league.groupId ? `/groups/${league.groupId}` : '/groups'"
    />
    <UiState
      v-else-if="loadError?.status === 404"
      kind="denied" heading="h1"
      title="This event no longer exists"
      body="It may have been deleted by another organizer."
      action-label="Back to league"
      :action-to="league.groupId ? `/groups/${league.groupId}` : '/groups'"
    />
    <UiState v-else-if="loadError" kind="error" heading="h1" title="Event didn't load" :body="loadError.message" @retry="load()" />

    <template v-else-if="event">
      <PageHeader :title="eventTitle(event)" :back-to="backTo" :back-label="league.group?.name || 'League'">
        <template #actions>
          <button type="button" class="icon-btn" aria-label="Event options" @click="moreOpen = true">
            <MoreHorizontal :size="22" aria-hidden="true" />
          </button>
        </template>
        <p class="sub muted">
          <template v-if="completed">Completed. {{ event.courts }} courts, {{ event.rounds }} rounds.</template>
          <template v-else-if="hasGames">{{ scoredCount }} of {{ event.games.length }} games scored</template>
          <template v-else>{{ event.participantCount }} players, {{ event.courts }} courts, {{ event.rounds }} rounds</template>
        </p>
      </PageHeader>

      <!-- No schedule yet -->
      <section v-if="!hasGames" class="section">
        <div v-if="scheduleError" class="notice notice--bad" role="alert">
          <strong>Schedule not made.</strong> {{ scheduleError }}
          <span class="muted">Try again, or loosen the pairing rules in league settings.</span>
        </div>
        <p v-else>Make the schedule to see who plays on which court each round.</p>
        <UiButton variant="primary" size="lg" :loading="busy === 'generate'" @click="generate(false)">Make schedule</UiButton>
        <RouterLink v-if="scheduleError" :to="`/groups/${event.groupId}/settings`" class="link">Open league settings</RouterLink>
      </section>

      <template v-else>
        <nav class="rounds" aria-label="Rounds">
          <button
            v-for="(_, i) in rounds"
            :key="i"
            type="button"
            class="rchip num"
            :class="{ 'rchip--done': roundDone(i) }"
            :aria-current="i === round ? 'step' : undefined"
            :aria-label="`Round ${i + 1}${roundDone(i) ? ', all courts scored' : ''}`"
            @click="goRound(i)"
          >
            <span>{{ i + 1 }}</span>
            <Check v-if="roundDone(i)" :size="14" aria-hidden="true" class="rchip__check" />
          </button>
        </nav>

        <div v-if="event.status === 'GENERATED' && scoredCount === 0" class="notice">
          <strong>Schedule ready.</strong> Tap a court to enter its score.
          <UiButton variant="quiet" :loading="busy === 'generate'" @click="generate(true)"><Shuffle :size="18" aria-hidden="true" /> Shuffle again</UiButton>
        </div>

        <section class="section" :aria-labelledby="`round-h`">
          <h2 id="round-h" class="round-h">
            <span class="num">Round {{ round + 1 }}</span>
            <span class="muted round-h__of"> of {{ rounds.length }}</span>
          </h2>
          <ol role="list" class="board">
            <li v-for="g in roundGames" :key="g.id">
              <CourtTile
                :court="g.courtIndex + 1"
                :team1="g.team1.map(p => p.displayName)"
                :team2="g.team2.map(p => p.displayName)"
                :score1="tileScores(g)[0]"
                :score2="tileScores(g)[1]"
                :state="tileState(g)"
                :interactive="!completed"
                :flash="flashId === g.id"
                @select="openCourt(g)"
              />
            </li>
          </ol>
        </section>

        <section v-if="completed" class="section">
          <UiButton :to="{ path: `/groups/${event.groupId}/history`, query: { eventId: event.id } }">
            <Wrench :size="18" aria-hidden="true" /> Correct scores
          </UiButton>
        </section>
      </template>

      <!-- thumb-zone controls -->
      <div v-if="hasGames" class="dock">
        <p v-if="!completed" class="dock__meta" aria-live="polite">
          <template v-if="failedGames.length === 1">Court {{ failedGames[0].courtIndex + 1 }}{{ failedGames[0].roundIndex !== round ? `, round ${failedGames[0].roundIndex + 1},` : '' }} is not saved. Your score is kept on this phone.</template>
          <template v-else-if="failedGames.length">{{ failedGames.length }} courts are not saved. Your scores are kept on this phone.</template>
          <template v-else-if="saver.hasUnsaved()">Saving scores…</template>
          <template v-else-if="prog?.allScored">All {{ prog.total }} games scored.</template>
          <template v-else-if="roundNeeds">{{ roundNeeds }} {{ roundNeeds === 1 ? 'court needs a score' : 'courts need scores' }} this round.</template>
          <template v-else>Round {{ round + 1 }} is fully scored.</template>
        </p>
        <div class="dock__row" :class="{ 'dock__row--nav': !dockAction }">
          <button
            type="button" class="dock__nav" :disabled="round === 0"
            :aria-label="dockAction ? (round > 0 ? `Round ${round}` : 'No earlier round') : undefined"
            @click="goRound(round - 1)"
          >
            <ChevronLeft :size="22" aria-hidden="true" />
            <span v-if="!dockAction && round > 0">Round {{ round }}</span>
          </button>
          <div v-if="dockAction" class="dock__main">
            <UiButton v-if="dockAction === 'retry'" variant="danger" size="lg" block @click="retryFailed">{{ retryLabel }}</UiButton>
            <UiButton
              v-else-if="dockAction === 'complete'"
              variant="optic" size="lg" block
              :disabled="!canComplete"
              :loading="busy === 'complete'"
              @click="completeEvent"
            >Complete event</UiButton>
            <UiButton v-else variant="primary" size="lg" block @click="goRound(round + 1)">{{ nextRoundLabel }}</UiButton>
          </div>
          <button
            type="button" class="dock__nav" :disabled="round >= rounds.length - 1"
            :aria-label="dockAction ? (round < rounds.length - 1 ? `Round ${round + 2}` : 'No later round') : undefined"
            @click="goRound(round + 1)"
          >
            <span v-if="!dockAction && round < rounds.length - 1">Round {{ round + 2 }}</span>
            <ChevronRight :size="22" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- court sheet -->
      <UiSheet
        :open="!!sheetGame"
        :title="sheetGame ? `Court ${sheetGame.courtIndex + 1}, round ${sheetGame.roundIndex + 1}` : ''"
        close-label="Close without saving"
        @close="closeSheet"
      >
        <template #title="{ titleId }">
          <h2 :id="titleId" class="sheet-title">
            <span class="sheet-title__court num">Court {{ sheetGame ? sheetGame.courtIndex + 1 : '' }}</span>
            <span class="muted">Round {{ sheetGame ? sheetGame.roundIndex + 1 : '' }}</span>
          </h2>
        </template>
        <form v-if="sheetGame" class="scoreform" novalidate @submit.prevent="saveCourt">
          <div v-if="sheetStatus?.state === 'failed'" class="notice notice--bad" role="alert">
            <strong>Not saved.</strong> {{ sheetStatus.error }}. Your numbers are kept below.
          </div>
          <div class="team-in">
            <label :for="`s1-${sheetGame.id}`" class="team-in__names">
              <span v-for="p in sheetGame.team1" :key="p.id" class="truncate">{{ p.displayName }}</span>
            </label>
            <input
              :id="`s1-${sheetGame.id}`"
              ref="field1"
              class="score-in num"
              :value="in1"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              enterkeyhint="next"
              maxlength="2"
              data-autofocus
              :aria-invalid="!!err1 || undefined"
              :aria-describedby="err1 ? `e1-${sheetGame.id}` : undefined"
              @input="onInput(1, $event)"
              @focus="selectAll"
              @keydown.enter.prevent="field2?.focus()"
            >
          </div>
          <p v-if="err1" :id="`e1-${sheetGame.id}`" class="field-err">{{ err1 }}</p>
          <div class="sheet-net" aria-hidden="true" />
          <div class="team-in">
            <label :for="`s2-${sheetGame.id}`" class="team-in__names">
              <span v-for="p in sheetGame.team2" :key="p.id" class="truncate">{{ p.displayName }}</span>
            </label>
            <input
              :id="`s2-${sheetGame.id}`"
              ref="field2"
              class="score-in num"
              :value="in2"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              enterkeyhint="done"
              maxlength="2"
              :aria-invalid="!!err2 || undefined"
              :aria-describedby="err2 ? `e2-${sheetGame.id}` : undefined"
              @input="onInput(2, $event)"
              @focus="selectAll"
            >
          </div>
          <p v-if="err2" :id="`e2-${sheetGame.id}`" class="field-err">{{ err2 }}</p>
          <p v-if="sheetWas" class="muted was">Saved score was {{ sheetWas }}.</p>
          <button type="submit" hidden tabindex="-1" aria-hidden="true" />
        </form>
        <template #actions>
          <UiButton variant="primary" size="lg" block @click="saveCourt">
            {{ sheetStatus?.state === 'failed' ? 'Retry' : sheetWas ? 'Replace score on' : 'Save' }} court {{ sheetGame ? sheetGame.courtIndex + 1 : '' }}
          </UiButton>
          <UiButton v-if="sheetWas" variant="quiet" block @click="clearCourt">Clear score</UiButton>
        </template>
      </UiSheet>

      <!-- event options -->
      <UiSheet :open="moreOpen" title="Event options" @close="moreOpen = false">
        <div class="menu">
          <button type="button" class="menu__item" @click="startRename"><Pencil :size="20" aria-hidden="true" /> Rename event</button>
          <button v-if="hasGames" type="button" class="menu__item" :disabled="busy === 'share'" @click="share"><Share2 :size="20" aria-hidden="true" /> Share schedule as image</button>
          <button v-if="hasGames && !completed" type="button" class="menu__item" @click="generate(true)"><Shuffle :size="20" aria-hidden="true" /> Shuffle schedule</button>
          <button v-if="!completed" type="button" class="menu__item menu__item--bad" @click="deleteEvent"><Trash2 :size="20" aria-hidden="true" /> Delete event</button>
        </div>
      </UiSheet>

      <UiSheet :open="renameOpen" title="Rename event" @close="renameOpen = false">
        <form class="stack-sm" @submit.prevent="saveName">
          <UiField v-model="newName" label="Event name" :maxlength="80" autocomplete="off" />
        </form>
        <template #actions>
          <UiButton variant="primary" size="lg" block :disabled="!newName.trim()" :loading="busy === 'rename'" @click="saveName">Save name</UiButton>
        </template>
      </UiSheet>

      <div ref="shareEl" class="offscreen" aria-hidden="true">
        <ShareableSchedule v-if="busy === 'share'" :event="event" :rounds="rounds" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.scoring { padding-bottom: 0; }
.sub { font-size: var(--text-sm); }
.icon-btn {
  width: var(--tap); height: var(--tap);
  display: grid; place-items: center;
  border: 0; border-radius: 50%;
  background: transparent; color: var(--ink);
}
.icon-btn:hover { background: var(--surface-sunk); }

.rounds {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  margin: 0 calc(var(--gutter) * -1);
  padding: var(--s2) var(--gutter);
  padding-top: calc(var(--s2) + var(--safe-top));
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.rchip {
  flex: none;
  min-width: var(--tap);
  height: var(--tap);
  display: grid; place-items: center;
  border-radius: var(--r-control);
  border: 2px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--text-lg);
}
.rchip { grid-auto-flow: column; gap: 2px; padding: 0 8px; }
.rchip--done { border-color: var(--ok); color: var(--ok); }
.rchip__check { margin-top: 2px; }
.rchip[aria-current='step'] { background: var(--optic); color: var(--on-optic); border-color: var(--on-optic); }

.round-h { display: flex; align-items: baseline; gap: 4px; }
.round-h .num { font-size: var(--text-xl); }
.round-h__of { font-size: var(--text-md); font-weight: 400; }

.board { display: flex; flex-direction: column; gap: var(--s3); list-style: none; padding: 0; margin: 0; }

.notice {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-tile);
  background: var(--surface);
  border: 1px solid var(--line);
}
.notice--bad { background: var(--bad-tint); border-color: var(--bad); color: var(--ink); }
.notice--bad strong { color: var(--bad); }
.link { font-weight: 700; min-height: var(--tap); display: inline-flex; align-items: center; }

.dock {
  position: sticky;
  bottom: 0;
  z-index: 12;
  margin: auto calc(var(--gutter) * -1) 0;
  padding: var(--s2) var(--gutter) calc(var(--s3) + var(--safe-bottom));
  background: var(--bg);
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}
.dock__meta { font-size: var(--text-sm); font-weight: 700; color: var(--ink-2); }
.dock__row { display: flex; align-items: center; gap: var(--s2); }
.dock__main { flex: 1; min-width: 0; display: flex; justify-content: center; }
.dock__nav {
  width: var(--tap-lg); height: var(--tap-lg); flex: none;
  display: grid; place-items: center;
  border-radius: var(--r-control);
  border: 2px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
}
.dock__row--nav { justify-content: space-between; }
.dock__row--nav .dock__nav { display: inline-flex; align-items: center; width: auto; flex: 0 1 auto; min-width: var(--tap-lg); max-width: 48%; padding: 0 var(--s3); gap: var(--s1); font-weight: 700; font-size: var(--text-md); white-space: nowrap; overflow: hidden; }
.dock__row--nav .dock__nav span { overflow: hidden; text-overflow: ellipsis; }
.dock__row--nav .dock__nav svg { flex: none; }
.dock__row--nav .dock__nav:disabled { visibility: hidden; }
.dock__nav:disabled { border-color: var(--line); color: var(--ink-2); background: var(--surface-sunk); }

/* sheet */
.sheet-title { display: flex; align-items: baseline; gap: var(--s3); }
.sheet-title__court { font-size: var(--num-lg); line-height: 1; }
.scoreform { display: flex; flex-direction: column; gap: var(--s2); }
.team-in { display: flex; align-items: center; gap: var(--s3); }
.team-in__names {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.2;
}
.score-in {
  width: 88px;
  height: 72px;
  flex: none;
  text-align: center;
  font-size: var(--num-lg);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-tile);
  background: var(--surface);
  color: var(--ink);
  scroll-margin-bottom: 160px;
}
.score-in:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.score-in[aria-invalid='true'] { border-color: var(--bad); }
.field-err { color: var(--bad); font-weight: 700; font-size: var(--text-sm); text-align: right; }
.sheet-net {
  height: 2px; margin: var(--s2) 0;
  background: repeating-linear-gradient(90deg, var(--net) 0 6px, transparent 6px 10px);
}
.was { font-size: var(--text-sm); }

.menu { display: flex; flex-direction: column; gap: var(--s1); }
.menu__item {
  display: flex; align-items: center; gap: var(--s3);
  min-height: var(--tap-lg);
  padding: 0 var(--s3);
  border: 0; border-radius: var(--r-control);
  background: var(--surface-sunk);
  color: var(--ink);
  font-weight: 700;
  text-align: left;
}
.menu__item--bad { color: var(--bad); }

.offscreen { position: fixed; left: -10000px; top: 0; }
</style>
