<script setup lang="ts">
/**
 * Organizer corrections to a completed event, one round at a time.
 * Score changes, game deletes and player swaps are staged locally and sent together;
 * saving recalculates ratings for the whole league.
 */
import { ref, reactive, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Trash2, Undo2, ArrowLeftRight } from 'lucide-vue-next'
import type { EventDto, GameDto } from '@/app/core/models/dto'
import { eventsApi } from '@/app/features/events/services/events.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import { eventTitle, formatDay, gamesByRound } from '@/app/features/events/eventProgress'
import { digitsOnly } from '@/app/features/events/scoreInput'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import { confirm, announce } from '@/app/core/ui/feedback'
import {
  emptyStaged, resetStaged, stageScore, currentScores, currentLineup, swapPlayers, stageDelete, undoDelete,
  isDeleted, changeCount, isDirty, scoreErrors, saveCorrections, nameMap, type Pick, type Slot, type SaveFailure
} from '../corrections'

const props = defineProps<{ open: boolean; event: EventDto | null; groupId: string; focusGameId?: string }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const staged = reactive(emptyStaged())
const selected = ref<Pick | null>(null)
const round = ref(0)
const saving = ref(false)
const failures = ref<SaveFailure[]>([])
const recalcError = ref('')
const showErrors = ref(false)

const games = computed(() => props.event?.games ?? [])
const rounds = computed(() => (props.event ? gamesByRound(props.event) : []))
const roundGames = computed(() => rounds.value[round.value] ?? [])
const names = computed(() => nameMap(games.value))
const count = computed(() => changeCount(staged))
const dirty = computed(() => isDirty(staged))
const errors = computed(() => scoreErrors(staged))
const hasErrors = computed(() => Object.keys(errors.value).length > 0)
const changedRounds = computed(() => {
  const ids = new Set([...Object.keys(staged.scores), ...Object.keys(staged.swaps), ...staged.deletes])
  return new Set(games.value.filter(g => ids.has(g.id)).map(g => g.roundIndex))
})

const sideNames = (g: GameDto, side: 1 | 2) => {
  const l = currentLineup(staged, g)
  return side === 1 ? [names.value[l.team1P1], names.value[l.team1P2]] : [names.value[l.team2P1], names.value[l.team2P2]]
}
const slotsFor = (side: 1 | 2): Slot[] => (side === 1 ? ['team1P1', 'team1P2'] : ['team2P1', 'team2P2'])
const isSel = (g: GameDto, slot: Slot) => selected.value?.gameId === g.id && selected.value.slot === slot
const nameAt = (p: Pick) => {
  const g = games.value.find(x => x.id === p.gameId)
  return g ? names.value[currentLineup(staged, g)[p.slot]] : ''
}
const courtOf = (gameId: string) => {
  const g = games.value.find(x => x.id === gameId)
  return g ? `Court ${g.courtIndex + 1}, round ${g.roundIndex + 1}` : 'A game'
}

watch(() => [props.open, props.event?.id], () => {
  if (!props.open || !props.event) return
  resetStaged(staged)
  selected.value = null
  failures.value = []
  recalcError.value = ''
  showErrors.value = false
  const focus = games.value.find(g => g.id === props.focusGameId)
  round.value = focus ? focus.roundIndex : 0
}, { immediate: true })

function goRound(i: number) {
  round.value = i
  selected.value = null
}

function onScore(g: GameDto, side: 1 | 2, e: Event) {
  const el = e.target as HTMLInputElement
  const v = digitsOnly(el.value)
  if (v !== el.value) el.value = v
  stageScore(staged, g, side, v)
}

function pickPlayer(g: GameDto, slot: Slot) {
  const here = { gameId: g.id, slot }
  if (!selected.value) {
    selected.value = here
    announce(`${nameAt(here)} selected. Choose another player in round ${g.roundIndex + 1} to swap with.`)
    return
  }
  if (isSel(g, slot)) {
    selected.value = null
    announce('Swap cancelled.')
    return
  }
  const a = selected.value
  const first = nameAt(a)
  const second = nameAt(here)
  const err = swapPlayers(staged, games.value, a, here)
  selected.value = null
  announce(err ?? `${first} and ${second} swapped.`, !!err)
}

function toggleDelete(g: GameDto) {
  if (isDeleted(staged, g.id)) {
    undoDelete(staged, g.id)
    announce(`Court ${g.courtIndex + 1} kept.`)
  } else {
    stageDelete(staged, g.id)
    if (selected.value?.gameId === g.id) selected.value = null
    announce(`Court ${g.courtIndex + 1} will be deleted when you save.`)
  }
}

async function requestClose() {
  if (saving.value) return
  if (dirty.value && !(await confirmDiscard())) return
  emit('close')
}

function confirmDiscard() {
  return count.value
    ? confirm({ title: `Discard ${count.value} ${count.value === 1 ? 'change' : 'changes'}?`, body: 'Nothing you changed here has been saved yet.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true })
    : confirm({ title: 'Leave without recalculating?', body: 'Your corrections were saved, but ratings were not recalculated. Save again to recalculate them.', confirmLabel: 'Leave anyway', cancelLabel: 'Stay', danger: true })
}

async function save() {
  if (!props.event || !dirty.value) return
  if (hasErrors.value) {
    showErrors.value = true
    const firstBad = games.value.find(g => errors.value[g.id])
    if (firstBad) round.value = firstBad.roundIndex
    announce('Some scores are incomplete. Enter both scores or undo the change.', true)
    return
  }
  const deletes = staged.deletes.length
  const ok = await confirm({
    title: count.value ? `Save ${count.value} ${count.value === 1 ? 'change' : 'changes'} to ${eventTitle(props.event)}?` : 'Recalculate ratings?',
    body: `Ratings for the whole league are recalculated.${deletes ? ` ${deletes} deleted ${deletes === 1 ? 'game is' : 'games are'} removed for good.` : ''}`,
    confirmLabel: count.value ? 'Save and recalculate' : 'Recalculate ratings'
  })
  if (!ok) return
  saving.value = true
  failures.value = []
  recalcError.value = ''
  const result = await saveCorrections(staged, {
    deleteGame: id => eventsApi.deleteGame(id),
    updateScore: (id, body) => eventsApi.updateScore(id, body),
    updateGamePlayers: (id, body) => eventsApi.updateGamePlayers(id, body),
    recalculate: () => groupsApi.recalculateRatings(props.groupId)
  })
  saving.value = false
  if (result.ok) {
    emit('saved')
    emit('close')
    return
  }
  failures.value = result.failures
  recalcError.value = result.recalcError ?? ''
  announce('Not everything was saved. Check the message at the top and save again.', true)
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (props.open && dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
watch(() => props.open, open => {
  if (open) window.addEventListener('beforeunload', onBeforeUnload)
  else window.removeEventListener('beforeunload', onBeforeUnload)
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

onBeforeRouteLeave(async () => {
  if (!props.open || !dirty.value) return true
  return confirmDiscard()
})

// keep the focused game's score field ready when opened from a single game
watch(() => props.open, async open => {
  if (!open || !props.focusGameId) return
  await nextTick()
  document.getElementById(`ed-${props.focusGameId}-1`)?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <UiSheet :open="open && !!event" title="Correct scores" close-label="Close corrections" :dismissible="!saving" @close="requestClose">
    <template #title="{ titleId }">
      <div>
        <h2 :id="titleId">Correct scores</h2>
        <p v-if="event" class="muted sub">{{ eventTitle(event) }}<template v-if="event.startsAt">, {{ formatDay(event.startsAt) }}</template></p>
      </div>
    </template>

    <div v-if="event" class="ed">
      <div v-if="failures.length || recalcError" class="notice notice--bad" role="alert">
        <strong>Not everything was saved.</strong>
        <ul v-if="failures.length" role="list">
          <li v-for="f in failures" :key="f.gameId + f.kind">
            {{ courtOf(f.gameId) }}: {{ f.kind === 'delete' ? 'not deleted' : f.kind === 'score' ? 'score not saved' : 'players not swapped' }}. {{ f.message }}
          </li>
        </ul>
        <p v-if="recalcError">Corrections were saved, but ratings were not recalculated. {{ recalcError }}</p>
        <p>Changes that went through are no longer listed. Save again to retry the rest.</p>
      </div>
      <p v-else class="muted intro">
        Tap a score to change it. Tap two players in the same round to swap them. Nothing is sent until you save.
      </p>

      <nav v-if="rounds.length > 1" class="rounds" aria-label="Rounds">
        <button
          v-for="(_, i) in rounds"
          :key="i"
          type="button"
          class="rchip"
          :aria-current="i === round ? 'step' : undefined"
          @click="goRound(i)"
        >
          Round <span class="num">{{ i + 1 }}</span>
          <span v-if="changedRounds.has(i)" class="rchip__dot">, changed</span>
        </button>
      </nav>

      <p class="swap-hint" aria-live="polite">
        <template v-if="selected">
          <ArrowLeftRight :size="18" aria-hidden="true" />
          <span>Swapping <strong>{{ nameAt(selected) }}</strong>. Choose another player in round {{ round + 1 }}.</span>
        </template>
      </p>

      <ol role="list" class="games">
        <li v-for="g in roundGames" :key="g.id">
          <div v-if="isDeleted(staged, g.id)" class="court court--deleted">
            <span class="court__gutter" aria-hidden="true"><span class="court__word">Court</span><span class="num court__num">{{ g.courtIndex + 1 }}</span></span>
            <div class="court__body deleted">
              <p><strong>Court {{ g.courtIndex + 1 }} will be deleted</strong> when you save.</p>
              <UiButton variant="secondary" @click="toggleDelete(g)">
                <Undo2 :size="18" aria-hidden="true" /> Keep court {{ g.courtIndex + 1 }}
              </UiButton>
            </div>
          </div>

          <div v-else class="court" :class="{ 'court--changed': staged.scores[g.id] || staged.swaps[g.id] }">
            <span class="court__gutter" aria-hidden="true"><span class="court__word">Court</span><span class="num court__num">{{ g.courtIndex + 1 }}</span></span>
            <div class="court__body">
              <h3 class="visually-hidden">Court {{ g.courtIndex + 1 }}</h3>
              <template v-for="side in ([1, 2] as const)" :key="side">
                <div v-if="side === 2" class="net" aria-hidden="true" />
                <div class="side">
                  <div class="side__players">
                    <button
                      v-for="(slot, i) in slotsFor(side)"
                      :key="slot"
                      type="button"
                      class="player"
                      :class="{ 'player--sel': isSel(g, slot) }"
                      :aria-pressed="isSel(g, slot)"
                      :aria-label="`${sideNames(g, side)[i]}, court ${g.courtIndex + 1}. ${selected && !isSel(g, slot) ? `Swap with ${nameAt(selected)}` : isSel(g, slot) ? 'Selected for swap, tap to cancel' : 'Select to swap'}`"
                      @click="pickPlayer(g, slot)"
                    >
                      <span class="truncate">{{ sideNames(g, side)[i] }}</span>
                    </button>
                  </div>
                  <label :for="`ed-${g.id}-${side}`" class="visually-hidden">
                    Score for {{ sideNames(g, side).join(' and ') }}, court {{ g.courtIndex + 1 }}
                  </label>
                  <input
                    :id="`ed-${g.id}-${side}`"
                    class="score-in num"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    autocomplete="off"
                    maxlength="2"
                    :value="side === 1 ? currentScores(staged, g).s1 : currentScores(staged, g).s2"
                    :aria-invalid="(showErrors && !!errors[g.id]?.[side === 1 ? 'error1' : 'error2']) || undefined"
                    :aria-describedby="showErrors && errors[g.id] ? `ed-${g.id}-err` : undefined"
                    :data-autofocus="g.id === focusGameId && side === 1 ? '' : undefined"
                    @input="onScore(g, side, $event)"
                  >
                </div>
              </template>
              <p v-if="showErrors && errors[g.id]" :id="`ed-${g.id}-err`" class="field-err">
                {{ errors[g.id].error1 || errors[g.id].error2 }} for both teams.
              </p>
              <div class="court__foot">
                <span v-if="staged.scores[g.id]" class="changed">Score changed</span>
                <span v-if="staged.swaps[g.id]" class="changed">Players swapped</span>
                <button type="button" class="del" @click="toggleDelete(g)">
                  <Trash2 :size="18" aria-hidden="true" /> Delete court {{ g.courtIndex + 1 }}
                </button>
              </div>
            </div>
          </div>
        </li>
      </ol>
    </div>

    <template #actions>
      <p class="meta" aria-live="polite">
        <template v-if="count">{{ count }} {{ count === 1 ? 'change' : 'changes' }} not saved yet.</template>
        <template v-else-if="staged.pendingRecalc">Ratings still need to be recalculated.</template>
        <template v-else>No changes yet.</template>
      </p>
      <UiButton variant="primary" size="lg" block :disabled="!dirty" :loading="saving" @click="save">
        {{ count ? `Save ${count} ${count === 1 ? 'change' : 'changes'}` : 'Recalculate ratings' }}
      </UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.sub { font-size: var(--text-sm); }
.ed { display: flex; flex-direction: column; gap: var(--s3); }
.intro { font-size: var(--text-sm); }

.notice {
  display: flex; flex-direction: column; gap: var(--s1);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-tile);
  background: var(--bad-tint);
  border: 1px solid var(--bad);
  font-size: var(--text-sm);
}
.notice strong { color: var(--bad); }
.notice ul { margin: 0; padding-left: var(--s4); }

.rounds { display: flex; flex-wrap: wrap; gap: 6px; }
.rchip {
  min-height: var(--tap);
  padding: 0 var(--s3);
  border-radius: var(--r-control);
  border: 2px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
}
.rchip .num { font-size: var(--text-lg); }
.rchip[aria-current='step'] { background: var(--optic); color: var(--on-optic); border-color: var(--on-optic); }
.rchip__dot { font-weight: 400; font-size: var(--text-sm); }

.swap-hint { display: flex; align-items: center; gap: var(--s2); min-height: 1.5em; font-size: var(--text-sm); }
.swap-hint:empty { display: none; }

.games { display: flex; flex-direction: column; gap: var(--s3); list-style: none; margin: 0; padding: 0; }

.court {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  background: var(--court-tint);
  border: 2px solid transparent;
  border-radius: var(--r-tile);
  overflow: hidden;
}
.court--changed { border-color: var(--court); }
.court--deleted { background: var(--surface-sunk); }
.court__gutter {
  background: var(--court);
  color: var(--on-court);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.court--deleted .court__gutter { background: var(--line-strong); }
.court__word { font-size: 12px; font-weight: 700; }
.court__num { font-size: var(--num-md); line-height: 1; }
.court__body { min-width: 0; padding: var(--s2) var(--s3); display: flex; flex-direction: column; }
.deleted { gap: var(--s2); align-items: flex-start; padding-block: var(--s3); }

.side { display: flex; align-items: center; gap: var(--s2); }
.side__players { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.player {
  min-height: var(--tap);
  display: flex; align-items: center;
  padding: 0 var(--s2);
  margin-left: calc(var(--s2) * -1);
  border: 2px solid transparent;
  border-radius: var(--r-control);
  background: transparent;
  color: var(--ink);
  font-size: var(--text-md);
  text-align: left;
  min-width: 0;
}
.player:hover { background: var(--surface); }
.player--sel { background: var(--optic); color: var(--on-optic); border-color: var(--on-optic); font-weight: 700; }
.player--sel:hover { background: var(--optic); }

.score-in {
  width: 64px;
  height: 56px;
  flex: none;
  text-align: center;
  font-size: var(--num-md);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--ink);
}
.score-in:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.score-in[aria-invalid='true'] { border-color: var(--bad); }

.net {
  height: 2px;
  margin: 4px 0;
  background: repeating-linear-gradient(90deg, var(--net) 0 6px, transparent 6px 10px);
}
.field-err { color: var(--bad); font-weight: 700; font-size: var(--text-sm); }
.court__foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); margin-top: var(--s1); }
.changed { font-size: var(--text-sm); font-weight: 700; color: var(--court); }
.del {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: var(--s1);
  min-height: var(--tap);
  padding: 0 var(--s2);
  border: 0;
  border-radius: var(--r-control);
  background: transparent;
  color: var(--bad);
  font-weight: 700;
}
.del:hover { background: var(--bad-tint); }
.meta { font-size: var(--text-sm); font-weight: 700; color: var(--ink-2); }
</style>
