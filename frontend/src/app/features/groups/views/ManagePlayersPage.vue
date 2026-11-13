<script setup lang="ts">
/**
 * Organizer roster: who is in the league, as a regular or a sub, and their account link.
 * Rows stay one line tall so a 50-player roster scans quickly; every change lives in the player's sheet.
 */
import { ref, computed, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { Search, ChevronRight, Check } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'
import { groupsApi } from '../services/groups.api'
import { playersApi } from '@/app/features/players/services/players.api'
import { api } from '@/app/core/http/api-client'
import { outbox, whenSettled } from '@/app/core/offline/sync'
import type { OutboxMethod } from '@/app/core/offline/outbox'
import type { GroupPlayerDto, PlayerDto, MembershipType, SkillLevel } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiState from '@/app/core/ui/UiState.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
import { confirm, toast } from '@/app/core/ui/feedback'
import BulkPlayerCreateModal from '@/app/features/players/components/BulkPlayerCreateModal.vue'
import InviteSheet from '@/app/features/players/components/InviteSheet.vue'
import { findByName, inviteUrl, SKILL_LEVELS, skillWord, count } from '@/app/features/players/roster'

const route = useRoute()
const league = useLeagueStore()
const groupId = computed(() => route.params.groupId as string)

watch(groupId, id => { void league.load(id) }, { immediate: true })

const query = ref('')
const regulars = computed(() => findByName(league.players.filter(p => p.membershipType === 'PERMANENT'), query.value))
const subs = computed(() => findByName(league.players.filter(p => p.membershipType === 'SUB'), query.value))
const subCount = computed(() => league.players.filter(p => p.membershipType === 'SUB').length)
const sections = computed(() => [
  { key: 'reg', title: 'Regulars', list: regulars.value },
  { key: 'sub', title: 'Subs', list: subs.value }
].filter(s => s.list.length))

function meta(p: GroupPlayerDto) {
  const parts: string[] = []
  if (p.role === 'ORGANIZER') parts.push('Organizer')
  if (p.membershipType === 'SUB') parts.push(`${skillWord(p.skillLevel)} sub`)
  if (p.userId) parts.push('account linked')
  const s = parts.join(', ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function reload() {
  api.invalidateCache(`/api/groups/${groupId.value}/players`)
  await league.load(groupId.value, true)
}

const busy = ref(false)
async function run(task: () => Promise<unknown>, done: string, failed: string) {
  busy.value = true
  try {
    await task()
    await reload()
    toast(done)
    return true
  } catch (e) {
    toast((e as { message?: string }).message || failed, 'bad')
    return false
  } finally {
    busy.value = false
  }
}

/**
 * Roster edits apply on screen at once and go through the outbox (so they also work offline).
 * If the server refuses one, say so and reload the roster from the server, which is the truth.
 */
function queueChange(apply: () => void, op: { key?: string; method: OutboxMethod; url: string; body?: unknown; label: string }, done: string, failed: string) {
  const gid = groupId.value
  apply()
  api.setCached(`/api/groups/${gid}/players`, { players: league.players })
  toast(done)
  const o = outbox.enqueue(op)
  void whenSettled(o).then(r => {
    // once the last roster change lands, take the server's roster (the truth) quietly
    if (r.ok) {
      if (groupId.value === gid && !outbox.ops.some(x => x.url.startsWith(`/api/groups/${gid}/players`))) void reload()
      return
    }
    outbox.discard(o.id)
    toast(r.error.message || failed, 'bad')
    if (groupId.value === gid) void reload()
  })
}

// ---- one player's sheet ----
// ?edit=<group player id> opens that player's sheet (linked from the profile page)
const activeId = ref<string | null>(typeof route.query.edit === 'string' ? route.query.edit : null)
const active = computed(() => league.players.find(p => p.id === activeId.value) ?? null)
const closeActive = () => { activeId.value = null }

function setMembership(p: GroupPlayerDto) {
  const next: MembershipType = p.membershipType === 'PERMANENT' ? 'SUB' : 'PERMANENT'
  queueChange(
    () => { p.membershipType = next },
    { key: `gp:${p.id}:membership`, method: 'PATCH', url: `/api/groups/${groupId.value}/players/${p.id}`, body: { membershipType: next }, label: `${p.displayName}: membership` },
    `${p.displayName} is now a ${next === 'SUB' ? 'sub' : 'regular'}`,
    'Membership not changed. Try again.'
  )
}

function setSkill(p: GroupPlayerDto, e: Event) {
  const skillLevel = (e.target as HTMLSelectElement).value as SkillLevel
  queueChange(
    () => { p.skillLevel = skillLevel },
    { key: `gp:${p.id}:skill`, method: 'PATCH', url: `/api/groups/${groupId.value}/players/${p.id}`, body: { skillLevel }, label: `${p.displayName}: skill level` },
    `Skill level set to ${skillWord(skillLevel)}`,
    'Skill level not saved. Try again.'
  )
}

async function setRole(p: GroupPlayerDto) {
  const promote = p.role !== 'ORGANIZER'
  if (!promote) {
    closeActive()
    const ok = await confirm({
      title: `Remove ${p.displayName} as organizer?`,
      body: 'They keep their stats but can no longer start events, enter scores, or manage players.',
      confirmLabel: 'Remove organizer role',
      danger: true
    })
    if (!ok) return
  }
  const role = promote ? 'ORGANIZER' : 'PLAYER'
  queueChange(
    () => { p.role = role },
    { key: `gp:${p.id}:role`, method: 'PATCH', url: `/api/groups/${groupId.value}/players/${p.id}`, body: { role }, label: `${p.displayName}: role` },
    promote ? `${p.displayName} is now an organizer` : `${p.displayName} is no longer an organizer`,
    'Role not changed. Try again.'
  )
}

const invite = ref<{ name: string; link: string } | null>(null)
async function makeInvite(p: GroupPlayerDto) {
  busy.value = true
  try {
    const token = await playersApi.generateInvite(p.playerId)
    closeActive()
    invite.value = { name: p.displayName, link: inviteUrl(window.location.origin, token) }
  } catch (e) {
    toast((e as { message?: string }).message || 'Invite link not created. Try again.', 'bad')
  } finally {
    busy.value = false
  }
}

async function unlink(p: GroupPlayerDto) {
  closeActive()
  const ok = await confirm({
    title: `Unlink ${p.displayName}'s account?`,
    body: 'Their stats stay. They lose access until they open a new invite link.',
    confirmLabel: 'Unlink account',
    danger: true
  })
  if (ok) await run(() => playersApi.unlinkPlayer(p.playerId), 'Account unlinked', 'Account not unlinked. Try again.')
}

async function remove(p: GroupPlayerDto) {
  closeActive()
  const ok = await confirm({
    title: `Remove ${p.displayName} from ${league.group?.name ?? 'this league'}?`,
    body: 'They leave the roster and rankings. Their past games stay in history.',
    confirmLabel: 'Remove from league',
    danger: true
  })
  if (!ok) return
  queueChange(
    () => { league.players = league.players.filter(x => x.id !== p.id) },
    { method: 'DELETE', url: `/api/groups/${groupId.value}/players/${p.id}`, label: `Remove ${p.displayName}` },
    `${p.displayName} removed`,
    'Player not removed. Try again.'
  )
}

// ---- add existing players ----
const addOpen = ref(false)
const library = ref<PlayerDto[] | null>(null)
const libraryError = ref('')
const addQuery = ref('')
const addAs = ref<MembershipType>('PERMANENT')
const addSkill = ref<SkillLevel>('INTERMEDIATE')
const picked = ref<Set<string>>(new Set())
const adding = ref(false)

const available = computed(() => {
  const inLeague = new Set(league.players.map(p => p.playerId))
  return findByName((library.value ?? []).filter(p => !inLeague.has(p.id)), addQuery.value)
})

async function loadLibrary() {
  libraryError.value = ''
  try {
    library.value = (await playersApi.list()).players
  } catch (e) {
    libraryError.value = (e as { message?: string }).message || 'Your player list did not load.'
  }
}

function openAdd() {
  picked.value = new Set()
  addQuery.value = ''
  addAs.value = 'PERMANENT'
  addSkill.value = 'INTERMEDIATE'
  addOpen.value = true
  library.value = null
  void loadLibrary()
}

function pick(id: string) {
  const next = new Set(picked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked.value = next
}

async function addPicked() {
  if (!picked.value.size || adding.value) return
  adding.value = true
  try {
    const res = await groupsApi.bulkAddPlayers(groupId.value, {
      players: [...picked.value].map(playerId => ({
        playerId,
        membershipType: addAs.value,
        skillLevel: addAs.value === 'SUB' ? addSkill.value : undefined
      }))
    })
    addOpen.value = false
    await reload()
    toast(`${count(res.added.length)} added`)
  } catch (e) {
    toast((e as { message?: string }).message || 'Players not added. Try again.', 'bad')
  } finally {
    adding.value = false
  }
}

// ---- create new ----
const createOpen = ref(false)
function openCreate() {
  addOpen.value = false
  createOpen.value = true
}
</script>

<template>
  <div class="page">
    <UiState v-if="league.loading && !league.group" kind="loading" title="Loading roster" />
    <UiState
      v-else-if="league.error?.status === 403 || league.error?.status === 404"
      heading="h1"
      kind="denied"
      title="This league isn't available to you"
      body="It may have been archived, or your account isn't on its roster."
      action-label="See your leagues"
      action-to="/groups"
    />
    <UiState v-else-if="league.error" heading="h1" kind="error" title="Roster didn't load" :body="league.error.message" @retry="league.load(groupId, true)" />
    <UiState
      v-else-if="league.group && !league.isOrganizer"
      heading="h1"
      kind="denied"
      title="Only organizers manage players"
      body="Ask a league organizer to add players or change the roster."
      action-label="Back to league"
      :action-to="`/groups/${groupId}`"
    />

    <template v-else-if="league.group">
      <PageHeader title="Players" :back-to="`/groups/${groupId}`" :back-label="league.group.name">
        <template #actions><AccountButton /></template>
      </PageHeader>

      <UiState
        v-if="!league.players.length"
        kind="empty"
        title="No players yet"
        body="Add the people who play in this league. Regulars play most weeks; subs fill in."
        action-label="Add players"
        @action="openAdd"
      />

      <template v-else>
        <div class="search">
          <Search :size="18" aria-hidden="true" class="search__icon" />
          <label for="roster-search" class="visually-hidden">Find a player</label>
          <input id="roster-search" v-model="query" type="search" placeholder="Find a player" autocomplete="off" enterkeyhint="search">
        </div>

        <p v-if="!sections.length" class="muted" role="status">No one named "{{ query }}".</p>

        <section v-for="s in sections" :key="s.key" class="section" :aria-labelledby="`h-${s.key}`">
          <h2 :id="`h-${s.key}`" class="sec-h">{{ s.title }} <span class="num muted">{{ s.list.length }}</span></h2>
          <ul role="list" class="list">
            <li v-for="p in s.list" :key="p.id">
              <button type="button" class="prow" @click="activeId = p.id">
                <span class="prow__text">
                  <span class="prow__name truncate">{{ p.displayName }}</span>
                  <span v-if="meta(p)" class="prow__meta truncate muted">{{ meta(p) }}</span>
                </span>
                <span class="prow__rating num">{{ Math.round(p.rating) }}</span>
                <ChevronRight :size="18" aria-hidden="true" class="muted" />
              </button>
            </li>
          </ul>
        </section>
      </template>

      <ActionBar above-tabs>
        <template #meta>{{ count(league.players.length) }}: {{ count(league.players.length - subCount, 'regular') }}, {{ count(subCount, 'sub') }}.</template>
        <UiButton variant="primary" size="lg" @click="openAdd">Add players</UiButton>
      </ActionBar>
    </template>

    <!-- one player -->
    <UiSheet :open="!!active" :title="active?.displayName ?? ''" :description="active ? meta(active) || undefined : undefined" @close="closeActive">
      <div v-if="active" class="acts">
        <RouterLink :to="`/groups/${groupId}/players/${active.id}`" class="profile-link">
          <span>View stats and rating</span>
          <ChevronRight :size="18" aria-hidden="true" />
        </RouterLink>

        <div class="acts__group">
          <h3>Membership</h3>
          <p class="muted small">{{ active.membershipType === 'SUB' ? 'Sub. Fills in when regulars are out.' : 'Regular. Picked by default for events.' }}</p>
          <UiButton block :loading="busy" @click="setMembership(active)">
            {{ active.membershipType === 'SUB' ? 'Make regular' : 'Make sub' }}
          </UiButton>
          <div v-if="active.membershipType === 'SUB'" class="field">
            <label for="skill">Skill level</label>
            <select id="skill" :value="active.skillLevel ?? 'INTERMEDIATE'" :disabled="busy" @change="setSkill(active, $event)">
              <option v-for="s in SKILL_LEVELS" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <p class="muted small">Shifts a sub's rating when balancing teams.</p>
          </div>
        </div>

        <div class="acts__group">
          <h3>Account</h3>
          <p class="muted small">{{ active.userId ? 'Linked. They can see their own stats.' : 'Not linked. Send an invite link so they can see their stats.' }}</p>
          <UiButton v-if="!active.userId" block :loading="busy" @click="makeInvite(active)">Create invite link</UiButton>
          <UiButton v-else block :disabled="busy" @click="unlink(active)">Unlink account</UiButton>
          <UiButton block :disabled="busy" @click="setRole(active)">
            {{ active.role === 'ORGANIZER' ? 'Remove organizer role' : 'Make organizer' }}
          </UiButton>
        </div>

        <UiButton variant="danger" block :disabled="busy" @click="remove(active)">Remove from league</UiButton>
      </div>
    </UiSheet>

    <!-- add existing -->
    <UiSheet :open="addOpen" title="Add players" description="Pick people from your player list." @close="addOpen = false">
      <div class="add">
        <fieldset class="add__as">
          <legend>Add as</legend>
          <div class="seg" role="group" aria-label="Membership">
            <button type="button" class="seg__btn" :aria-pressed="addAs === 'PERMANENT'" @click="addAs = 'PERMANENT'">Regulars</button>
            <button type="button" class="seg__btn" :aria-pressed="addAs === 'SUB'" @click="addAs = 'SUB'">Subs</button>
          </div>
          <div v-if="addAs === 'SUB'" class="field">
            <label for="add-skill">Skill level for these subs</label>
            <select id="add-skill" v-model="addSkill">
              <option v-for="s in SKILL_LEVELS" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
        </fieldset>

        <div class="search">
          <Search :size="18" aria-hidden="true" class="search__icon" />
          <label for="add-search" class="visually-hidden">Find in your player list</label>
          <input id="add-search" v-model="addQuery" type="search" placeholder="Find in your player list" autocomplete="off" enterkeyhint="search">
        </div>

        <UiState v-if="libraryError" kind="error" title="Player list didn't load" :body="libraryError" @retry="loadLibrary" />
        <UiState v-else-if="!library" kind="loading" title="Loading your player list" />
        <p v-else-if="!available.length" class="muted">
          {{ addQuery ? `No one named "${addQuery}" outside this league.` : 'Everyone in your player list is already in this league.' }}
        </p>
        <ul v-else role="list" class="list">
          <li v-for="p in available" :key="p.id">
            <label class="pick" :class="{ 'pick--on': picked.has(p.id) }">
              <input type="checkbox" :checked="picked.has(p.id)" @change="pick(p.id)">
              <span class="pick__box" aria-hidden="true"><Check v-if="picked.has(p.id)" :size="18" /></span>
              <span class="pick__text">
                <span class="truncate pick__name">{{ p.displayName }}</span>
                <span v-if="p.notes" class="truncate muted small">{{ p.notes }}</span>
              </span>
            </label>
          </li>
        </ul>
      </div>
      <template #actions>
        <UiButton variant="primary" size="lg" block :loading="adding" :disabled="!picked.size" @click="addPicked">
          {{ picked.size ? `Add ${count(picked.size)} as ${addAs === 'SUB' ? 'subs' : 'regulars'}` : 'Pick players to add' }}
        </UiButton>
        <UiButton variant="quiet" size="lg" block @click="openCreate">Create new players</UiButton>
      </template>
    </UiSheet>

    <BulkPlayerCreateModal v-model:open="createOpen" :group-id="groupId" @success="reload" />
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

.sec-h { font-size: var(--text-md); display: flex; gap: var(--s2); align-items: baseline; }
.list { display: flex; flex-direction: column; min-width: 0; }

.prow {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 56px;
  padding: var(--s1) var(--s1);
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  text-align: left;
}
.prow:hover { background: var(--surface-sunk); }
.prow__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.prow__name { font-weight: 700; }
.prow__meta { font-size: var(--text-sm); }
.prow__rating { font-size: var(--text-lg); flex: none; }

.small { font-size: var(--text-sm); }

.acts { display: flex; flex-direction: column; gap: var(--s5); }
.acts__group { display: flex; flex-direction: column; gap: var(--s2); }
.profile-link {
  display: flex; align-items: center; justify-content: space-between;
  min-height: var(--tap);
  font-weight: 700;
  text-decoration: none;
}
.field { display: flex; flex-direction: column; gap: var(--s1); }
.field label { font-weight: 700; font-size: var(--text-sm); }
select {
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--ink);
}

.add { display: flex; flex-direction: column; gap: var(--s4); }
.add__as { border: 0; padding: 0; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: var(--s2); }
legend { font-weight: 700; font-size: var(--text-sm); padding: 0; margin-bottom: var(--s1); }
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
.pick__box {
  width: 26px; height: 26px; flex: none;
  display: grid; place-items: center;
  border: 2px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface);
}
.pick--on .pick__box { background: var(--court); border-color: var(--court); color: var(--on-court); }
.pick__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pick--on .pick__name { font-weight: 700; }
.pick:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: -3px; border-radius: 6px; }
</style>
