<script setup lang="ts">
/**
 * Sub payments (organizers, when the league tracks payments): who owes what,
 * record payments and adjustments, per-player history, mark paid, backfill old charges.
 */
import { ref, computed, watch, useId } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { paymentsApi } from '../services/payments.api'
import type { SubBalanceDto, PaymentHistoryResponse } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiState from '@/app/core/ui/UiState.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
import { confirm, toast, announce } from '@/app/core/ui/feedback'
import {
  formatMoney, balanceText, balanceKind, sortBalances, parseAmount, notesError,
  historyAmount, historyLabel, MAX_NOTES
} from '../money'

const route = useRoute()
const league = useLeagueStore()
const groupId = computed(() => route.params.groupId as string)
const playerSelectId = useId()

const balances = ref<SubBalanceDto[]>([])
const totalOwed = ref(0)
const loading = ref(false)
const loadError = ref('')

const currency = computed(() => league.group?.settings.paymentSettings?.currency || 'USD')
const money = (n: number) => formatMoney(n, currency.value)
const sorted = computed(() => sortBalances(balances.value))
const owingCount = computed(() => balances.value.filter(b => balanceKind(b.balance) === 'owes').length)
// Sections carry the meaning, so each row only shows the amount.
const groups = computed(() => ([
  { kind: 'owes', title: 'Owe money', hidden: 'owes' },
  { kind: 'credit', title: 'In credit', hidden: 'in credit' },
  { kind: 'settled', title: 'Paid up', hidden: '' }
] as const).map(g => ({ ...g, list: sorted.value.filter(b => balanceKind(b.balance) === g.kind) })).filter(g => g.list.length))
/** Balance as words around a money amount, so the amount can use the number face. */
function balParts(balance: number): [string, string, string] {
  const kind = balanceKind(balance)
  if (kind === 'owes') return ['Owes ', money(-balance), '']
  if (kind === 'credit') return ['', money(balance), ' credit']
  return ['Paid up', '', '']
}
const canView = computed(() => league.isOrganizer && league.trackPayments)

async function loadBalances() {
  loading.value = !balances.value.length
  loadError.value = ''
  try {
    const r = await paymentsApi.getBalances(groupId.value, kept => {
      balances.value = kept.balances
      totalOwed.value = kept.totalOwed
      loading.value = false
    })
    balances.value = r.balances
    totalOwed.value = r.totalOwed
  } catch (e) {
    if (!balances.value.length) loadError.value = (e as { message?: string }).message || 'Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

watch(groupId, id => { void league.load(id) }, { immediate: true })
watch(() => [league.group?.id, canView.value] as const, ([gid, ok]) => {
  if (gid === groupId.value && ok) void loadBalances()
}, { immediate: true })

/* ---------- player sheet: history, record payment, adjustment ---------- */
type Mode = 'history' | 'payment' | 'adjust'
const sheetOpen = ref(false)
const mode = ref<Mode>('history')
const player = ref<SubBalanceDto | null>(null)
const history = ref<PaymentHistoryResponse | null>(null)
const historyLoading = ref(false)
const historyError = ref('')

const pickedId = ref('')
const amount = ref('')
const notes = ref('')
const direction = ref<'credit' | 'charge'>('credit')
const submitted = ref(false)
const submitting = ref(false)
const formError = ref('')

const parsed = computed(() => parseAmount(amount.value))
const amountError = computed(() => (submitted.value && 'error' in parsed.value ? parsed.value.error : undefined))
const notesErr = computed(() => notesError(notes.value))
const target = computed(() => player.value ?? balances.value.find(b => b.groupPlayerId === pickedId.value) ?? null)

const sheetTitle = computed(() => {
  if (mode.value === 'payment') return 'Record payment'
  if (mode.value === 'adjust') return 'Adjust balance'
  return player.value?.displayName ?? 'Payment history'
})

async function openHistory(b: SubBalanceDto) {
  player.value = b
  mode.value = 'history'
  sheetOpen.value = true
  await loadHistory(b)
}

async function loadHistory(b: SubBalanceDto) {
  history.value = null
  historyError.value = ''
  historyLoading.value = true
  try {
    history.value = await paymentsApi.getHistory(groupId.value, b.groupPlayerId)
  } catch (e) {
    historyError.value = (e as { message?: string }).message || 'History didn\'t load.'
  } finally {
    historyLoading.value = false
  }
}

function startForm(m: 'payment' | 'adjust', b: SubBalanceDto | null) {
  player.value = b
  pickedId.value = b?.groupPlayerId ?? sorted.value[0]?.groupPlayerId ?? ''
  mode.value = m
  // Prefill a payment with what they owe; it is the common case.
  amount.value = m === 'payment' && b && b.balance < 0 ? (-b.balance).toFixed(2) : ''
  notes.value = ''
  direction.value = 'credit'
  submitted.value = false
  formError.value = ''
  sheetOpen.value = true
}

function backToHistory() {
  if (!player.value) { sheetOpen.value = false; return }
  mode.value = 'history'
}

async function submit() {
  submitted.value = true
  formError.value = ''
  const t = target.value
  if (!t) { formError.value = 'Choose a player.'; return }
  if ('error' in parsed.value || notesErr.value) {
    announce(amountError.value || notesErr.value || '', true)
    return
  }
  const value = parsed.value.value
  submitting.value = true
  try {
    const body = { groupPlayerId: t.groupPlayerId, notes: notes.value.trim() || undefined }
    if (mode.value === 'payment') {
      await paymentsApi.recordPayment(groupId.value, { ...body, amount: value })
      toast(`Payment of ${money(value)} recorded for ${t.displayName}`)
    } else {
      // Positive adjustment is credit to the sub; negative adds to what they owe.
      await paymentsApi.recordAdjustment(groupId.value, { ...body, amount: direction.value === 'credit' ? value : -value })
      toast(`Adjustment recorded for ${t.displayName}`)
    }
    sheetOpen.value = false
    await loadBalances()
  } catch (e) {
    formError.value = (e as { message?: string }).message || 'Not recorded. Check your connection and try again.'
    announce(formError.value, true)
  } finally {
    submitting.value = false
  }
}

async function markPaid(b: SubBalanceDto) {
  const ok = await confirm({
    title: `Mark ${b.displayName} as paid?`,
    body: `This records a payment of ${money(-b.balance)}, the full amount they owe.`,
    confirmLabel: 'Mark as paid'
  })
  if (!ok) return
  submitting.value = true
  try {
    await paymentsApi.markAllPaid(groupId.value, b.groupPlayerId)
    toast(`${b.displayName} marked as paid`)
    await loadBalances()
    const fresh = balances.value.find(x => x.groupPlayerId === b.groupPlayerId)
    if (sheetOpen.value && fresh) { player.value = fresh; await loadHistory(fresh) }
  } catch (e) {
    toast((e as { message?: string }).message || 'Not marked as paid', 'bad')
  } finally {
    submitting.value = false
  }
}

const backfilling = ref(false)
const backfillResult = ref('')
async function backfill() {
  const fee = league.group?.settings.paymentSettings?.subFeePerAttendance ?? 0
  const ok = await confirm({
    title: 'Charge subs for past events?',
    body: `Each sub is charged ${money(fee)} for every completed event they played before tracking was turned on. Events already charged are skipped.`,
    confirmLabel: 'Charge past events'
  })
  if (!ok) return
  backfilling.value = true
  backfillResult.value = ''
  try {
    const r = await paymentsApi.backfillCharges(groupId.value)
    backfillResult.value = r.chargesCreated
      ? `${r.chargesCreated} charges added from ${r.eventsProcessed} events, ${money(r.totalAmount ?? 0)} in total.`
      : 'No past charges were missing.'
    toast('Past events charged')
    await loadBalances()
  } catch (e) {
    toast((e as { message?: string }).message || 'Past events not charged', 'bad')
  } finally {
    backfilling.value = false
  }
}

const formatDate = (s: string) => new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const visits = (n: number) => `${n} ${n === 1 ? 'event' : 'events'} attended`
</script>

<template>
  <div class="page">
    <PageHeader title="Sub payments" :back-to="`/groups/${groupId}`" :back-label="league.group?.name || 'League'" />

    <UiState v-if="league.loading && !league.group" kind="loading" title="Loading league" />
    <UiState
      v-else-if="league.error?.status === 403 || league.error?.status === 404"
      kind="denied"
      title="This league isn't available to you"
      body="It may have been archived, or your account isn't on its roster."
      action-label="See your leagues"
      action-to="/groups"
    />
    <UiState v-else-if="league.error" kind="error" title="League didn't load" :body="league.error.message" @retry="league.load(groupId, true)" />
    <UiState
      v-else-if="league.group && !league.isOrganizer"
      kind="denied"
      title="Only organizers see payments"
      body="Ask a league organizer what you owe."
      action-label="Back to league"
      :action-to="`/groups/${groupId}`"
    />
    <UiState
      v-else-if="league.group && !league.trackPayments"
      kind="empty"
      title="Payment tracking is off"
      body="Turn it on in league settings to charge subs a fee each time they play and record what they pay."
      action-label="Open league settings"
      :action-to="`/groups/${groupId}/settings`"
    />

    <template v-else-if="league.group">
      <UiState v-if="loading && !balances.length" kind="loading" title="Loading balances" />
      <UiState v-else-if="loadError" kind="error" title="Balances didn't load" :body="loadError" @retry="loadBalances" />
      <UiState
        v-else-if="!balances.length"
        kind="empty"
        title="No subs yet"
        body="Subs appear here with their balance after they play in an event."
      />

      <template v-else>
        <section class="summary" aria-labelledby="owed-h">
          <h2 id="owed-h" class="summary__label">Total owed</h2>
          <p class="summary__value num">{{ money(totalOwed) }}</p>
          <p class="muted">{{ owingCount ? `${owingCount} of ${balances.length} subs owe money.` : `All ${balances.length} subs are paid up.` }}</p>
        </section>

        <section v-for="g in groups" :key="g.kind" class="section" :aria-labelledby="`subs-${g.kind}-h`">
          <h2 :id="`subs-${g.kind}-h`">{{ g.title }}</h2>
          <ul role="list" class="list">
            <li v-for="b in g.list" :key="b.groupPlayerId">
              <button type="button" class="row" @click="openHistory(b)">
                <span class="row__text">
                  <span class="row__name truncate">{{ b.displayName }}</span>
                  <span class="muted row__sub">{{ visits(b.totalAttendances) }}</span>
                </span>
                <span v-if="g.kind !== 'settled'" class="bal num">
                  <span class="visually-hidden">{{ g.hidden }} </span>{{ money(Math.abs(b.balance)) }}
                </span>
                <ChevronRight :size="18" aria-hidden="true" class="row__chev" />
              </button>
            </li>
          </ul>
        </section>
      </template>

      <section class="section" aria-labelledby="backfill-h">
        <h2 id="backfill-h">Past events</h2>
        <p class="muted">Turned tracking on mid-season? Charge subs for the events they already played.</p>
        <UiButton :loading="backfilling" @click="backfill">Charge past events</UiButton>
        <p v-if="backfillResult" role="status">{{ backfillResult }}</p>
      </section>

      <ActionBar v-if="balances.length" above-tabs>
        <UiButton variant="primary" size="lg" @click="startForm('payment', null)">Record payment</UiButton>
      </ActionBar>
    </template>

    <UiSheet :open="sheetOpen" :title="sheetTitle" @close="sheetOpen = false">
      <!-- History -->
      <template v-if="mode === 'history' && player">
        <p class="sheet-bal" :class="`bal--${balanceKind(history?.currentBalance ?? player.balance)}`">
          <template v-for="(part, i) in balParts(history?.currentBalance ?? player.balance)" :key="i"><span v-if="i === 1" class="num">{{ part }}</span><template v-else>{{ part }}</template></template>
        </p>
        <dl class="facts">
          <div><dt>Charged</dt><dd class="num">{{ money(player.totalCharges) }}</dd></div>
          <div><dt>Paid</dt><dd class="num">{{ money(player.totalPayments) }}</dd></div>
          <div><dt>Events</dt><dd class="num">{{ player.totalAttendances }}</dd></div>
        </dl>
        <p v-if="player.lastPaymentDate" class="muted">Last payment {{ formatDate(player.lastPaymentDate) }}</p>
        <div class="sheet-actions">
          <UiButton variant="primary" @click="startForm('payment', player)">Record payment</UiButton>
          <UiButton v-if="balanceKind(player.balance) === 'owes'" :disabled="submitting" @click="markPaid(player)">Mark as paid</UiButton>
          <UiButton variant="quiet" @click="startForm('adjust', player)">Adjust balance</UiButton>
        </div>

        <h3 class="hist-h">History</h3>
        <UiState v-if="historyLoading" kind="loading" title="Loading history" />
        <p v-else-if="historyError" class="error" role="alert">{{ historyError }}</p>
        <p v-else-if="history && !history.history.length" class="muted">No charges or payments yet.</p>
        <ul v-else-if="history" role="list" class="hist">
          <li v-for="h in history.history" :key="h.id" class="hist__row">
            <span class="hist__main">
              <span class="hist__type">{{ historyLabel(h.paymentType) }}</span>
              <span class="muted hist__sub">{{ formatDate(h.createdAt) }}<template v-if="h.eventName">, {{ h.eventName }}</template></span>
              <span v-if="h.notes" class="hist__notes">{{ h.notes }}</span>
            </span>
            <span class="num hist__amt">{{ historyAmount(h.amount, currency) }}</span>
          </li>
        </ul>
      </template>

      <!-- Payment / adjustment form -->
      <form v-else id="pay-form" class="pay-form" novalidate @submit.prevent="submit">
        <div v-if="!player" class="select">
          <label :for="playerSelectId">Player</label>
          <select :id="playerSelectId" v-model="pickedId">
            <option v-for="b in sorted" :key="b.groupPlayerId" :value="b.groupPlayerId">{{ b.displayName }}, {{ balanceText(b.balance, currency).toLowerCase() }}</option>
          </select>
        </div>
        <p v-else>
          <strong>{{ player.displayName }}</strong>.
          <template v-for="(part, i) in balParts(player.balance)" :key="i"><span v-if="i === 1" class="num">{{ part }}</span><template v-else>{{ part }}</template></template>.
        </p>

        <fieldset v-if="mode === 'adjust'" class="dir">
          <legend>Type of adjustment</legend>
          <label class="radio"><input v-model="direction" type="radio" value="credit"> <span>Credit: lowers what they owe</span></label>
          <label class="radio"><input v-model="direction" type="radio" value="charge"> <span>Charge: adds to what they owe</span></label>
        </fieldset>

        <UiField v-model="amount" :label="`Amount (${currency})`" inputmode="decimal" autocomplete="off" hint="Up to 10,000." :error="amountError" />
        <UiField v-model="notes" label="Notes" multiline hint="Optional. For example, cash or e-transfer." :error="notesErr" />
        <p class="muted count" aria-live="polite">{{ notes.length }} of {{ MAX_NOTES }} characters</p>
        <p v-if="formError" class="error" role="alert">{{ formError }}</p>
      </form>

      <template v-if="mode !== 'history'" #actions>
        <UiButton variant="quiet" @click="backToHistory">{{ player ? 'Back' : 'Cancel' }}</UiButton>
        <UiButton type="submit" form="pay-form" variant="primary" :loading="submitting">
          {{ mode === 'payment' ? 'Record payment' : 'Save adjustment' }}
        </UiButton>
      </template>
    </UiSheet>
  </div>
</template>

<style scoped>
.summary { display: flex; flex-direction: column; gap: var(--s1); padding: var(--s4); border-radius: var(--r-tile); background: var(--surface-sunk); }
.summary__label { font-size: var(--text-sm); font-weight: 700; }
.summary__value { font-size: var(--num-lg); line-height: 1; overflow-wrap: anywhere; }

.list { display: flex; flex-direction: column; }
.row {
  width: 100%;
  display: flex; align-items: center; gap: var(--s2);
  min-height: 60px;
  padding: var(--s2) 0;
  border: 0; border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.row:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; border-radius: 6px; }
.row__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row__name { font-weight: 700; }
.row__sub { font-size: var(--text-sm); }
.row__chev { flex: none; color: var(--ink-2); }

.bal { flex: none; font-size: var(--text-lg); text-align: right; }
.bal--owes { background: var(--bad-tint); color: var(--ink); }
.bal--credit { background: var(--ok-tint); color: var(--ink); }
.bal--settled { color: var(--ink-2); }

.sheet-bal .num { font-size: var(--num-md); }
.sheet-bal { display: inline-block; align-self: flex-start; padding: var(--s1) var(--s3); border-radius: 6px; font-size: var(--text-lg); font-weight: 700; }
.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s2); margin: var(--s3) 0; }
.facts dt { font-size: var(--text-sm); color: var(--ink-2); }
.facts dd { margin: 0; font-size: var(--text-lg); overflow-wrap: anywhere; }
.sheet-actions { display: flex; flex-wrap: wrap; gap: var(--s2); margin: var(--s3) 0; }
.sheet-actions > * { flex: 1 1 140px; }
.hist-h { font-size: var(--text-md); margin-top: var(--s3); }
.hist { display: flex; flex-direction: column; }
.hist__row { display: flex; gap: var(--s3); align-items: flex-start; padding: var(--s2) 0; border-bottom: 1px solid var(--line); }
.hist__main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.hist__type { font-weight: 700; }
.hist__sub, .hist__notes { font-size: var(--text-sm); overflow-wrap: anywhere; }
.hist__amt { flex: none; font-size: var(--text-lg); }

.pay-form { display: flex; flex-direction: column; gap: var(--s4); }
.dir { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s1); min-width: 0; }
.dir legend { font-weight: 700; font-size: var(--text-sm); padding: 0; margin-bottom: var(--s1); }
.radio { display: flex; align-items: center; gap: var(--s3); min-height: var(--tap); cursor: pointer; }
.radio input { flex: none; width: 24px; height: 24px; margin: 0; accent-color: var(--court); }
.radio:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
.select { display: flex; flex-direction: column; gap: var(--s1); }
.select label { font-weight: 700; font-size: var(--text-sm); }
.select select {
  width: 100%; min-height: var(--tap);
  padding: var(--s2) var(--s3);
  border: 2px solid var(--line-strong); border-radius: var(--r-control);
  background: var(--surface); color: var(--ink); font-size: var(--text-md);
}
.select select:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
.count { font-size: var(--text-sm); margin-top: calc(var(--s3) * -1); }
.error { color: var(--bad); font-weight: 700; }
</style>
