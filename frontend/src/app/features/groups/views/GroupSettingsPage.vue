<script setup lang="ts">
/**
 * League settings (organizers only): name, rating system, pairing rules, payments,
 * history import, and league tools (recalculate, duplicate, archive).
 */
import { ref, computed, watch, useId } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { AlertTriangle, RefreshCw, Copy, Archive } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { useAuthStore } from '@/stores/auth'
import { groupsApi } from '../services/groups.api'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiStepper from '@/app/core/ui/UiStepper.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
import SaveStatus from '@/app/core/ui/SaveStatus.vue'
import { confirm, toast, announce } from '@/app/core/ui/feedback'
import HistoryImport from '../components/HistoryImport.vue'
import LeagueCrest from '@/app/core/ui/LeagueCrest.vue'
import PhotoControl from '@/app/core/ui/PhotoControl.vue'
import { leagueLogoPath } from '@/app/core/ui/photo'
import { RATING_SYSTEMS } from '../ratingSystems'
import {
  toForm, validate, toRequest, diff, systemDefaults,
  CURRENCIES, ROUNDS_MIN, ROUNDS_MAX, type SettingsForm, type RatingSystem
} from '../components/settingsForm'

const route = useRoute()
const router = useRouter()
const league = useLeagueStore()
const auth = useAuthStore()
const groupId = computed(() => route.params.groupId as string)
const currencyId = useId()

const form = ref<SettingsForm | null>(null)
const saved = ref<SettingsForm | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
const saveError = ref('')
const formEl = ref<HTMLFormElement | null>(null)

const isOwner = computed(() => !!league.group && league.group.ownerUserId === auth.userId)
const errors = computed(() => (form.value ? validate(form.value) : {}))
const errorCount = computed(() => Object.keys(errors.value).length)
const changes = computed(() => (form.value && saved.value ? diff(saved.value, form.value) : { rename: false, settings: false }))
const dirty = computed(() => changes.value.rename || changes.value.settings)

watch(groupId, id => {
  form.value = null
  saved.value = null
  void league.load(id)
}, { immediate: true })

// Fill the form once per league; later store refreshes must not wipe edits in progress.
watch(() => league.group, g => {
  if (!g || g.id !== groupId.value || form.value) return
  form.value = toForm(g)
  saved.value = toForm(g)
}, { immediate: true })

watch(dirty, d => { if (d && saveState.value === 'saved') saveState.value = 'idle' })

onBeforeRouteLeave(async () => {
  if (!dirty.value || saveState.value === 'saving') return true
  return confirm({
    title: 'Leave without saving?',
    body: 'Your changes to these settings are not saved yet.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
    danger: true
  })
})

function pickSystem(system: RatingSystem) {
  if (!form.value || form.value.ratingSystem === system) return
  const d = systemDefaults(system)
  form.value.ratingSystem = system
  form.value.kFactor = String(d.kFactor)
  form.value.eloConst = String(d.eloConst)
  announce(`K-factor set to ${d.kFactor} and rating constant set to ${d.eloConst} for this system.`)
}

async function save() {
  const f = form.value
  if (!f || !dirty.value || saveState.value === 'saving') return
  if (errorCount.value) {
    announce(`Fix ${errorCount.value} ${errorCount.value === 1 ? 'field' : 'fields'} before saving.`, true)
    formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  const { rename, settings } = changes.value
  const snapshot: SettingsForm = { ...f }
  saveState.value = 'saving'
  saveError.value = ''
  try {
    if (rename) {
      await groupsApi.rename(groupId.value, snapshot.name.trim())
      saved.value = { ...saved.value!, name: snapshot.name }
    }
    if (settings) await groupsApi.updateSettings(groupId.value, toRequest(snapshot))
    saved.value = snapshot
    saveState.value = 'saved'
    toast('Settings saved')
    await league.load(groupId.value, true)
  } catch (e) {
    // Keep the edits on screen so the organizer can retry.
    saveError.value = (e as { message?: string }).message || 'Check your connection and try again.'
    saveState.value = 'failed'
    announce(`Settings not saved. ${saveError.value}`, true)
  }
}

const recalculating = ref(false)
const recalcResult = ref('')
async function recalculate() {
  const ok = await confirm({
    title: 'Recalculate all ratings?',
    body: 'Every rating resets to the starting rating and is rebuilt from all completed events with the current settings. Standings may change.',
    confirmLabel: 'Recalculate ratings'
  })
  if (!ok) return
  recalculating.value = true
  recalcResult.value = ''
  try {
    const r = await groupsApi.recalculateRatings(groupId.value)
    recalcResult.value = `Ratings recalculated from ${r.eventsRecalculated} events. ${r.playersUpdated} players updated.`
    toast('Ratings recalculated')
    await league.load(groupId.value, true)
  } catch (e) {
    toast((e as { message?: string }).message || 'Ratings not recalculated', 'bad')
  } finally {
    recalculating.value = false
  }
}

const duplicating = ref(false)
async function duplicate() {
  const ok = await confirm({
    title: 'Duplicate this league?',
    body: 'The copy gets the same players and settings. Ratings, events, and payments start fresh.',
    confirmLabel: 'Duplicate league'
  })
  if (!ok) return
  duplicating.value = true
  try {
    const copy = await groupsApi.duplicate(groupId.value)
    toast(`Created ${copy.name}`)
    await router.push(`/groups/${copy.id}`)
  } catch (e) {
    toast((e as { message?: string }).message || 'League not duplicated', 'bad')
  } finally {
    duplicating.value = false
  }
}

const archiving = ref(false)
async function archive() {
  const ok = await confirm({
    title: `Archive ${league.group?.name ?? 'this league'}?`,
    body: 'It disappears from everyone’s league list and can no longer be opened.',
    confirmLabel: 'Archive league',
    danger: true
  })
  if (!ok) return
  archiving.value = true
  try {
    await groupsApi.archive(groupId.value)
    toast('League archived')
    league.reset()
    await router.replace('/groups')
  } catch (e) {
    toast((e as { message?: string }).message || 'League not archived', 'bad')
    archiving.value = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeader title="League settings" :back-to="`/groups/${groupId}`" :back-label="league.group?.name || 'League'" />

    <UiState v-if="league.loading && !league.group" kind="loading" title="Loading settings" />
    <UiState
      v-else-if="league.error?.status === 403 || league.error?.status === 404"
      kind="denied"
      title="This league isn't available to you"
      body="It may have been archived, or your account isn't on its roster."
      action-label="See your leagues"
      action-to="/groups"
    />
    <UiState v-else-if="league.error" kind="error" title="Settings didn't load" :body="league.error.message" @retry="league.load(groupId, true)" />
    <UiState
      v-else-if="league.group && !league.isOrganizer"
      kind="denied"
      title="Only organizers change settings"
      body="Ask a league organizer if something about ratings, pairings, or payments needs to change."
      action-label="Back to league"
      :action-to="`/groups/${groupId}`"
    />

    <template v-else-if="league.group && form">
      <section class="section" aria-labelledby="logo-h">
        <h2 id="logo-h">League logo</h2>
        <div class="logo">
          <LeagueCrest :name="league.group.name" :logo="league.group" size="lg" />
          <PhotoControl
            kind="logo"
            :path="leagueLogoPath(groupId)"
            :version="league.group.logoVersion"
            @changed="(v: number | null) => { if (league.group) league.group.logoVersion = v }"
          />
        </div>
        <p class="muted hint">Any JPEG, PNG or WebP. You can zoom and move it to fit. Everyone in the league sees it.</p>
      </section>
      <p class="warn"><AlertTriangle :size="20" aria-hidden="true" /> <span>Changes affect future events; historical events remain recorded.</span></p>

      <form id="settings-form" ref="formEl" class="form" novalidate @submit.prevent="save">
        <UiField v-model="form.name" label="League name" autocomplete="off" :maxlength="100" :error="errors.name" />

        <fieldset class="group">
          <legend>Rating system</legend>
          <label v-for="s in RATING_SYSTEMS" :key="s.value" class="choice" :class="{ 'choice--on': form.ratingSystem === s.value }">
            <input type="radio" name="system" :value="s.value" :checked="form.ratingSystem === s.value" @change="pickSystem(s.value)">
            <span class="choice__text">
              <span class="choice__title">{{ s.label }}</span>
              <span class="muted choice__desc">{{ s.desc }}</span>
            </span>
          </label>
          <UiField v-model="form.initialRating" label="Starting rating" inputmode="numeric" hint="New players start here. 0 to 3000." :error="errors.initialRating" />
          <UiField v-model="form.kFactor" label="K-factor" inputmode="decimal" hint="How far one game moves a rating. 1 to 200." :error="errors.kFactor" />
          <UiField
            v-model="form.eloConst"
            label="Rating constant"
            inputmode="decimal"
            :hint="form.ratingSystem === 'RACS_ELO' ? 'How strongly rating gaps predict results. 0.1 to 1.' : 'How strongly rating gaps predict results. 100 to 800.'"
            :error="errors.eloConst"
          />
        </fieldset>

        <fieldset class="group">
          <legend>Events</legend>
          <UiStepper v-model="form.defaultRounds" label="Default rounds" :min="ROUNDS_MIN" :max="ROUNDS_MAX" />
          <p class="muted hint">Filled in when you start a new event. You can change it each time.</p>
        </fieldset>

        <fieldset class="group">
          <legend>Pairing rules</legend>
          <label class="check"><input v-model="form.noRepeatTeammateInEvent" type="checkbox"> <span>No repeat partners within an event</span></label>
          <label class="check"><input v-model="form.noRepeatTeammateFromPreviousEvent" type="checkbox"> <span>No partners from the previous event</span></label>
          <label class="check"><input v-model="form.noRepeatOpponentInEvent" type="checkbox"> <span>No repeat opponents within an event</span></label>
        </fieldset>

        <fieldset class="group">
          <legend>Team balance</legend>
          <UiField v-model="form.eloDiffPct" label="Largest rating gap between teams (%)" inputmode="decimal" hint="1 to 50. Smaller makes closer games but is harder to schedule." :error="errors.eloDiffPct" />
          <label class="check"><input v-model="form.autoRelaxEloDiff" type="checkbox"> <span>Widen the gap if no schedule fits</span></label>
          <template v-if="form.autoRelaxEloDiff">
            <UiField v-model="form.autoRelaxStepPct" label="Widen by (%)" inputmode="decimal" hint="Each retry adds this much. 0.5 to 10." :error="errors.autoRelaxStepPct" />
            <UiField v-model="form.autoRelaxMaxPct" label="Widest gap allowed (%)" inputmode="decimal" hint="10 to 50." :error="errors.autoRelaxMaxPct" />
          </template>
        </fieldset>

        <fieldset class="group">
          <legend>Sub payments</legend>
          <label class="check"><input v-model="form.trackPayments" type="checkbox"> <span>Track what subs owe</span></label>
          <template v-if="form.trackPayments">
            <UiField v-model="form.subFee" label="Fee per event attended" inputmode="decimal" hint="Charged to a sub each time they play. 0 to 1000." :error="errors.subFee" />
            <div class="select">
              <label :for="currencyId">Currency</label>
              <select :id="currencyId" v-model="form.currency">
                <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </template>
        </fieldset>

      </form>

      <HistoryImport :group-id="groupId" @imported="league.load(groupId, true)" />

      <section class="section tools" aria-labelledby="tools-h">
        <h2 id="tools-h">League tools</h2>
        <div class="tool">
          <p><strong>Recalculate ratings</strong><br><span class="muted">Rebuild every rating from completed events using the current settings.</span></p>
          <UiButton :loading="recalculating" @click="recalculate"><RefreshCw :size="18" aria-hidden="true" /> Recalculate ratings</UiButton>
          <p v-if="recalcResult" class="muted" role="status">{{ recalcResult }}</p>
        </div>
        <div class="tool">
          <p><strong>Duplicate league</strong><br><span class="muted">Start a new season with the same players and settings.</span></p>
          <UiButton :loading="duplicating" @click="duplicate"><Copy :size="18" aria-hidden="true" /> Duplicate league</UiButton>
        </div>
        <div v-if="isOwner" class="tool">
          <p><strong>Archive league</strong><br><span class="muted">Hide it from everyone's league list. Only the league owner can do this.</span></p>
          <UiButton variant="danger" :loading="archiving" @click="archive"><Archive :size="18" aria-hidden="true" /> Archive league</UiButton>
        </div>
      </section>

      <ActionBar above-tabs>
        <template #meta>
          <SaveStatus v-if="saveState === 'saving' || saveState === 'failed'" :state="saveState" :failed-text="`Not saved. ${saveError}`" />
          <SaveStatus v-else-if="saveState === 'saved' && !dirty" state="saved" />
          <span v-else-if="dirty && errorCount">{{ errorCount }} {{ errorCount === 1 ? 'field needs' : 'fields need' }} fixing</span>
          <span v-else-if="dirty">Unsaved changes</span>
          <span v-else>No changes</span>
        </template>
        <UiButton type="submit" form="settings-form" variant="primary" size="lg" :disabled="!dirty" :loading="saveState === 'saving'">
          {{ saveState === 'failed' ? 'Try saving again' : 'Save settings' }}
        </UiButton>
      </ActionBar>
    </template>
  </div>
</template>

<style scoped>
.warn {
  display: flex; gap: var(--s2); align-items: flex-start;
  padding: var(--s3);
  border-radius: var(--r-tile);
  background: var(--wait-tint);
  color: var(--ink);
  font-weight: 700;
  font-size: var(--text-sm);
}
.warn svg { flex: none; }
.form { display: flex; flex-direction: column; gap: var(--s6); }
.group { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s3); min-width: 0; }
legend { font-size: var(--text-md); font-weight: 700; padding: 0; margin-bottom: var(--s2); }
.hint { font-size: var(--text-sm); }

.choice, .check {
  display: flex; align-items: flex-start; gap: var(--s3);
  min-height: var(--tap);
  padding: var(--s3);
  border: 2px solid var(--line);
  border-radius: var(--r-control);
  cursor: pointer;
}
.check { border: 0; padding: var(--s2) 0; align-items: center; }
.choice--on { border-color: var(--court); background: var(--court-tint); }
.choice input, .check input { flex: none; width: 24px; height: 24px; margin: 0; accent-color: var(--court); }
.choice input { margin-top: 2px; }
.choice:has(input:focus-visible), .check:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; }
.choice input:focus-visible, .check input:focus-visible { outline: none; }
.choice__text { display: flex; flex-direction: column; min-width: 0; }
.choice__title { font-weight: 700; }
.choice__desc { font-size: var(--text-sm); }

.select { display: flex; flex-direction: column; gap: var(--s1); }
.select label { font-weight: 700; font-size: var(--text-sm); }
.select select {
  width: 100%;
  min-height: var(--tap);
  padding: var(--s2) var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--text-md);
}
.select select:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }

.tools { gap: var(--s5); }
.tool { display: flex; flex-direction: column; gap: var(--s2); align-items: flex-start; }
.logo { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s4); }
</style>
